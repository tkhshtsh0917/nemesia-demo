/** Validates the manifest and downloads only bounded, content-addressed assets. */
export const INDEX_CAP = 32 * 1024 * 1024;
const SHA = /^[a-f0-9]{64}$/;

type Pin = { file: string; sha256: string; bytes: number };
export type Manifest = { generation: string; index: Pin; rules: Pin };

function fields(input: unknown): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input))
    throw new Error("invalid manifest object");
  return input as Record<string, unknown>;
}

function asset(value: unknown, suffix: string, max: number): Pin {
  const { file, sha256, bytes } = fields(value);
  if (
    typeof sha256 !== "string" ||
    !SHA.test(sha256) ||
    file !== sha256 + suffix ||
    typeof bytes !== "number" ||
    !Number.isInteger(bytes) ||
    bytes < 1 ||
    bytes > max
  ) {
    throw new Error("invalid asset pin");
  }
  return { file, sha256, bytes };
}

export function parseManifest(value: unknown): Manifest {
  const manifest = fields(value);
  if (
    manifest.format !== "nemesia-data/1" ||
    manifest.abi !== 1 ||
    manifest.normalization !== 1 ||
    typeof manifest.generation !== "string" ||
    !SHA.test(manifest.generation)
  )
    throw new Error("unsupported manifest");
  return {
    generation: manifest.generation,
    index: asset(manifest.index, ".nmsi", INDEX_CAP),
    rules: asset(manifest.rules, ".json", 2 * 1024 * 1024),
  };
}

export async function bounded(
  url: URL,
  maximum: number,
  expected?: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const response = await fetch(url, {
    redirect: "error",
    cache: expected === undefined ? "no-store" : "default",
  });
  if (!response.ok || !response.body) throw new Error("asset unavailable");
  const reader = response.body.getReader();
  const output = new Uint8Array(expected ?? maximum);
  let cursor = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      if (next.value.length > output.byteLength - cursor)
        throw new Error("asset exceeds byte limit");
      output.set(next.value, cursor);
      cursor += next.value.length;
    }
    if (expected !== undefined && cursor !== expected)
      throw new Error("asset length mismatch");
    return output.subarray(0, cursor);
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
}

export async function verified(
  base: URL,
  pin: Pin,
): Promise<Uint8Array<ArrayBuffer>> {
  const bytes = await bounded(new URL(pin.file, base), pin.bytes, pin.bytes);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  const hex = [...digest].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (hex !== pin.sha256) throw new Error("asset digest mismatch");
  return bytes;
}
