# Add Nemesia to a web page

[日本語](ja/browser-quickstart.md) · [Full browser integration](browser.md)

This example shows completion results on a plain HTML page. Keep the existing search service responsible for running the final query.

1. Follow the [CLI quick start](https://github.com/tkhshtsh0917/nemesia#quick-start) to build `suggestions.nmsi` containing `Tokyo Station`.
2. Download `nemesia_wasm.wasm`, `nemesia-abi.json` and `SHA256SUMS` from that same [Nemesia release](https://github.com/tkhshtsh0917/nemesia/releases). Verify the WASM hash and check the `wasmBindgen` version in the release's `nemesia-abi.json`. With Rust and Cargo installed, generate the bindings next to the index. For v0.1.0:

```sh
cargo install wasm-bindgen-cli --locked --version 0.2.129
wasm-bindgen --target web --out-dir generated nemesia_wasm.wasm
```

Save this as `index.html` in the same directory:

```html
<!doctype html>
<html lang="en">
  <meta charset="utf-8" />
  <label>
    Query
    <input id="query" type="search" value="toky st" />
  </label>
  <pre id="output" aria-live="polite">Loading…</pre>
  <script type="module">
    import init, {
      abi_version,
      CompletionIndex,
    } from "./generated/nemesia_wasm.js";

    const input = document.querySelector("#query");
    const output = document.querySelector("#output");

    try {
      await init();
      if (abi_version() !== 1) throw new Error("Unexpected ABI");
      const response = await fetch("./suggestions.nmsi");
      if (!response.ok) throw new Error("Index download failed");
      const index = new CompletionIndex(
        new Uint8Array(await response.arrayBuffer()),
      );

      function render() {
        try {
          const hits = JSON.parse(index.complete(input.value, undefined, 8));
          output.textContent = hits.map((hit) => hit.text).join("\n");
        } catch (error) {
          output.textContent = String(error);
        }
      }

      input.addEventListener("input", render);
      window.addEventListener("pagehide", (event) => {
        if (!event.persisted) index.free();
      });
      render();
    } catch (error) {
      output.textContent = String(error);
    }
  </script>
</html>
```

Serve the files over HTTP for local development and open [localhost:8000](http://localhost:8000/):

```sh
python3 -m http.server --bind 127.0.0.1 8000
```

The initial query `toky st` shows `Tokyo Station`. `complete(query, derived, limit)` returns a JSON string. Parse it to get ranked objects containing `id`, `text` and `distance`. Pass `undefined` to match only the input, or a derived spelling as the second argument to match both. Keep the handle across calls and call `free()` when done. Use `text` when inserting a suggestion into your search field.

For production, move WASM and index loading to a Worker, verify a bounded index download against a trusted manifest, and discard results for old input. The [browser integration guide](browser.md) describes these checks, mixed kana/Latin input, and accessible selection. You can reuse the pattern in the [demo source](https://github.com/tkhshtsh0917/nemesia-demo/tree/main/src). This repository ships a reference implementation and a static demo. Generate the bindings directly from the release WASM to integrate with your app.
