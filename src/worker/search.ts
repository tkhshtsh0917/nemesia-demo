/** Owns the index handle and adopts verified snapshots as a unit. */
import init, {
  abi_version,
  CompletionIndex,
} from "../generated/nemesia_wasm.js";
import type { Reply, Request } from "../protocol.ts";
import { bounded, parseManifest, verified } from "./assets.ts";
import { mixedRomaji, readRules } from "./romaji.ts";

const utf8 = new TextDecoder("utf-8", { fatal: true });
let active:
  | {
      generation: string;
      index: CompletionIndex;
      rules: ReadonlyMap<string, string>;
      bytes: number;
    }
  | undefined;
let pending = false;
let initialization: Promise<unknown> | undefined;

async function load(raw: string): Promise<string> {
  if (pending) throw new Error("already loading");
  pending = true;
  try {
    const url = new URL(raw);
    if (
      url.origin !== self.location.origin ||
      url.protocol !== self.location.protocol
    )
      throw new Error("invalid manifest origin");
    const manifest = parseManifest(
      JSON.parse(utf8.decode(await bounded(url, 4096))),
    );
    if (active?.generation === manifest.generation) return active.generation;
    if (
      (active?.bytes ?? 0) + manifest.index.bytes * 2 + manifest.rules.bytes >
      64 * 1024 * 1024
    ) {
      throw new Error("staging byte limit exceeded");
    }
    initialization ??= init().catch((error) => {
      initialization = undefined;
      throw error;
    });
    const [indexBytes, ruleBytes] = await Promise.all([
      verified(url, manifest.index),
      verified(url, manifest.rules),
      initialization,
    ]);
    if (abi_version() !== 1) throw new Error("unsupported WASM ABI");
    const rules = readRules(JSON.parse(utf8.decode(ruleBytes)));
    const index = new CompletionIndex(indexBytes);
    active?.index.free();
    active = {
      generation: manifest.generation,
      index,
      rules,
      bytes: manifest.index.bytes,
    };
    return active.generation;
  } finally {
    pending = false;
  }
}

function reply(message: Reply): void {
  self.postMessage(message);
}

self.addEventListener("message", async (event: MessageEvent<Request>) => {
  const request = event.data;
  if (request.kind === "load") {
    try {
      reply({
        kind: "ready",
        id: request.id,
        generation: await load(request.url),
      });
    } catch {
      reply({ kind: "load-error", id: request.id });
    }
    return;
  }
  try {
    if (
      active === undefined ||
      request.generation !== active.generation ||
      !request.query.isWellFormed()
    ) {
      throw new Error("invalid query");
    }
    const derived = mixedRomaji(request.query, active.rules);
    const start = performance.now();
    const json = active.index.complete(request.query, derived, 8);
    reply({
      kind: "result",
      id: request.id,
      generation: request.generation,
      hits: JSON.parse(json),
      wasmMs: performance.now() - start,
    });
  } catch {
    reply({
      kind: "query-error",
      id: request.id,
      generation: request.generation,
    });
  }
});
