"""Cover WET boundaries, selection rules, and deterministic candidate ranking."""

import gzip
import hashlib
import json
import tempfile
import unittest
from collections import Counter, defaultdict
from pathlib import Path

from tools.data.commoncrawl.build import candidates, documents
from tools.data.commoncrawl.snapshot import snapshot
from tools.data.commoncrawl.wet import japanese_records, projection

BODY = "日本の鉄道と地域の歴史について資料を読みました。"


def record(body, *, lang="eng,jpn", host="example.test", size=None, kind="conversion"):
    raw = body.encode()
    size = len(raw) if size is None else size
    headers = (
        "WARC/1.1\r\n"
        f"WARC-Type: {kind}\r\n"
        f"WARC-Identified-Content-Language: {lang}\r\n"
        f"WARC-Target-URI: https://{host}/example\r\n"
        f"Content-Length: {size}\r\n\r\n"
    )
    return headers.encode() + raw + b"\r\n\r\n"


class WetTest(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.shard = Path(directory.name) / "one.wet.gz"

    def test_records_use_byte_lengths_and_select_japanese_conversion(self):
        body = f"{BODY}\r\n\r\nWARC/1.0\r\n{BODY}"
        self.shard.write_bytes(
            gzip.compress(record(BODY, lang="eng") + record(BODY, kind="warcinfo"))
            + gzip.compress(record(body, host="www.example.test"))
        )

        self.assertEqual(list(japanese_records(self.shard)), [("example.test", body)])

    def test_truncated_body_rejects_the_shard(self):
        self.shard.write_bytes(gzip.compress(record(BODY, size=1000)))

        with self.assertRaisesRegex(ValueError, "truncated WET body"):
            list(japanese_records(self.shard))

    def test_projection_and_deduplication_apply_across_hosts(self):
        alternate = "日本の風景や暮らしを題材とした写真を見つけました。"
        self.shard.write_bytes(
            gzip.compress(
                record(f"menu\n{BODY}\x00\n{BODY}")
                + record(alternate)
                + record(BODY, host="second.test")
                + record(alternate, host="second.test")
            )
        )
        report = {"japaneseRecords": 0, "documents": 0, "hosts": 0}
        rows = list(documents([self.shard], limit=10, host_limit=1, report=report))

        self.assertEqual([row["text"] for row in rows], [BODY, alternate])
        self.assertEqual(report, {"japaneseRecords": 4, "documents": 2, "hosts": 2})
        self.assertEqual(len(projection(BODY * 10, 15)), 15)

    def test_ranked_subsets_keep_stable_ids_and_strongest_aliases(self):
        frequency = Counter({"紅葉": 2, "京都": 3, "旅行": 1, "日本": 3})
        readings = defaultdict(Counter, {"京都": Counter({"kyouto": 3, "きょうと": 1})})

        rows = list(candidates(frequency, readings))
        self.assertEqual([row["text"] for row in rows], ["京都", "日本", "紅葉"])
        self.assertEqual([row["id"] for row in rows], [1, 2, 3])
        self.assertEqual(rows[0]["aliases"], ["kyouto", "きょうと"])

    def test_snapshot_verifies_the_measured_vocabulary_prefix(self):
        source = self.shard.parent
        destination = source / "selected"
        first = b'{"id":1}\n'
        payload = gzip.compress(first + b'{"id":2}\n')
        rules = b"{}"
        (source / "candidates.jsonl.gz").write_bytes(payload)
        (source / "rules.json").write_bytes(rules)
        report = {
            "indexes": [
                {"count": 1, "candidateSha256": hashlib.sha256(first).hexdigest()}
            ],
            "candidatesArchiveSha256": hashlib.sha256(payload).hexdigest(),
            "rulesSha256": hashlib.sha256(rules).hexdigest(),
            "crawl": "CC-MAIN-2026-43",
            "documents": 2,
            "hosts": 1,
            "minDocumentFrequency": 2,
            "dictionarySha256": "d",
            "cliSha256": "c",
        }
        (source / "corpus.json").write_text(json.dumps(report), encoding="utf-8")

        snapshot(source, destination, 1)
        self.assertEqual(
            gzip.decompress((destination / "candidates.jsonl.gz").read_bytes()), first
        )
        self.assertEqual((destination / "rules.json").read_bytes(), rules)

        (source / "rules.json").write_bytes(b"tampered")
        with self.assertRaisesRegex(ValueError, "artifact hash mismatch"):
            snapshot(source, source / "invalid", 1)
        self.assertFalse((source / "invalid").exists())


if __name__ == "__main__":
    unittest.main()
