import type { Suggestion } from "./types.ts";

export type Request =
  | { kind: "load"; id: number; url: string }
  | { kind: "query"; id: number; generation: string; query: string };

export type Reply =
  | { kind: "ready"; id: number; generation: string }
  | {
      kind: "result";
      id: number;
      generation: string;
      hits: Suggestion[];
      wasmMs: number;
    }
  | { kind: "load-error"; id: number }
  | { kind: "query-error"; id: number; generation: string };
