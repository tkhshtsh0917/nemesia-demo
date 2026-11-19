# FineWeb2 Edu Japaneseの語彙

[English](../fineweb.md) · [ブラウザ統合](browser.md) · [過去のCommon Crawl実験](commoncrawl.md)

デモではYuichi Tateno氏の[FineWeb2 Edu Japanese](https://huggingface.co/datasets/hotchpotch/fineweb-2-edu-japanese)から抽出した日本語の名詞1万語を配信します。データセット作者が案内する重複範囲を避け、`small_tokens_cleaned` の固定したtrainシャードを使います。教育スコアが3.25以上のレコードを選び、採用した38,160文書から名詞を抽出しました。

正規化語と読みにはSudachiDict Core 20261015を使います。分割モードCで、辞書にある複合語を可能な範囲で保持します。抽出時には[固定コミットのelasticsearch-sudachiのストップワードと除外品詞](https://github.com/WorksApplications/elasticsearch-sudachi/tree/7b764f3b653cbb890c74da4cb07f2aed873e009e/lucene/src/main/resources/com/worksap/nlp/lucene/sudachi/ja)で有効になっている行を使い、助数詞になり得る名詞、人名など、デモ向けの除外設定を加えます。索引の生成前に正規化語と読みの別名を検査し、1文字の表示語、確認した断片や露骨な語を除外します。採用文書のうち5件以上で出現した候補を、文書頻度順に並べます。

教育スコアは文書単位の評価です。Sudachiは文脈と辞書を使って語の境界と品詞を付けます。そのため、辞書にある名詞でも単独の補完候補として有用でないことがあります。スナップショットの更新時は、出典と抽出後の語彙の両方を確認します。

[データの出典表記](../../data/notices/FineWeb2-Edu-Japanese.txt)には、出典、ODC-By 1.0ライセンス、Common Crawlの利用条件、Apache-2.0のストップリストの出典を記載しています。リポジトリには抽出した語、別名キー、頻度、固定した来歴を含めます。元のParquetと抽出した本文はローカルの生成工程で使います。

## 語彙の再生成

通常のPagesビルドでは、リポジトリ内の[スナップショット](../../data/demo-vocabulary/)から索引を生成します。語彙を再生成するときは、`jq`、`curl`、`uv`、v0.1.0のCLIを用意し、デモリポジトリで次を実行します。

```sh
lock=data/fineweb.lock.json
source_dir=artifacts/fineweb-source
filter_dir=artifacts/sudachi-filters
mkdir -p "$source_dir" "$filter_dir"

dataset=$(jq -er .dataset "$lock")
revision=$(jq -er .revision "$lock")
shard=$(jq -er .file "$lock")
parquet="$source_dir/${shard##*/}"
curl -fL --retry 2 "https://huggingface.co/datasets/$dataset/resolve/$revision/$shard" -o "$parquet"

filter_revision=$(jq -er .sudachiFilters.revision "$lock")
filter_url="https://raw.githubusercontent.com/WorksApplications/elasticsearch-sudachi/$filter_revision"
filter_path=lucene/src/main/resources/com/worksap/nlp/lucene/sudachi/ja
for file in stopwords.txt stoptags.txt; do
  curl -fL --retry 2 "$filter_url/$filter_path/$file" -o "$filter_dir/$file" || exit 1
done

bash tools/dictionary.sh artifacts/dictionary/system.dic
uv run --no-project --python 3.14 --with pyarrow==22.0.0 python -B -m tools.data.fineweb.build \
  --cli /path/to/nemesia --dictionary artifacts/dictionary/system.dic \
  --parquet "$parquet" --sudachi-filters "$filter_dir" --output artifacts/fineweb
uv run --no-project --python 3.14 python -B -m tools.data.commoncrawl.snapshot \
  artifacts/fineweb artifacts/fineweb-snapshot --count 10000
```

生成したスナップショットとリポジトリ内の版を比較します。候補の差分を確認して採用する版を `data/demo-vocabulary/` に配置し、[ビルドとブラウザの検証](../../CONTRIBUTING.ja.md#デモのビルドとテスト)を実行します。
