# Nemesia Demo

[English](README.md)

[Nemesia](https://github.com/tkhshtsh0917/nemesia)は、誤入力に強いクエリ補完をWebページに追加します。デモは検索対象と同じ文書から抽出した語を、IME変換中も含めて入力に応じて提案します。

配信後は[デモ](https://tkhshtsh0917.github.io/nemesia-demo/)を開き、`bi-t`、`びーt`、`にh` を試すと、ローマ字の途中入力や文字種が混在する入力の補完を確認できます。

- **アプリに組み込む。** HTMLだけで試すには[ブラウザのクイックスタート](docs/ja/browser-quickstart.md)、デモのWorkerとコンボボックスについては[ブラウザ統合ガイド](docs/ja/browser.md)を参照してください。
- **デモを動かす・開発する。** リリースの入手、ローカルビルド、テストのコマンドは[コントリビュート](CONTRIBUTING.ja.md)にあります。
- **挙動と性能を調べる。** [リリースと検証](docs/ja/release.md)、配信後の[Rust APIリファレンス](https://tkhshtsh0917.github.io/nemesia-demo/api/rust/)、[応答時間と順位付け品質の実測](docs/ja/performance.md)を参照してください。

デモのコードは[MIT](LICENSE)ライセンスです。辞書の出典は[データのライセンス表記](data/notices/)にあります。
