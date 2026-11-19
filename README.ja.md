# Nemesia Demo

[English](README.md)

[Nemesia](https://github.com/tkhshtsh0917/nemesia)は、誤入力に強いクエリ補完をWebページに追加します。デモでは、FineWeb2 Edu Japaneseから抽出した日本語の名詞1万語を補完します。読み、ローマ字、打ち間違い、IME変換中の入力に対応します。

[デモ](https://tkhshtsh0917.github.io/nemesia-demo/)を開き、`bitam`、`びたm`、`にh` を試すと、ローマ字の途中入力や文字種が混在する入力の補完を確認できます。

- **アプリに組み込む。** HTMLだけで試すには[ブラウザのクイックスタート](docs/ja/browser-quickstart.md)、デモのWorkerとコンボボックスについては[ブラウザ統合ガイド](docs/ja/browser.md)を参照してください。
- **デモを動かす・開発する。** リリースの入手、ローカルビルド、テストのコマンドは[コントリビュート](CONTRIBUTING.ja.md)にあります。
- **挙動と性能を調べる。** [FineWeb2 Edu Japaneseの語彙](docs/ja/fineweb.md)、[リリースと検証](docs/ja/release.md)、[Rust APIリファレンス](https://tkhshtsh0917.github.io/nemesia/)、[応答時間と順位付け品質の実測](docs/ja/performance.md)を参照してください。

デモのコードは[MIT](LICENSE)ライセンスです。辞書の出典は[データのライセンス表記](data/notices/)、コーパスの出典は[FineWeb2 Edu Japaneseの語彙](docs/ja/fineweb.md)を参照してください。
