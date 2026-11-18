/** Stages the document projection and publishes only checked completion assets. */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import documents from "../../data/documents.json" with { type: "json" };

const [cli, dictionary] = process.argv.slice(2);
if (!cli || !dictionary || process.argv.length !== 4) {
  throw new Error("Usage: node tools/data/prepare.ts CLI DICTIONARY");
}
const work = mkdtempSync(join(tmpdir(), "nemesia-data-"));
const destination = "public/generated";

function digest(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function publish(asset: Buffer, suffix: string) {
  const sha256 = digest(asset);
  const file = sha256 + suffix;
  writeFileSync(join(destination, file), asset);
  return { file, sha256, bytes: asset.length };
}

try {
  const path = (name: string) => join(work, name);
  const input = path("documents.jsonl");
  const candidates = path("candidates.jsonl");
  const index = path("index.nmsi");
  const rules = path("rules.json");
  const stats = path("term-stats.jsonl");
  const provenance = path("extraction.json");
  writeFileSync(
    input,
    `${documents.map((row) => JSON.stringify(row)).join("\n")}\n`,
  );
  execFileSync(
    cli,
    [
      "extract",
      "--input",
      input,
      "--dictionary",
      dictionary,
      "--policy",
      "data/corpus-policy.json",
      "--output",
      candidates,
      "--query-rules",
      rules,
      "--stats",
      stats,
      "--provenance",
      provenance,
    ],
    { stdio: "inherit" },
  );
  execFileSync(cli, ["build", "--input", candidates, "--output", index], {
    stdio: "inherit",
  });
  const inspected = JSON.parse(
    execFileSync(cli, ["inspect", "--index", index], { encoding: "utf8" }),
  );
  if (inspected.version !== 1 || !inspected.candidates)
    throw new Error("Invalid demo index");

  mkdirSync(destination, { recursive: true });
  mkdirSync("artifacts/data", { recursive: true });
  const metadata = JSON.parse(readFileSync(provenance, "utf8"));
  const indexPin = publish(readFileSync(index), ".nmsi");
  const rulePin = publish(readFileSync(rules), ".json");
  const manifest = {
    format: "nemesia-data/1",
    abi: 1,
    normalization: 1,
    generation: digest(
      Buffer.from(
        JSON.stringify([indexPin.sha256, rulePin.sha256, metadata.inputSha256]),
      ),
    ),
    index: indexPin,
    rules: rulePin,
    corpusSha256: metadata.inputSha256,
    policySha256: metadata.policySha256,
    dictionarySha256: metadata.dictionarySha256,
  };
  writeFileSync(
    join(destination, "current.tmp"),
    `${JSON.stringify(manifest)}\n`,
  );
  renameSync(
    join(destination, "current.tmp"),
    join(destination, "current.json"),
  );

  for (const source of [input, candidates, stats, provenance]) {
    const name = source.slice(work.length + 1);
    writeFileSync(join("artifacts/data", name), readFileSync(source));
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
