# Common Crawlの語彙比較（過去の実験）

[English](../commoncrawl.md) · [ブラウザ統合](browser.md) · [性能](performance.md)

この計測は旧デモで使ったCommon Crawlの語彙を対象としています。現在のデモは[FineWeb2 Edu Japaneseの語彙](fineweb.md)を使います。

## 抽出と来歴

ネイティブのパイプラインは、指定順にローカルのWETファイルを読みます。検出言語に `jpn` を含む変換レコードを選び、日本語の本文を正規化・重複排除し、ホスト名ごとに採用ページ数を制限します。Sudachiの分割モードBで、ページごとに本文から最大8,000文字を取り出し、辞書にある名詞を抽出します。数詞、人名と判定された語、指定のストップワードを除外します。かなとローマ字のキーで別の読みを保持します。抽出対象の本文ハッシュでページの重複を除き、重複のないバッチの文書頻度を合算します。採用した2ページ以上に出現する語を候補にします。1万・5万・10万候補の索引は、文書頻度による同じ順位の上位から作ります。

実験の入力はWETファイルです。ビルドは、クロール、辞書、WETファイルと語彙のSHA-256を来歴に記録します。

## 比較の再現

Python 3.11以降と、利用環境に対応する公開版v0.1.0のCLIを使います。[デモをビルドし、Playwrightのブラウザを用意します](../../CONTRIBUTING.ja.md#デモのビルドとテスト)。[固定したSudachi辞書](../../data/dictionary.lock.json)と、固定サンプルのWETファイル94件を取得します。取得するデータは圧縮済みで数GBです。

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

測定値とクエリごとの順位は `artifacts/commoncrawl/benchmark*.json` に出力します。

## 結果

サンプルには日本語と判定されたレコードが109,637件ありました。本文の抽出と重複排除後、77,159ホストの106,571ページから一意な名詞132,927件を抽出しました。このうち104,918件は採用した2ページ以上に出現しました。

人手で正解を付けた同じ[56件の入力](../../data/commoncrawl-evaluation.json)で全サイズを評価しました。表記、かな、ローマ字、かなとローマ字の混在、打ち間違いを含みます。Recall@8は期待語が上位8件に入った入力数です。MRR@8は期待語の順位も反映します。結果は、この固定の評価標本での挙動を示します。

|  候補数 | 素の索引（B） | Gzip（B） | Brotli（B） | Recall@8 | MRR@8 | 1位の正答率 | Node WASM p95 |
| ------: | ------------: | --------: | ----------: | -------: | ----: | ----------: | ------------: |
|  10,000 |     2,561,223 |   758,587 |     617,420 |  34 / 56 | 0.529 |       50.0% |       0.99 ms |
|  50,000 |    11,813,398 | 3,521,920 |   2,860,161 |  36 / 56 | 0.530 |       48.2% |       4.49 ms |
| 100,000 |    23,154,486 | 6,924,752 |   5,607,226 |  35 / 56 | 0.515 |       46.4% |       6.89 ms |

圧縮サイズはgzipの既定レベルとBrotliの品質5でオフライン計算した参考値です。ブラウザでは本番と同じページ・Workerを使い、localhostから無圧縮の索引を読み込みました。環境はApple M5 Pro、macOS 26.6.2、Node 24.22.1、Playwright 1.64.1です。v0.1.0の公開WASMを使いました。各回の計測は、Nodeでウォームアップ後のWASM呼び出し280回、ブラウザごとに準備20回の後で入力56件です。3回の計測で索引サイズの順番を変え、p95は各回で計算した3値の中央値を示します。この入力列ではクエリの失敗は0件でした。

ブラウザの数値はChromium 156.0.8078.4、Firefox 157.0、WebKit 27.2の順です。準備時間はブラウザとサイズごとに、新しいコンテキストで9回ページを開いた中央値です。ローカル転送、ハッシュ照合、WASM起動、索引の読み込みを含みます。DOM反映時間は入力イベントから測り、Workerの往復と描画を含みます。

|  候補数 | ページ遷移からWorker準備完了 | 入力からDOM反映までのp95 |
| ------: | ---------------------------: | -----------------------: |
|  10,000 |            70 / 171 / 147 ms |     17.5 / 9.0 / 18.0 ms |
|  50,000 |           119 / 284 / 129 ms |     17.9 / 9.0 / 17.0 ms |
| 100,000 |           220 / 295 / 225 ms |    16.8 / 17.0 / 18.0 ms |

旧デモでは1万語を採用しました。5万語に増やすと、この評価では上位8件の正解が2件増え、MRR@8はほぼ同じで、無圧縮の索引サイズは4.6倍でした。10万語では「林檎」が索引にある状態で「りん」の上位8件から外れました。「機械学習」など、3サイズすべてに収録されなかった期待語もありました。収録語の範囲と順位付けの両方が結果に影響しています。
