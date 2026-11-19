# FineWeb2 Edu Japanese vocabulary

[日本語](ja/fineweb.md) · [Browser integration](browser.md) · [Previous Common Crawl experiment](commoncrawl.md)

The demo serves 10,000 Japanese nouns from [FineWeb2 Edu Japanese](https://huggingface.co/datasets/hotchpotch/fineweb-2-edu-japanese) by Yuichi Tateno. The build uses a pinned train shard from `small_tokens_cleaned`, outside the duplicated range identified by the dataset authors. We selected records with an educational score of at least 3.25 and extracted nouns from 38,160 retained documents.

SudachiDict Core 20261015 supplies normalized forms and readings. Split mode C keeps dictionary compounds when possible. The extractor takes the active entries from [the pinned elasticsearch-sudachi stopword and POS lists](https://github.com/WorksApplications/elasticsearch-sudachi/tree/7b764f3b653cbb890c74da4cb07f2aed873e009e/lucene/src/main/resources/com/worksap/nlp/lucene/sudachi/ja), with extra rules for counters, personal names and other terms unsuitable for this demo. The candidate filter checks normalized display terms and alternate readings before indexing. It excludes one-character display terms, reviewed fragments and explicit terms. Candidate order uses document frequency from at least five retained documents.

Educational scores describe documents. Sudachi assigns boundaries and parts of speech using context and a dictionary. A valid dictionary noun can therefore be an unhelpful standalone suggestion. Review both the source and the extracted vocabulary when updating the snapshot.

The [data notice](../data/notices/FineWeb2-Edu-Japanese.txt) records the source, its ODC-By 1.0 license, Common Crawl's terms and the Apache-2.0 stop-list attribution. The repository carries the derived terms, their alternate keys and frequencies, and the pinned provenance. The source Parquet and projected passages stay in the local generation process.

## Rebuild the vocabulary

The normal Pages build compiles the checked-in [snapshot](../data/demo-vocabulary/). Use the following when regenerating the vocabulary, with `jq`, `curl`, `uv` and the v0.1.0 CLI available. Run the commands from the demo repository.

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

Compare the new snapshot with the checked-in one. Review the candidate differences, then place the accepted snapshot at `data/demo-vocabulary/` and run the [build and browser checks](../CONTRIBUTING.md#build-and-test-the-demo).
