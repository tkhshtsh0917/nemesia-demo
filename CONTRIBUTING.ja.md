# コントリビュート

[English](CONTRIBUTING.md)

このチェックアウトで `mise install`、`mise exec -- pnpm install --frozen-lockfile`、`mise run check` を実行します。テスト用データを都度のダウンロードに依存させず、日英の文書を同時に更新してください。

検証付きでリリースをビルドしプレビューするには、利用環境のネイティブCLI、生のWASM、ABIメタデータ、ライセンス表記、`SHA256SUMS` を `artifacts/release` に置きます。wasm-bindgen 0.2.129をインストールします。リリースタグをCLIのバージョンに合わせてください。

```sh
bash tools/dictionary.sh artifacts/dictionary/system.dic
mise exec -- bash tools/build-release.sh artifacts/release v0.1.0 artifacts/dictionary/system.dic
mise exec -- pnpm exec playwright install chromium firefox webkit
mise exec -- pnpm test:e2e
mise exec -- pnpm preview
```

ビルドはデモの実際の検索対象から索引を作り、CLIとWASMの出力を比較し、静的サイトを `dist/` に生成します。成果物の契約は[リリースと検証](docs/ja/release.md)、計測の再現方法は[性能](docs/ja/performance.md)を参照してください。
