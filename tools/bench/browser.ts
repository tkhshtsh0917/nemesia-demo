/** Measures the production Worker and render path on a fixed browser trace. */
import type { BrowserType, Page } from "@playwright/test";
import { summarize } from "./workload.ts";

export async function measureBrowser(
  engine: BrowserType,
  base: string,
  workload: { kind: string; query: string }[],
  coldLoads = 1,
) {
  const browser = await engine.launch();
  try {
    const readiness = [];
    for (let run = 1; run < coldLoads; run++) {
      const cold = await browser.newPage();
      readiness.push(await measureReady(cold, base));
      await cold.close();
    }
    const page = await browser.newPage();
    const readyMs = await measureReady(page, base);
    readiness.push(readyMs);
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
      coldReadyMs: readiness,
      all: timings(results),
      groups: [...new Set(workload.map(({ kind }) => kind))].map((kind) => {
        const group = results.filter((row) => row.kind === kind);
        return { kind, ...timings(group) };
      }),
    };
  } finally {
    await browser.close();
  }
}

async function measureReady(page: Page, base: string) {
  const start = performance.now();
  await page.goto(base);
  await page.getByRole("status").getByText("補完できます。").waitFor();
  return performance.now() - start;
}

function timings(
  rows: { inputMs: number; wasmMs: number; workerMs: number }[],
) {
  return {
    input: summarize(rows.map((row) => row.inputMs)),
    wasm: summarize(rows.map((row) => row.wasmMs)),
    worker: summarize(rows.map((row) => row.workerMs)),
  };
}
