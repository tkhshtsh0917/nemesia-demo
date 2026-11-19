# FineWeb2 Edu Japanese vocabulary

[日本語](ja/fineweb.md) · [Browser integration](browser.md) · [Previous Common Crawl experiment](commoncrawl.md)

The demo serves 10,000 Japanese nouns from [FineWeb2 Edu Japanese](https://huggingface.co/datasets/hotchpotch/fineweb-2-edu-japanese) by Yuichi Tateno. The build uses a pinned train shard from `small_tokens_cleaned`, outside the duplicated range identified by the dataset authors. We selected records with an educational score of at least 3.25 and extracted nouns from 38,160 retained documents.

SudachiDict Core 20261015 supplies normalized forms and readings. Split mode C keeps dictionary compounds when possible. The extractor takes the active entries from [the pinned elasticsearch-sudachi stopword and POS lists](https://github.com/WorksApplications/elasticsearch-sudachi/tree/7b764f3b653cbb890c74da4cb07f2aed873e009e/lucene/src/main/resources/com/worksap/nlp/lucene/sudachi/ja), with extra rules for counters, personal names and other terms unsuitable for this demo. The candidate filter checks normalized display terms and alternate readings before indexing. The display policy keeps reviewed one-character nouns such as 水, 薬, 猫, 家, 車, 卵, 塩 and 駅. It excludes reviewed explicit terms and their spelling variants, standalone fragments, and document reference markers such as 以下, 上記 and 当該. The vocabulary takes the 10,000 highest-frequency eligible terms after requiring at least five retained documents per term.

The generator retains the standalone reading `くるま` for 車 in hiragana, katakana and Latin script. This keeps 車 first for `くるま` and out of completions for `ぐる`.

For terms that mix Latin letters and katakana, the generator adds a hiragana spelling. For `eメール`, it also prioritizes the reviewed Latin keys `eme-ru` and `emeru` within the eight-alias limit. This keeps `eメール` first while composing `eめ-` or `eめr`. The older forms `e-mail` and `i-me-ru` are found by fuzzy matching and rank first and fourth in this snapshot, respectively.

Educational scores describe documents. Sudachi assigns boundaries and parts of speech using context and a dictionary. A valid dictionary noun can therefore be an unhelpful standalone suggestion. Review both the source and the extracted vocabulary when updating the snapshot.

The [data notice](../data/notices/FineWeb2-Edu-Japanese.txt) records the source, its ODC-By 1.0 license, Common Crawl's terms and the Apache-2.0 stop-list attribution. The repository carries the derived terms, their alternate keys and frequencies, and the pinned provenance. The source Parquet and projected passages stay in the local generation process.

## Quality checks

The [review cases](../data/fineweb-evaluation.json) check 36 expected suggestions and 18 exclusions across 47 inputs. Nineteen inputs require first place, including short nouns and mixed-script spellings of `eメール`. Using the same v0.1.0 WASM, the preceding snapshot passed 30 of the expected top-eight suggestions, 15 exclusions and 14 of the 19 required first places. The current snapshot passes all 36, 18 and 19 checks. The [previous 56-case evaluation](../data/commoncrawl-evaluation.json) returned 33 expected terms in the first eight results and 28 in first place for both snapshots. These results describe the fixed evaluation inputs.

Before compiling the snapshot, the Pages build checks the report against the pinned Parquet shard, Sudachi dictionary, upstream stop lists and generation settings. The generation settings include the CLI version, minimum educational score, document and text-length limits, and minimum document frequency. When the build uses the same CLI release, it also checks that the compiled index matches the report's byte length and SHA-256. A build using a newer compatible CLI records the actual index digest in the deployment provenance.

The generator verifies the extractor binary against the Linux and macOS CLI digests pinned from the release's `SHA256SUMS`. Pages checks the recorded extractor digest against those same pins. The extractor and the compiler used for deployment can run on different platforms.

## Rebuild the vocabulary

The normal Pages build compiles the checked-in [snapshot](../data/demo-vocabulary/). To regenerate the vocabulary, use the published v0.1.0 CLI Asset for your platform along with `jq`, `curl` and `uv`. Run the commands from the demo repository.

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
