# Local performance and ranking evaluation

[日本語](ja/performance.md)

## Latency and size

Measured with Nemesia 0.1.0, Rust 1.99.1, wasm-bindgen 0.2.129, Node 24.22.1 and Playwright 1.64.1 on Apple M5 Pro and macOS 26.6.2 (arm64). The synthetic fixture has one key per candidate and 1,296 two-character buckets. A seeded 200-query trace alternates exact prefixes with fuzzy prefixes. Browser results are from a headless localhost Pages-style build, with 20 warmups, 100 measurements per query class and a separate repeat. Browser clock granularity varies.

| Engine and version    | 100k exact WASM p95 | 100k fuzzy WASM p95 | 100k input-to-DOM p95, exact / fuzzy |
| --------------------- | ------------------: | ------------------: | -----------------------------------: |
| Chromium 156.0.8078.4 |              0.6 ms |              4.1 ms |                       17.4 / 17.4 ms |
| Firefox 157.0         |                1 ms |                5 ms |                             9 / 9 ms |
| WebKit 27.2           |                1 ms |                4 ms |                           18 / 17 ms |

The initial runs and the repeat using the path-remapped release bundle had zero query failures on this trace. Earlier experiments used Node 26.8.1. Fuzzy Worker round-trip p95 was 4.3, 5 and 4 ms respectively in the repeat. At 10k candidates, all three engines had warmed fuzzy WASM p95 of 1 ms or less in the repeat. At 100k, navigation through Worker readiness took 99–199 ms in the repeat. This includes transfer on localhost, WASM initialization, parsing and verification. Mobile emulation was used for functional tests. The timings describe the desktop test host and synthetic data.

| Candidates |    Raw index |   Gzip size | Native build | Node WASM open |
| ---------: | -----------: | ----------: | -----------: | -------------: |
|     10,000 |  1,370,848 B |   324,701 B |       8.7 ms |         5.7 ms |
|    100,000 | 11,243,056 B | 2,716,095 B |      62.5 ms |        22.4 ms |

The binding-generated WASM is 170,562 B raw and 84,141 B with gzip. The 100k native build used 80.9 MiB peak RSS in a separate OS measurement. Sudachi extraction of the seven demo documents took about 60 ms with 84.2 MiB peak RSS, with the full dictionary present locally. RSS measures the native process. Browser peak memory remains unmeasured. The decode and work caps were verified separately.

On the 100k fixture, four alternating native comparisons checked ordered results against the baseline outside timing. Mean fuzzy time per query was 8.93–9.18 ms for a full scan of already normalized keys, versus 0.47–0.54 ms for the Trie. Exact range lookup on sorted keys was about 0.001–0.003 ms, versus 0.047–0.062 ms for the Trie with its general-purpose ranking. The sorted baseline stores a separate full key array. The release keeps one index representation because both paths meet the observed WASM targets.

## Ranking quality

The fixed, manually labelled pilot uses 31 input/intent pairs independently of the weights, over the seven original demo documents. SudachiDict Core 20261015 produced 39 candidates. The comparison changes only the build-time ranking weight and uses the same top 8, transformations and matching. Twelve clean, nine reading and ten typo cases are included.

| Weight                   | Recall@8 |  MRR@8 |   Top 1 |
| ------------------------ | -------: | -----: | ------: |
| Document frequency       |  31 / 31 | 0.9516 | 28 / 31 |
| Sum of per-document BM25 |  31 / 31 | 0.9677 | 29 / 31 |

BM25 moved three clean cases to rank one and moved two former first results to rank two. For example, it raised 世界史 for せか and lowered 世界 for 世. Reading and typo cases had the same results. Keep document frequency as the default and expose BM25 as a corpus policy choice. Larger, independently labelled workloads are needed to establish whether this improvement generalizes.

## Reproduce

Build the site with the [release procedure](release.md), then run from the demo checkout:

```sh
node tools/bench/performance.ts /path/to/nemesia
node tools/bench/quality.ts /path/to/nemesia /path/to/system.dic
```

The local reports in `artifacts/bench/` include artifact hashes, environment, fixture identity, counts and p50/p95/p99 or per-query ranks. The native A/B runner is `cargo run --locked --release -p nemesia-builder --example bench_compare -- CANDIDATES_JSONL QUERY_LINES` in the core repository. Use `tools/bench/workload.ts` to reproduce the synthetic data and trace.
