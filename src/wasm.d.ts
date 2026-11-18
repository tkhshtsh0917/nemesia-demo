declare module "*generated/nemesia_wasm.js" {
  export default function init(input?: {
    module_or_path: BufferSource;
  }): Promise<unknown>;
  export function abi_version(): number;
  export class CompletionIndex {
    constructor(bytes: Uint8Array);
    complete(raw: string, derived: string | undefined, limit: number): string;
    free(): void;
  }
}
