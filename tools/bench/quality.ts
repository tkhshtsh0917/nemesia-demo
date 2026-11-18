/** Compares both corpus priors against the same fixed, human-labelled requests. */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Suggestion } from "../../src/types.ts";
import { mixedRomaji, readRules } from "../../src/worker/romaji.ts";
import policy from "./fixtures/corpus-policy.json" with { type: "json" };
import documents from "./fixtures/documents.json" with { type: "json" };
import cases from "./fixtures/quality.json" with { type: "json" };

const [cli, dictionary] = process.argv.slice(2);
if (!cli || !dictionary)
  throw new Error("Usage: node tools/bench/quality.ts CLI DICTIONARY");
const work = mkdtempSync(join(tmpdir(), "nemesia-quality-"));
const input = join(work, "documents.jsonl");
function run(args: string[]) {
  return execFileSync(cli, args, { encoding: "utf8" });
}

try {
  writeFileSync(
    input,
    `${documents.map((row) => JSON.stringify(row)).join("\n")}\n`,
  );
  const report = [];
  for (const ranking of ["df", "bm25-sum"]) {
    const path = (name: string) => join(work, `${ranking}-${name}`);
    const config = path("policy.json");
    const candidates = path("candidates.jsonl");
    const index = path("index.nmsi");
    const rules = path("rules.json");
    const metadata = path("provenance.json");
    writeFileSync(config, JSON.stringify({ ...policy, ranking }));
    run([
      "extract",
      "--input",
      input,
      "--dictionary",
      dictionary,
      "--policy",
      config,
      "--output",
      candidates,
      "--query-rules",
      rules,
      "--provenance",
      metadata,
    ]);
    run(["build", "--input", candidates, "--output", index]);
    const romanization = readRules(JSON.parse(readFileSync(rules, "utf8")));
    const results = cases.map((row) => {
      const args = ["suggest", "--index", index, "--query", row.query];
      const derived = mixedRomaji(row.query, romanization);
      if (derived) args.push("--derived", derived);
      const hits: Suggestion[] = JSON.parse(run(args));
      const rank = hits.findIndex((hit) => hit.text === row.expected) + 1;
      return { ...row, rank, first: hits[0]?.text ?? null };
    });
    const buckets = ["all", "clean", "reading", "typo"].map((kind) => {
      const group =
        kind === "all" ? results : results.filter((row) => row.kind === kind);
      return {
        kind,
        count: group.length,
        recall: group.filter((row) => row.rank > 0).length / group.length,
        mrr:
          group.reduce((sum, row) => sum + (row.rank ? 1 / row.rank : 0), 0) /
          group.length,
        top1: group.filter((row) => row.rank === 1).length / group.length,
      };
    });
    report.push({
      ranking,
      provenance: JSON.parse(readFileSync(metadata, "utf8")),
      buckets,
      results,
    });
  }
  mkdirSync("artifacts/bench", { recursive: true });
  writeFileSync(
    "artifacts/bench/quality.json",
    JSON.stringify(
      {
        labelsSha256: createHash("sha256")
          .update(readFileSync("tools/bench/fixtures/quality.json"))
          .digest("hex"),
        report,
      },
      null,
      2,
    ),
  );
  for (const entry of report) console.log(entry.ranking, entry.buckets);
} finally {
  rmSync(work, { recursive: true, force: true });
}
