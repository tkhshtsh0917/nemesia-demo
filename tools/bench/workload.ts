/** Creates a reproducible corpus and labelled exact/fuzzy request groups. */
export function corpus(count: number): string {
  return `${Array.from({ length: count }, (_, id) => {
    const key = (id % 1296).toString(36).padStart(2, "0");
    return JSON.stringify({
      id,
      weight: (id * 113) % 97,
      text: `${key}-atlas-${id.toString(36).padStart(4, "0")}`,
    });
  }).join("\n")}\n`;
}

export function trace(count: number, seed = 123456789) {
  return Array.from({ length: count }, (_, i) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const key = (seed % 1296).toString(36).padStart(2, "0");
    const kind = i % 2 === 0 ? "exact" : "fuzzy";
    return { kind, query: kind === "exact" ? key : `${key}-atlz` };
  });
}

export function summarize(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const percentile = (p: number) =>
    sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];
  return {
    count: sorted.length,
    p50: percentile(0.5),
    p95: percentile(0.95),
    p99: percentile(0.99),
  };
}
