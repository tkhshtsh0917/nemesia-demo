/** Compares the published CLI and WASM ABI using an identical generated index. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const cli = process.argv[2];
if (!cli) throw new Error("Usage: node tools/verify-wasm.ts CLI");
const root = "public/generated";
const manifest = JSON.parse(readFileSync(join(root, "current.json"), "utf8"));
const indexPath = join(root, manifest.index.file);
const {
  default: init,
  abi_version,
  CompletionIndex,
} = await import("../src/generated/nemesia_wasm.js");
await init({
  module_or_path: readFileSync("src/generated/nemesia_wasm_bg.wasm"),
});
assert.equal(abi_version(), 1);
assert.throws(() => new CompletionIndex(new Uint8Array(40)));
const index = new CompletionIndex(readFileSync(indexPath));
const samples = [
  ["bi", undefined],
  ["びーt", "bi-t"],
  ["にh", "nih"],
  ["世界", undefined],
  ["きょう", undefined],
  ["", undefined],
] as const;
for (const [query, derived] of samples) {
  const args = ["suggest", "--index", indexPath, "--query", query];
  if (derived !== undefined) args.push("--derived", derived);
  const expected = JSON.parse(execFileSync(cli, args, { encoding: "utf8" }));
  assert.deepEqual(JSON.parse(index.complete(query, derived, 8)), expected);
}
assert.throws(() => index.complete("x".repeat(129), undefined, 8));
assert.match(index.complete("bi-t", undefined, 8), /ビート/);
assert.match(index.complete("びーと", undefined, 8), /ビート/);
assert.match(
  index.complete("niho", undefined, 8),
  /"text":"日本","distance":0/,
);
index.free();
assert.throws(() => index.complete("bi-t", undefined, 8));
