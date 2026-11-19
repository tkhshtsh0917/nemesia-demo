# Common Crawl vocabulary comparison (historical)

[日本語](ja/commoncrawl.md) · [Browser integration](browser.md) · [Performance](performance.md)

These measurements cover the Common Crawl vocabulary used in the previous demo. The current demo uses the [FineWeb2 Edu Japanese vocabulary](fineweb.md).

## Extraction and provenance

The native pipeline reads local WET shards in the supplied order. It selects conversion records whose detected languages include `jpn`, normalizes and deduplicates Japanese text, and caps the number of pages per hostname. Sudachi split mode B extracts known nouns from up to 8,000 characters of projected text per page. The policy excludes numerals, entries tagged as personal names, and specified stopwords. Kana and Latin keys preserve alternate readings. Pages are deduplicated by the hash of the projected text, and the global document frequency is summed over disjoint batches. A term must occur in at least two retained pages. The nested indexes take the top 10,000, 50,000 and 100,000 terms from the same ordering by document frequency.

The experiment uses WET files as inputs. The build records the crawl, dictionary, shard hashes and vocabulary hashes as provenance.

## Reproduce the comparison

Use Python 3.11 or later and the released v0.1.0 CLI for your platform. [Build the demo and install Playwright browsers](../CONTRIBUTING.md#build-and-test-the-demo). Fetch the [pinned Sudachi dictionary](../data/dictionary.lock.json) and the fixed sample of 94 WET files. The compressed download is several gigabytes.

```sh
crawl=CC-MAIN-2026-43
wet=artifacts/wet
mkdir -p "$wet"
curl -fSs --retry 2 "https://data.commoncrawl.org/crawl-data/$crawl/wet.paths.gz" -o "$wet/wet.paths.gz"
gzip -dc "$wet/wet.paths.gz" | awk '
  NR % 3231 == 137 && NR < 52000 { first[++a] = $0 }
  NR % 1777 == 1039 && NR > 52000 { second[++b] = $0 }
  NR % 1279 == 301 && NR < 64000 { third[++c] = $0 }
  END {
    for (i = 1; i <= a; i++) print first[i]
    for (i = 1; i <= b; i++) print second[i]
    for (i = 1; i <= c; i++) print third[i]
  }' > "$wet/paths.txt"

set --
while IFS= read -r remote; do
  shard="$wet/${remote##*/}"
  if [ ! -f "$shard" ]; then
    curl -fSs --retry 2 --continue-at - --max-time 240 --max-filesize 180000000 \
      "https://data.commoncrawl.org/$remote" -o "$shard.part" || exit 1
    mv "$shard.part" "$shard"
  fi
  set -- "$@" "$shard"
done < "$wet/paths.txt"

bash tools/dictionary.sh artifacts/dictionary/system.dic
python3 -B -m tools.data.commoncrawl.build \
  --cli /path/to/nemesia --dictionary artifacts/dictionary/system.dic \
  --crawl "$crawl" --chars 8000 --output artifacts/commoncrawl "$@"
for pass in 0 1 2; do
  mise exec -- node tools/bench/commoncrawl.ts artifacts/commoncrawl "$pass"
done
```

The report records measurements and per-query ranks in `artifacts/commoncrawl/benchmark*.json`.

## Results

The sample contained 109,637 records marked Japanese. After projection and deduplication, 106,571 pages from 77,159 hostnames contributed 132,927 distinct nouns. Of these, 104,918 occurred in at least two retained pages.

The same [56 manually labelled inputs](../data/commoncrawl-evaluation.json) were applied to all sizes. They include surface text, kana, romaji, mixed kana/Latin input and typos. Recall@8 is the count of inputs whose expected term appeared in the first eight results. MRR@8 also accounts for its rank. The results describe this fixed evaluation sample.

| Candidates | Raw index (B) |  Gzip (B) | Brotli (B) | Recall@8 | MRR@8 | Top 1 | Node WASM p95 |
| ---------: | ------------: | --------: | ---------: | -------: | ----: | ----: | ------------: |
|     10,000 |     2,561,223 |   758,587 |    617,420 |  34 / 56 | 0.529 | 50.0% |       0.99 ms |
|     50,000 |    11,813,398 | 3,521,920 |  2,860,161 |  36 / 56 | 0.530 | 48.2% |       4.49 ms |
|    100,000 |    23,154,486 | 6,924,752 |  5,607,226 |  35 / 56 | 0.515 | 46.4% |       6.89 ms |

Compression sizes are offline estimates using gzip's default level and Brotli quality 5. The browser benchmark loaded the raw index on localhost using the production page and Worker. The machine was an Apple M5 Pro with macOS 26.6.2, Node 24.22.1 and Playwright 1.64.1. We used the v0.1.0 release WASM. Each pass ran 280 warmed WASM calls in Node and 56 measured inputs after 20 warm-ups in each browser. Index order rotated between the three passes. Reported p95s are the median of the three per-pass p95s. No query failed on this trace.

The browser columns give Chromium 156.0.8078.4, Firefox 157.0 and WebKit 27.2, in that order. Readiness is the median of nine fresh-context navigations per browser and size. It includes local transfer, digest verification, WASM start and index opening. DOM timings start at the input event and include Worker round trip and rendering.

| Candidates | Navigation to Worker ready |      Input to DOM p95 |
| ---------: | -------------------------: | --------------------: |
|     10,000 |          70 / 171 / 147 ms |  17.5 / 9.0 / 18.0 ms |
|     50,000 |         119 / 284 / 129 ms |  17.9 / 9.0 / 17.0 ms |
|    100,000 |         220 / 295 / 225 ms | 16.8 / 17.0 / 18.0 ms |

The previous demo used 10,000 terms. Moving to 50,000 added two correct top-eight results on this trace, with nearly the same MRR@8 and 4.6 times as many raw index bytes. At 100,000, the term 林檎 remained indexed but dropped out of the first eight results for りん. Other targets, such as 機械学習, did not appear in any of the three candidate sets. Vocabulary coverage and ranking both contribute to the outcome.
