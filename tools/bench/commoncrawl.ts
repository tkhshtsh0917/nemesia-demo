/** Compares local Common Crawl indexes through the released WASM and demo Worker. */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { cpus, tmpdir, version } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";
import { chromium, firefox, webkit } from "@playwright/test";
import evaluation from "../../data/commoncrawl-evaluation.json" with {
  type: "json",
};
import {
  CompletionIndex,
  default as init,
} from "../../src/generated/nemesia_wasm.js";
import { mixedRomaji, readRules } from "../../src/worker/romaji.ts";
import { measureBrowser } from "./browser.ts";
import { summarize } from "./workload.ts";

type IndexBuild = {
  count: number;
  file: string;
  sha256: string;
  bytes: number;
};
type Ranked = { kind: string; rank: number; error: boolean };

const source = process.argv[2];
if (!source || process.argv.length !== 3)
  throw new Error("Usage: node tools/bench/commoncrawl.ts OUTPUT_DIRECTORY");
const base = "http://127.0.0.1:4200/nemesia-demo/";
const digest = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const file = (name: string) => readFileSync(join(source, name));
const provenance = JSON.parse(file("corpus.json").toString("utf8"));
const wasm = readFileSync("src/generated/nemesia_wasm_bg.wasm");
const rulesBytes = file("rules.json");
const rules = readRules(JSON.parse(rulesBytes.toString("utf8")));
const expectedSizes = [10_000, 50_000, 100_000];
if (
  (provenance.indexes as IndexBuild[]).map(({ count }) => count).join() !==
    expectedSizes.join() ||
  digest(rulesBytes) !== provenance.rulesSha256
)
  throw new Error("expected three checked 10k, 50k and 100k indexes");

function scores(rows: Ranked[]) {
  const hits = rows.filter(({ rank }) => rank > 0);
  return {
    queries: rows.length,
    hits: hits.length,
    recallAt8: hits.length / rows.length,
    mrrAt8: hits.reduce((total, { rank }) => total + 1 / rank, 0) / rows.length,
    top1: hits.filter(({ rank }) => rank === 1).length / rows.length,
    queryErrors: rows.filter(({ error }) => error).length,
  };
}

function measureWasm(bytes: Uint8Array) {
  const first = performance.now();
  const handle = new CompletionIndex(bytes);
  const openMs = performance.now() - first;
  const queries = evaluation.map((item) => ({
    ...item,
    derived: mixedRomaji(item.query, rules),
  }));

  try {
    const quality = queries.map((item) => {
      try {
        const hits = JSON.parse(
          handle.complete(item.query, item.derived, 8),
        ) as {
          text: string;
        }[];
        return {
          ...item,
          rank: hits.findIndex(({ text }) => text === item.expected) + 1,
          error: false,
        };
      } catch {
        return { ...item, rank: 0, error: true };
      }
    });

    const times = [];
    for (let pass = 0; pass < 5; pass++) {
      for (const { query, derived } of queries) {
        const start = performance.now();
        handle.complete(query, derived, 8);
        times.push(performance.now() - start);
      }
    }

    return {
      openMs,
      warmed: summarize(times),
      all: scores(quality),
      groups: Object.fromEntries(
        [...new Set(quality.map(({ kind }) => kind))].map((kind) => [
          kind,
          scores(quality.filter((row) => row.kind === kind)),
        ]),
      ),
      rows: quality,
    };
  } finally {
    handle.free();
  }
}

function stage(site: string, bytes: Buffer, sha256: string) {
  const directory = join(site, "generated");
  const indexName = `${sha256}.nmsi`;
  const rulesName = `${provenance.rulesSha256}.json`;
  writeFileSync(join(directory, indexName), bytes);
  writeFileSync(join(directory, rulesName), rulesBytes);
  writeFileSync(
    join(directory, "current.json"),
    JSON.stringify({
      format: "nemesia-data/1",
      abi: 1,
      normalization: 1,
      generation: sha256,
      index: { file: indexName, sha256, bytes: bytes.length },
      rules: {
        file: rulesName,
        sha256: provenance.rulesSha256,
        bytes: rulesBytes.length,
      },
    }),
  );
}

async function waitForPreview() {
  for (let retry = 0; retry < 100; retry++) {
    const response = await fetch(base).catch(() => undefined);
    if (response?.ok) {
      await response.body?.cancel();
      return;
    }
    await delay(30);
  }
  throw new Error("preview did not start");
}

async function run() {
  await init({ module_or_path: wasm });
  const work = mkdtempSync(join(tmpdir(), "nemesia-commoncrawl-"));
  const site = join(work, "site");
  cpSync("dist", site, { recursive: true });
  const server = spawn(process.execPath, ["tools/serve-preview.ts"], {
    env: { ...process.env, NEMESIA_PREVIEW_DIR: site, NEMESIA_PORT: "4200" },
    stdio: "inherit",
  });
  try {
    await waitForPreview();
    const comparisons = [];
    for (const {
      count,
      file: name,
      sha256,
      bytes: expected,
    } of provenance.indexes as IndexBuild[]) {
      if (name !== `${count}.nmsi`)
        throw new Error("unexpected index filename");
      const bytes = file(name);
      if (bytes.length !== expected || digest(bytes) !== sha256)
        throw new Error("index hash or size mismatch");

      const node = measureWasm(bytes);
      stage(site, bytes, sha256);
      const browsers = [];
      for (const engine of [chromium, firefox, webkit]) {
        const result = await measureBrowser(engine, base, evaluation, 3);
        browsers.push({ engine: engine.name(), ...result });
      }
      const result = {
        count,
        sha256,
        bytes: bytes.length,
        gzipBytes: gzipSync(bytes).length,
        brotliBytes: brotliCompressSync(bytes, {
          params: { [constants.BROTLI_PARAM_QUALITY]: 5 },
        }).length,
        node,
        browsers,
      };
      comparisons.push(result);
      console.log(
        JSON.stringify({ count, bytes: result.bytes, quality: node.all }),
      );
    }
    const report = {
      environment: {
        platform: process.platform,
        arch: process.arch,
        node: process.version,
        system: version(),
        cpu: cpus()[0]?.model,
        wasmSha256: digest(wasm),
        evaluationSha256: digest(
          readFileSync("data/commoncrawl-evaluation.json"),
        ),
      },
      comparisons,
    };
    writeFileSync(
      join(source, "benchmark.json"),
      `${JSON.stringify(report, null, 2)}\n`,
    );
  } finally {
    server.kill();
    if (server.exitCode === null && server.signalCode === null)
      await new Promise<void>((resolve) =>
        server.once("exit", () => resolve()),
      );
    rmSync(work, { recursive: true, force: true });
  }
}

await run();
