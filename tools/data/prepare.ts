/** Compiles the pinned vocabulary and stages a content-addressed Pages generation. */
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
import { gunzipSync } from "node:zlib";

const [cli] = process.argv.slice(2);
if (!cli || process.argv.length !== 3)
  throw new Error("Usage: node tools/data/prepare.ts CLI");

const root = "data/commoncrawl-demo";
const metadata = readFileSync(join(root, "snapshot.json"));
const snapshot = JSON.parse(metadata.toString("utf8"));
const archive = readFileSync(join(root, "candidates.jsonl.gz"));
const rules = readFileSync(join(root, "rules.json"));
const corpus = readFileSync(join(root, "corpus.json"));
const maxIndex = 32 * 1024 * 1024;

function digest(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

if (
  snapshot.format !== "nemesia-commoncrawl-demo/1" ||
  digest(archive) !== snapshot.archiveSha256 ||
  digest(rules) !== snapshot.rulesSha256 ||
  digest(corpus) !== snapshot.corpusReportSha256
) {
  throw new Error("invalid demo vocabulary snapshot");
}

const candidates = gunzipSync(archive, { maxOutputLength: maxIndex });
if (digest(candidates) !== snapshot.candidateSha256)
  throw new Error("decoded vocabulary differs from the snapshot");

mkdirSync("public", { recursive: true });
mkdirSync("artifacts", { recursive: true });
const staging = mkdtempSync(join("artifacts", "stage-data-"));
const work = mkdtempSync(join(tmpdir(), "nemesia-data-"));

function publish(bytes: Buffer, suffix: string) {
  const sha256 = digest(bytes);
  const file = sha256 + suffix;
  writeFileSync(join(staging, file), bytes);
  return { file, sha256, bytes: bytes.length };
}

try {
  const input = join(work, "candidates.jsonl");
  const index = join(work, "index.nmsi");
  writeFileSync(input, candidates);
  execFileSync(cli, ["build", "--input", input, "--output", index], {
    stdio: "inherit",
  });

  const inspected = JSON.parse(
    execFileSync(cli, ["inspect", "--index", index], { encoding: "utf8" }),
  );
  if (inspected.version !== 1 || inspected.candidates !== snapshot.count)
    throw new Error("compiled candidate count or index version differs");

  const indexPin = publish(readFileSync(index), ".nmsi");
  const rulePin = publish(rules, ".json");
  const snapshotSha256 = digest(metadata);
  const generation = digest(
    Buffer.from(
      JSON.stringify([indexPin.sha256, rulePin.sha256, snapshotSha256]),
    ),
  );
  const manifest = {
    format: "nemesia-data/1",
    abi: 1,
    normalization: 1,
    generation,
    index: indexPin,
    rules: rulePin,
    corpusSha256: snapshotSha256,
    vocabulary: { crawl: snapshot.crawl, count: snapshot.count },
  };
  writeFileSync(join(staging, "current.json"), `${JSON.stringify(manifest)}\n`);

  rmSync("public/generated", { recursive: true, force: true });
  renameSync(staging, "public/generated");
} finally {
  rmSync(staging, { recursive: true, force: true });
  rmSync(work, { recursive: true, force: true });
}
