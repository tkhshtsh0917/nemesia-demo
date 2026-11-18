# Nemesia Demo

[English](README.md)

RustとWASMで動くクエリ補完エンジン [Nemesia](https://github.com/tkhshtsh0917/nemesia) のブラウザデモと統合テストです。検索に使うコーパスから抽出した語を、デモの補完候補として提示します。候補はネイティブのビルド工程で準備し、ブラウザではIME変換中も入力に応じて表示します。

**現在の状況**はデモとリリースワークフローの実装・ローカル検証の完了です。

- [ブラウザ統合](docs/ja/browser.md)では、TypeScriptアダプター、データの準備、コンボボックスの挙動を説明します。
- [リリースと検証](docs/ja/release.md)では、Nemesiaの成果物を取り込み、テストし、Pagesに配信する方法を説明します。
- [性能と順位付けの評価](docs/ja/performance.md)に計測した結果と条件を記載します。
- [プロジェクトのロードマップ](https://github.com/tkhshtsh0917/nemesia/blob/main/docs/ja/roadmap.md)では、両リポジトリにまたがるマイルストーンを定義します。
