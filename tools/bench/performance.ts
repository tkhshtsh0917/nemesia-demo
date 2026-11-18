/** Measures packaged WASM and browser input/render latency using the same trace. */
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir, version } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { type BrowserType, chromium, firefox, webkit } from "@playwright/test";
import {
  CompletionIndex,
  default as init,
} from "../../src/generated/nemesia_wasm.js";
import { corpus, summarize, trace } from "./workload.ts";

const cli = process.argv[2];
if (!cli) throw new Error("Usage: node tools/bench/performance.ts CLI");
const workload = trace(200);
const env = {
  platform: process.platform,
  arch: process.arch,
  node: process.version,
  system: version(),
  cli: execFileSync(cli, ["--version"], { encoding: "utf8" }).trim(),
  seed: 123456789,
};
const rawWasm = readFileSync("src/generated/nemesia_wasm_bg.wasm");
await init({ module_or_path: rawWasm });
const work = mkdtempSync(join(tmpdir(), "nemesia-bench-"));
const base = "http://127.0.0.1:4199/nemesia-demo/";
const report = [];
const digest = (bytes: string | Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");

async function measureBrowser(engine: BrowserType) {
  const browser = await engine.launch();
  try {
    const page = await browser.newPage();
    const start = performance.now();
    await page.goto(base);
    await page.getByRole("status").getByText("補完できます。").waitFor();
    const readyMs = performance.now() - start;
    const results = await page.evaluate(async (items) => {
      const input = document.querySelector("input");
      if (!input) throw new Error("input unavailable");
      input.focus();
      const measured = [];
      for (const item of [...items.slice(0, 20), ...items]) {
        const result = new Promise<{
          inputMs: number;
          wasmMs: number;
          workerMs: number;
        }>((resolve, reject) => {
          const controller = new AbortController();
          const timer = setTimeout(() => {
            controller.abort();
            reject(new Error("query exceeded render deadline"));
          }, 3000);
          window.addEventListener(
            "nemesia:render",
            (event) => {
              clearTimeout(timer);
              resolve((event as CustomEvent).detail);
            },
            { once: true, signal: controller.signal },
          );
        });
        input.value = item.query;
        input.setSelectionRange(input.value.length, input.value.length);
        input.dispatchEvent(new Event("input"));
        measured.push({ kind: item.kind, ...(await result) });
      }
      return measured.slice(20);
    }, workload);
    return {
      browser: browser.version(),
      readyMs,
      groups: ["exact", "fuzzy"].map((kind) => {
        const group = results.filter((row) => row.kind === kind);
        return {
          kind,
          input: summarize(group.map((row) => row.inputMs)),
          wasm: summarize(group.map((row) => row.wasmMs)),
          worker: summarize(group.map((row) => row.workerMs)),
        };
      }),
    };
  } finally {
    await browser.close();
  }
}

try {
  for (const count of [10_000, 100_000]) {
    const path = join(work, String(count));
    mkdirSync(path);
    const input = join(path, "candidates.jsonl");
    const index = join(path, "fixture.nmsi");
    const rows = corpus(count);
    writeFileSync(input, rows);
    const buildStart = performance.now();
    execFileSync(cli, ["build", "--input", input, "--output", index]);
    const buildMs = performance.now() - buildStart;
    const bytes = readFileSync(index);
    const wasmOpenStart = performance.now();
    const handle = new CompletionIndex(bytes);
    const wasmOpenMs = performance.now() - wasmOpenStart;
    for (const { query } of workload.slice(0, 8)) {
      const expected = execFileSync(
        cli,
        ["suggest", "--index", index, "--query", query],
        { encoding: "utf8" },
      );
      assert.deepEqual(
        JSON.parse(handle.complete(query, undefined, 8)),
        JSON.parse(expected),
      );
    }

    const samples: { kind: string; ms: number }[] = [];
    for (let run = 0; run < 3; run++) {
      for (const { kind, query } of workload) {
        const start = performance.now();
        handle.complete(query, undefined, 8);
        samples.push({ kind, ms: performance.now() - start });
      }
    }
    handle.free();
    const site = join(path, "site");
    cpSync("dist", site, { recursive: true });
    const generated = join(site, "generated");
    const manifest = JSON.parse(
      readFileSync(join(generated, "current.json"), "utf8"),
    );
    const sha256 = digest(bytes);
    const file = `${sha256}.nmsi`;
    manifest.generation = sha256;
    manifest.index = { file, sha256, bytes: bytes.length };
    writeFileSync(join(generated, file), bytes);
    writeFileSync(join(generated, "current.json"), JSON.stringify(manifest));

    const server = spawn(process.execPath, ["tools/serve-preview.ts"], {
      env: { ...process.env, NEMESIA_PREVIEW_DIR: site, NEMESIA_PORT: "4199" },
      stdio: "inherit",
    });
    try {
      for (let i = 0; i < 100; i++) {
        if (
          await fetch(base).then(
            (r) => r.ok,
            () => false,
          )
        )
          break;
        if (i === 99) throw new Error("preview did not start");
        await new Promise((resolve) => setTimeout(resolve, 30));
      }
      const browsers = process.env.NEMESIA_NODE_ONLY
        ? {}
        : {
            chromium: await measureBrowser(chromium),
            firefox: await measureBrowser(firefox),
            webkit: await measureBrowser(webkit),
          };
      const results = {
        count,
        inputSha256: digest(rows),
        sha256,
        bytes: bytes.length,
        gzipBytes: gzipSync(bytes).length,
        buildMs,
        wasmOpenMs,
        node: ["exact", "fuzzy"].map((kind) => ({
          kind,
          ...summarize(
            samples.filter((row) => row.kind === kind).map((row) => row.ms),
          ),
        })),
        browsers,
      };
      report.push(results);
      console.log(JSON.stringify(results));
    } finally {
      server.kill();
      if (server.exitCode === null && server.signalCode === null)
        await new Promise<void>((resolve) =>
          server.once("exit", () => resolve()),
        );
    }
  }
  mkdirSync("artifacts/bench", { recursive: true });
  writeFileSync(
    "artifacts/bench/performance.json",
    JSON.stringify(
      {
        env,
        wasm: {
          sha256: digest(rawWasm),
          bytes: rawWasm.length,
          gzipBytes: gzipSync(rawWasm).length,
        },
        report,
      },
      null,
      2,
    ),
  );
} finally {
  rmSync(work, { recursive: true, force: true });
}
