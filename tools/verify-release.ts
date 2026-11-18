/** Checks the release bundle before running any delivered executable. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [directory, tag] = process.argv.slice(2);
if (!directory || !tag || !/^v\d+\.\d+\.\d+$/.test(tag))
  throw new Error("Expected bundle directory and exact stable tag");
const platform =
  process.platform === "darwin" && process.arch === "arm64"
    ? "macos-aarch64"
    : process.platform === "linux" && process.arch === "x64"
      ? "linux-x86_64"
      : undefined;
if (!platform) throw new Error("Unsupported CLI platform");
const cli = `nemesia-${platform}`;
const caps = new Map([
  [cli, 16_777_216],
  ["nemesia-abi.json", 4096],
  ["nemesia_wasm.wasm", 4_194_304],
  ["nemesia-licenses.tar.gz", 4_194_304],
  ["nemesia-rustdoc.tar.gz", 16_777_216],
]);
const path = (name: string) => join(directory, name);
if (statSync(path("SHA256SUMS")).size > 8192)
  throw new Error("Checksum list too large");
const hashes = new Map<string, string>();
for (const line of readFileSync(path("SHA256SUMS"), "utf8")
  .trimEnd()
  .split("\n")) {
  const match = /^([a-f0-9]{64}) {2}([a-zA-Z0-9_.-]+)$/.exec(line);
  if (!match || hashes.has(match[2]))
    throw new Error("Malformed checksum list");
  hashes.set(match[2], match[1]);
}

const pin = { tag, assets: {} as Record<string, string> };
for (const [name, max] of caps) {
  if (statSync(path(name)).size > max)
    throw new Error(`Asset too large: ${name}`);
  const actual = createHash("sha256")
    .update(readFileSync(path(name)))
    .digest("hex");
  if (actual !== hashes.get(name))
    throw new Error(`Asset checksum mismatch: ${name}`);
  pin.assets[name] = actual;
}

const meta = JSON.parse(readFileSync(path("nemesia-abi.json"), "utf8"));
assert.deepEqual(meta, {
  abi: 1,
  index: 1,
  normalization: 1,
  wasmBindgen: "0.2.129",
});
chmodSync(path(cli), 0o755);
assert.equal(
  execFileSync(path(cli), ["--version"], { encoding: "utf8" }).trim(),
  `nemesia ${tag.slice(1)}`,
);
writeFileSync(path("release.lock.json"), `${JSON.stringify(pin, null, 2)}\n`);
