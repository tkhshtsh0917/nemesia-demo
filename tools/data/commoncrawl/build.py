"""Build separate frequency-ranked Nemesia indexes from Japanese WET shards."""

import argparse
import gzip
import hashlib
import json
import re
import subprocess
import tempfile
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

from .wet import JAPANESE, japanese_records, projection

BATCH_SIZE = 384
MAX_DOCS = 160_000
MAX_SHARDS = 128
MAX_NOUNS = 500_000
MAX_ALIASES_PER_NOUN = 128
READING = re.compile(r"[ぁ-ゖァ-ヶー]+|[a-z'-]+")
MIN_DF = 2
DEFAULT_TEXT_LENGTH = 4_800
MAX_TEXT_LENGTH = 12_000
SIZES = (10_000, 50_000, 100_000)
POLICY = {
    "keep_unknown": False,
    "ranking": "df",
    "split_mode": "B",
    "stopwords": ["こと", "もの", "ところ", "ため", "よう", "場合"],
    "stoptags": [["名詞", "数詞"], ["名詞", "固有名詞", "人名"], ["動詞"], ["形容詞"]],
}


def sha256(path: Path) -> str:
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def jsonl(rows):
    """Serialize deterministic UTF-8 JSONL accepted by the native CLI."""
    return "".join(
        json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n"
        for row in rows
    )


def documents(shards, limit, host_limit, report, text_length=DEFAULT_TEXT_LENGTH):
    """Deduplicate projected pages and limit the influence of each hostname."""
    seen = set()
    hosts = Counter()
    for shard in shards:
        for host, text in japanese_records(shard):
            report["japaneseRecords"] += 1
            if hosts[host] >= host_limit:
                continue
            text = projection(text, text_length)
            if not text:
                continue

            identity = hashlib.sha256(text.encode()).hexdigest()
            if identity in seen:
                continue
            seen.add(identity)
            hosts[host] += 1
            report["documents"] += 1
            report["hosts"] = len(hosts)
            yield {"id": identity, "text": text}
            if len(seen) == limit:
                return


def batches(rows, size):
    batch = []
    for row in rows:
        batch.append(row)
        if len(batch) == size:
            yield batch
            batch = []
    if batch:
        yield batch


def extract(cli, dictionary, batch, work, policy, rules, frequency, readings):
    """Aggregate document frequency from one bounded, disjoint native batch."""
    source = work / "source.jsonl"
    terms = work / "terms.jsonl"
    stats = work / "stats.jsonl"
    source.write_text(jsonl(batch), encoding="utf-8")
    command = [
        cli,
        "extract",
        "--input",
        source,
        "--dictionary",
        dictionary,
        "--policy",
        policy,
        "--output",
        terms,
        "--stats",
        stats,
    ]
    if not rules.exists():
        command.extend(["--query-rules", rules])
    subprocess.run(command, check=True)

    with (
        terms.open(encoding="utf-8") as candidates,
        stats.open(encoding="utf-8") as counts,
    ):
        for candidate, count in zip(
            map(json.loads, candidates), map(json.loads, counts), strict=True
        ):
            if candidate["id"] != count["id"]:
                raise ValueError("candidate and frequency IDs disagree")
            term = " ".join(
                "".join(
                    c.lower() for c in unicodedata.normalize("NFKC", candidate["text"])
                ).split()
            )
            if len(term) > 32 or not JAPANESE.search(term):
                continue
            df = count["df"]
            frequency[term] += df
            for alias in candidate.get("aliases", []):
                if alias != term and READING.fullmatch(alias):
                    readings[term][alias] += df
            if len(readings[term]) > MAX_ALIASES_PER_NOUN:
                raise ValueError("distinct readings exceed the per-term limit")
            if len(frequency) > MAX_NOUNS:
                raise ValueError("distinct nouns exceed the aggregation limit")

    # The CLI requires a fresh output path.
    terms.unlink()
    stats.unlink()


def candidates(frequency, readings, min_df=MIN_DF, blocked=None):
    """Order by global DF and retain aliases with the strongest batch evidence."""
    rank = 0
    for term, df in sorted(frequency.items(), key=lambda item: (-item[1], item[0])):
        if df < min_df:
            break
        if blocked and blocked(term):
            continue
        rank += 1
        aliases = sorted(readings[term].items(), key=lambda item: (-item[1], item[0]))
        yield {
            "id": rank,
            "text": term,
            "weight": df,
            "aliases": [
                value
                for value, _ in aliases
                if not blocked or not blocked(value, alias=True)
            ][:8],
        }


def write_indexes(cli, work, output, sizes, ranked):
    results = []
    for count in sizes:
        source = work / f"{count}.jsonl"
        index = output / f"{count}.nmsi"
        source.write_text(jsonl(ranked[:count]), encoding="utf-8")
        subprocess.run([cli, "build", "--input", source, "--output", index], check=True)
        info = json.loads(subprocess.check_output([cli, "inspect", "--index", index]))
        if info["candidates"] != count:
            raise ValueError("unexpected index candidate count")
        results.append(
            {
                "count": count,
                "bytes": info["bytes"],
                "file": index.name,
                "sha256": sha256(index),
                "candidateSha256": sha256(source),
            }
        )
    return results


