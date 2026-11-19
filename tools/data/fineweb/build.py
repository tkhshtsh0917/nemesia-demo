"""Generate the public vocabulary from a pinned FineWeb2 Edu Japanese shard."""

import argparse
import hashlib
import json
import math
from pathlib import Path

from tools.data.commoncrawl.build import MAX_DOCS, materialize, sha256
from tools.data.commoncrawl.wet import projection
from tools.data.fineweb.policy import analyzer_policy, blocked

LOCK = Path("data/fineweb.lock.json")
MIN_SCORE = 3.25
MIN_DF = 5
PARQUET_VERSION = "22.0.0"


def retained_documents(records, report, limit, chars):
    """Select educational texts and deduplicate projected content in shard order."""
    seen = set()
    for score, body in records:
        report["rowsRead"] += 1
        if score is None or not math.isfinite(score) or score < MIN_SCORE or not body:
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


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--cli", type=lambda value: Path(value).resolve(), required=True
    )
    parser.add_argument("--dictionary", type=Path, required=True)
    parser.add_argument("--parquet", type=Path, required=True)
    parser.add_argument("--sudachi-filters", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--docs", type=int, default=40_000)
    parser.add_argument("--chars", type=int, default=2_400)
    args = parser.parse_args()
    args.sizes = (10_000,)
    if not 1 <= args.docs <= MAX_DOCS:
        raise ValueError("invalid document limit")

    locked = json.loads(LOCK.read_text(encoding="utf-8"))
    if sha256(args.parquet) != locked["sha256"]:
        raise ValueError("Parquet shard does not match the dataset lock")
    counts = {"rowsRead": 0, "rowsAtScore": 0, "documents": 0}
    rows = retained_documents(parquet_rows(args.parquet), counts, args.docs, args.chars)
    source = {key: locked[key] for key in ("dataset", "revision", "subset")}
    metadata = {
        "source": source,
        "parquet": {"file": locked["file"], "sha256": locked["sha256"]},
        "minEducationalScore": MIN_SCORE,
        "sudachiFilters": locked["sudachiFilters"],
        "completionPolicySha256": sha256(Path(__file__).with_name("policy.py")),
    }
    policy = analyzer_policy(args.sudachi_filters, locked["sudachiFilters"])
    materialize(args, rows, counts, metadata, policy, MIN_DF, blocked)


if __name__ == "__main__":
    main()
