"""Generate the public vocabulary from a pinned FineWeb2 Edu Japanese shard."""

import argparse
import hashlib
import json
import math
import subprocess
from pathlib import Path

from tools.data.commoncrawl.build import MAX_DOCS, materialize, sha256
from tools.data.commoncrawl.wet import projection
from tools.data.fineweb.policy import analyzer_policy, blocked, mixed_kana_alias

LOCK = Path("data/fineweb.lock.json")
DICTIONARY_LOCK = Path("data/dictionary.lock.json")
PARQUET_VERSION = "22.0.0"


def retained_documents(records, report, limit, chars, min_score):
    """Select educational texts and deduplicate projected content in shard order."""
    seen = set()
    for score, body in records:
        report["rowsRead"] += 1
        if score is None or not math.isfinite(score) or score < min_score or not body:
            continue

        report["rowsAtScore"] += 1
        text = projection(body, chars)
        if not text:
            continue

        identity = hashlib.sha256(text.encode()).hexdigest()
        if identity in seen:
            continue
        seen.add(identity)
        report["documents"] += 1
        yield {"id": identity, "text": text}
        if len(seen) >= limit:
            return


def parquet_rows(path):
    """Stream only the two columns used to produce the vocabulary."""
    import pyarrow
    from pyarrow.parquet import ParquetFile

    if pyarrow.__version__ != PARQUET_VERSION:
        raise ValueError(f"run with pyarrow=={PARQUET_VERSION}")
    with ParquetFile(path) as parquet:
        for batch in parquet.iter_batches(batch_size=1024, columns=["score", "text"]):
            yield from zip(
                batch.column(0).to_pylist(), batch.column(1).to_pylist(), strict=True
            )


def verify_extractor(cli, digests, version):
    """Verify the native extractor against published checksums before running it."""
    if sha256(cli) not in digests.values():
        raise ValueError("extractor CLI does not match a pinned Release Asset")
    if subprocess.check_output([cli, "--version"], text=True).strip() != version:
        raise ValueError("CLI version does not match the generation lock")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--cli", type=lambda value: Path(value).resolve(), required=True
    )
    parser.add_argument("--dictionary", type=Path, required=True)
    parser.add_argument("--parquet", type=Path, required=True)
    parser.add_argument("--sudachi-filters", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--docs", type=int)
    parser.add_argument("--chars", type=int)
    args = parser.parse_args()
    args.sizes = (10_000,)

    locked = json.loads(LOCK.read_text(encoding="utf-8"))
    generation = locked["generation"]
    if args.docs is None:
        args.docs = generation["documentLimit"]
    if args.chars is None:
        args.chars = generation["maxProjectedCharacters"]
    if not 1 <= args.docs <= MAX_DOCS:
        raise ValueError("invalid document limit")

    if sha256(args.parquet) != locked["sha256"]:
        raise ValueError("Parquet shard does not match the dataset lock")
    dictionary = json.loads(DICTIONARY_LOCK.read_text(encoding="utf-8"))
    if sha256(args.dictionary) != dictionary["systemSha256"]:
        raise ValueError("Sudachi dictionary does not match the dictionary lock")
    verify_extractor(args.cli, locked["extractorAssets"], generation["cliVersion"])

    counts = {"rowsRead": 0, "rowsAtScore": 0, "documents": 0}
    rows = retained_documents(
        parquet_rows(args.parquet),
        counts,
        args.docs,
        args.chars,
        generation["minEducationalScore"],
    )
    source = {key: locked[key] for key in ("dataset", "revision", "subset")}
    metadata = {
        "source": source,
        "parquet": {"file": locked["file"], "sha256": locked["sha256"]},
        "minEducationalScore": generation["minEducationalScore"],
        "sudachiFilters": locked["sudachiFilters"],
        "completionPolicySha256": sha256(Path(__file__).with_name("policy.py")),
    }
    policy = analyzer_policy(args.sudachi_filters, locked["sudachiFilters"])
    materialize(
        args,
        rows,
        counts,
        metadata,
        policy,
        generation["minDocumentFrequency"],
        blocked,
        surface_alias=mixed_kana_alias,
    )


if __name__ == "__main__":
    main()