def build(args):
    """Stage the run so a failed batch or oversized index cannot publish partial output."""
    if args.output.exists():
        raise ValueError("choose a new output directory")
    if not 1 <= len(args.shards) <= MAX_SHARDS:
        raise ValueError(f"pass between 1 and {MAX_SHARDS} shards")
    if len({path.name for path in args.shards}) != len(args.shards):
        raise ValueError("duplicate WET shard name")
    if not 1 <= args.docs <= MAX_DOCS or not 1 <= args.per_host <= MAX_DOCS:
        raise ValueError("invalid document or per-host limit")
    counts = {"japaneseRecords": 0, "documents": 0, "hosts": 0}
    source = {
        "crawl": args.crawl,
        "shards": [
            {"name": shard.name, "sha256": sha256(shard)} for shard in args.shards
        ],
        "hostnameLimit": args.per_host,
    }
    rows = documents(args.shards, args.docs, args.per_host, counts, args.chars)
    materialize(args, rows, counts, source, POLICY)


def materialize(args, rows, counts, source, pos_policy, min_df=MIN_DF, blocked=None):
    """Extract noun statistics and atomically write the indexes and their provenance."""
    if args.output.exists():
        raise ValueError("choose a new output directory")
    if not 1 <= args.chars <= MAX_TEXT_LENGTH:
        raise ValueError("invalid document projection length")
    if not args.sizes or any(n < 1 or n > 200_000 for n in args.sizes):
        raise ValueError("invalid candidate counts")

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=args.output.parent) as scratch:
        work = Path(scratch)
        output = work / "output"
        output.mkdir()
        policy = work / "policy.json"
        policy.write_text(json.dumps(pos_policy, ensure_ascii=False), encoding="utf-8")
        rules = output / "rules.json"
        frequency = Counter()
        readings = defaultdict(Counter)
        # At most one eligible token per scalar. Stay under the native 2M token cap.
        batch_size = min(BATCH_SIZE, 2_000_000 // args.chars)
        for step, batch in enumerate(batches(rows, batch_size), 1):
            extract(
                args.cli,
                args.dictionary,
                batch,
                work,
                policy,
                rules,
                frequency,
                readings,
            )
            if step % 10 == 0:
                print(
                    f"{counts['documents']} documents, {len(frequency)} distinct nouns",
                    flush=True,
                )

        sizes = sorted(set(args.sizes))
        ranked = list(candidates(frequency, readings, min_df, blocked))
        print(
            f"{counts['documents']} documents, {len(ranked)} eligible nouns with DF >= {min_df}",
            flush=True,
        )
        if len(ranked) < sizes[-1]:
            raise ValueError(
                f"only {len(ranked)} eligible nouns for {sizes[-1]} candidates"
            )
        archive = output / "candidates.jsonl.gz"
        with (
            archive.open("wb") as file,
            gzip.GzipFile(fileobj=file, mode="wb", filename="", mtime=0) as stream,
        ):
            stream.write(jsonl(ranked[: sizes[-1]]).encode())

        report = {
            **counts,
            "cliVersion": subprocess.check_output(
                [args.cli, "--version"], text=True
            ).strip(),
            "cliSha256": sha256(args.cli),
            **source,
            "documentLimit": args.docs,
            "maxProjectedCharacters": args.chars,
            "minDocumentFrequency": min_df,
            "distinctNouns": len(frequency),
            "eligibleNouns": len(ranked),
            "dictionarySha256": sha256(args.dictionary),
            "policy": pos_policy,
            "rulesSha256": sha256(rules),
            "candidatesArchiveSha256": sha256(archive),
            "indexes": write_indexes(args.cli, work, output, sizes, ranked),
        }
        (output / "corpus.json").write_text(
            json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        output.rename(args.output)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--cli", type=lambda value: Path(value).resolve(), required=True
    )
    parser.add_argument("--dictionary", type=Path, required=True)
    parser.add_argument(
        "--crawl", required=True, help="Common Crawl snapshot identifier"
    )
    parser.add_argument(
        "--output", type=Path, required=True, help="new local artifact directory"
    )
    parser.add_argument("--docs", type=int, default=120_000)
    parser.add_argument("--chars", type=int, default=DEFAULT_TEXT_LENGTH)
    parser.add_argument("--per-host", type=int, default=80)
    parser.add_argument("--sizes", type=int, nargs="+", default=SIZES)
    parser.add_argument(
        "shards", type=Path, nargs="+", help="local .warc.wet.gz paths in order"
    )
    build(parser.parse_args())


if __name__ == "__main__":
    main()
