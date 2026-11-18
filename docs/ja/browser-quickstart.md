# WebページにNemesiaを組み込む

[English](../browser-quickstart.md) · [ブラウザ統合の詳細](browser.md)

この例は、HTMLページに補完結果を表示します。確定したクエリの検索は、既存の検索サービスが担当します。

1. [CLIのクイックスタート](https://github.com/tkhshtsh0917/nemesia/blob/main/README.ja.md#クイックスタート)に従い、`Tokyo Station` を含む `suggestions.nmsi` を作成します。
2. 同じ[Nemesiaのリリース](https://github.com/tkhshtsh0917/nemesia/releases)から `nemesia_wasm.wasm` と `SHA256SUMS` を入手します。WASMのハッシュを照合し、リリースの `nemesia-abi.json` で `wasmBindgen` のバージョンを確認してください。RustとCargoを用意し、索引と同じディレクトリでバインディングを生成します。v0.1.0では次のとおりです。

```sh
cargo install wasm-bindgen-cli --locked --version 0.2.129
wasm-bindgen --target web --out-dir generated nemesia_wasm.wasm
```

同じディレクトリに、次の内容を `index.html` として保存します。

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

ローカルの開発時は、ファイルをHTTPで配信し、[localhost:8000](http://localhost:8000/)を開きます。

```sh
python3 -m http.server --bind 127.0.0.1 8000
```

初期入力の `toky st` に対して `Tokyo Station` が表示されます。`complete(query, derived, limit)` の戻り値はJSON文字列です。パースすると `id`、`text`、`distance` を持つオブジェクトが順位順に並びます。原入力だけを照合する場合は第2引数を `undefined` にし、両方を照合する場合は変換後の表記を渡します。呼び出し間でハンドルを再利用し、使い終えたら `free()` を呼びます。候補を検索欄に挿入するときは `text` を使います。

本番ではWASMと索引の読み込みをWorkerに移し、信頼するマニフェストで上限付きのダウンロードを検証し、古い入力の応答を破棄してください。[ブラウザ統合ガイド](browser.md)に、これらの検査、かなと英字の混在入力、アクセシブルな候補選択を記載しています。[デモのソース](https://github.com/tkhshtsh0917/nemesia-demo/tree/main/src)の構成を応用できます。このrepoは参照実装と静的デモを提供します。アプリに組み込む際は、配布WASMからバインディングを直接生成します。
