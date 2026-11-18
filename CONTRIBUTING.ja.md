# コントリビュート

[English](CONTRIBUTING.md) · [ブラウザのクイックスタート](docs/ja/browser-quickstart.md)

このリポジトリはブラウザ統合の参照実装、デモのデータ準備、ブラウザテスト、Pagesのサイトを担当します。照合、抽出、索引、WASM ABIの変更は [Nemesia](https://github.com/tkhshtsh0917/nemesia) 側で行います。

## 準備と変更の検証

miseをインストールします。チェックアウトしたディレクトリで、固定のNodeとpnpmを導入し、ローカルの検証を実行します。

```sh
mise install
mise exec -- pnpm install --frozen-lockfile
mise run check
```

`check` はBiome、TypeScript、固定データを使うテスト、Markdown検査を実行します。CLI、WASM、辞書をダウンロードする前に実行できます。WETとスナップショットのテストにはPython 3.11以降を使い、`python3 -B -m unittest discover -s tools/data/commoncrawl` で実行します。

## デモのビルドとテスト

この手順では、Bashと、リリースのメタデータで指定したwasm-bindgen CLI（v0.1.0では0.2.129）も使います。[NemesiaのReleasesページ](https://github.com/tkhshtsh0917/nemesia/releases)から公開済みのリリースを一つ入手するか、GitHub CLIを用意して次を実行します。

```sh
gh release download v0.1.0 --repo tkhshtsh0917/nemesia --dir artifacts/release \
  -p 'nemesia-*' -p nemesia_wasm.wasm -p SHA256SUMS
cargo install wasm-bindgen-cli --locked --version 0.2.129
mise exec -- bash tools/build-release.sh artifacts/release v0.1.0
mise exec -- pnpm exec playwright install chromium firefox webkit
mise exec -- pnpm test:e2e
mise exec -- pnpm preview
```

ビルドはリリースのハッシュを照合し、ネイティブCLIで固定の[Common Crawl語彙](docs/ja/commoncrawl.md)から索引を作成し、CLIとWASMの結果を比較し、配信できるサイトを `dist/` に生成します。ブラウザテストはそのサイトを `/nemesia-demo/` 以下で配信します。ローカルでプレビューするときはViteが出力したURLを開いてください。

## プルリクエストの準備

機能テストには固定データを使います。クエリのライフサイクルを変更したら、古い応答や描画も検証します。英語版と日本語訳を同じ変更で更新し、実行した検証を記載してください。成果物の契約は[リリースと検証](docs/ja/release.md)、計測の再現は[性能](docs/ja/performance.md)を参照してください。
