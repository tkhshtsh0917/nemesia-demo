"""Select one locally evaluated vocabulary for checked-in demo builds."""

import argparse
import gzip
import hashlib
import json
import tempfile
from pathlib import Path
from shutil import copyfile

from build import sha256


def snapshot(source: Path, destination: Path, count: int):
    """Copy the verified records and query rules for one measured candidate count."""
    if destination.exists():
        raise ValueError("choose a new snapshot directory")
    report = json.loads((source / "corpus.json").read_text(encoding="utf-8"))
    matching = [item for item in report["indexes"] if item["count"] == count]
    if len(matching) != 1:
        raise ValueError("candidate count does not identify a measured index")

    archive = source / "candidates.jsonl.gz"
    rules = source / "rules.json"
    if (
        sha256(archive) != report["candidatesArchiveSha256"]
        or sha256(rules) != report["rulesSha256"]
    ):
        raise ValueError("corpus artifact hash mismatch")

    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=destination.parent) as scratch:
        staged = Path(scratch) / "snapshot"
        staged.mkdir()
        selected = staged / archive.name
        candidate_hash = hashlib.sha256()
        with (
            gzip.open(archive, "rb") as input_stream,
            selected.open("wb") as file,
            gzip.GzipFile(
                fileobj=file, mode="wb", filename="", mtime=0
            ) as output_stream,
        ):
            for _ in range(count):
                line = input_stream.readline(65_536)
                if not line.endswith(b"\n"):
                    raise ValueError("truncated or oversized candidate")
                candidate_hash.update(line)
                output_stream.write(line)

        if candidate_hash.hexdigest() != matching[0]["candidateSha256"]:
            raise ValueError("vocabulary prefix differs from the measured index")
        copyfile(rules, staged / rules.name)
        copyfile(source / "corpus.json", staged / "corpus.json")
        metadata = {
            "format": "nemesia-commoncrawl-demo/1",
            "crawl": report["crawl"],
            "count": count,
            "documents": report["documents"],
            "hosts": report["hosts"],
            "minDocumentFrequency": report["minDocumentFrequency"],
            "dictionarySha256": report["dictionarySha256"],
            "extractorSha256": report["cliSha256"],
            "corpusReportSha256": sha256(source / "corpus.json"),
            "candidateSha256": candidate_hash.hexdigest(),
            "archiveSha256": sha256(selected),
            "rulesSha256": report["rulesSha256"],
        }
        (staged / "snapshot.json").write_text(
            json.dumps(metadata, indent=2) + "\n", encoding="utf-8"
        )
        staged.rename(destination)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    parser.add_argument("--count", type=int, required=True)
    args = parser.parse_args()
    snapshot(args.source, args.destination, args.count)
