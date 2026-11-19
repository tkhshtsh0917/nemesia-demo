"""Verify score selection, stop-list parsing, and the committed demo vocabulary."""

import gzip
import json
import tempfile
import unittest
from pathlib import Path

from tools.data.commoncrawl.build import candidates, sha256
from tools.data.fineweb.build import retained_documents, verify_extractor
from tools.data.fineweb.policy import analyzer_policy, blocked, completion_aliases

ROOT = Path("data/demo-vocabulary")


class FineWebTest(unittest.TestCase):
    def test_extractor_rejects_an_unpinned_binary_before_invocation(self):
        with tempfile.TemporaryDirectory() as temp:
            cli = Path(temp) / "nemesia"
            cli.write_bytes(b"unverified binary")
            lock = json.loads(
                Path("data/fineweb.lock.json").read_text(encoding="utf-8")
            )

            with self.assertRaisesRegex(ValueError, "pinned Release Asset"):
                verify_extractor(cli, lock["extractorAssets"], "nemesia 0.1.0")

    def test_score_filter_and_projection_deduplicate(self):
        body = "教育と研究によって知識を深め、人々の暮らしを改善します。"
        counts = {"rowsRead": 0, "rowsAtScore": 0, "documents": 0}
        rows = list(
            retained_documents(
                [
                    (None, body),
                    (float("nan"), body),
                    (3.24, body),
                    (3.25, body),
                    (3.3, body),
                    (3.3, "ASCII only"),
                ],
                counts,
                20,
                200,
                3.25,
            )
        )
        self.assertEqual([row["text"] for row in rows], [body])
        self.assertEqual(counts, {"rowsRead": 6, "rowsAtScore": 3, "documents": 1})

    def test_upstream_stop_lists_preserve_only_active_rules(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            paths = {
                "stopwords.txt": "# description\n\nの\nする\n",
                "stoptags.txt": "#名詞,固有名詞\n\n助詞,格助詞\n",
            }
            for name, raw in paths.items():
                (root / name).write_text(raw, encoding="utf-8")
            pins = {name: sha256(root / name) for name in paths}
            policy = analyzer_policy(root, pins)
            self.assertIn("の", policy["stopwords"])
            self.assertIn(("助詞", "格助詞"), policy["stoptags"])
            self.assertNotIn(("名詞", "固有名詞"), policy["stoptags"])
            self.assertEqual(policy["split_mode"], "C")
            (root / "stopwords.txt").write_text("変更", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "does not match its lock"):
                analyzer_policy(root, pins)

    def test_demo_policy_selects_terms_and_checks_aliases_separately(self):
        frequency = {"年": 20, "ｱﾀﾞﾙﾄ": 18, "オブ": 15, "京都": 12, "科学": 11}
        readings = {"京都": {"きょうと": 12, "kyouto": 12, "ぽるの": 1}, "科学": {}}
        self.assertEqual(
            list(candidates(frequency, readings, 5, blocked)),
            [
                {
                    "id": 1,
                    "text": "京都",
                    "weight": 12,
                    "aliases": ["kyouto", "きょうと"],
                },
                {"id": 2, "text": "科学", "weight": 11, "aliases": []},
            ],
        )
        self.assertFalse(blocked("水力発電"))
        self.assertFalse(blocked("イエロー"))
        self.assertTrue(blocked("ーアイ"))

    def test_reviewed_words_and_fragments_are_classified_independently(self):
        for word in (
            "性欲",
            "セイヨク",
            "sEIyoku",
            "ﾉﾝ",
            "ディ",
            "デー",
            "プレ",
            "ポリ",
            "グラ",
            "シス",
            "以下",
            "上記",
            "当該",
            "レイプ事件",
            "陰茎",
            "ﾍﾟﾆｽ",
            "ぺにす",
            "PENISU",
        ):
            with self.subTest(word=word):
                self.assertTrue(blocked(word))
                self.assertTrue(blocked(word, alias=True))

        for word in (
            "水",
            "薬",
            "猫",
            "本",
            "家",
            "車",
            "卵",
            "塩",
            "駅",
            "茶",
            "鍵",
            "木",
            "肉",
            "紙",
            "ｅメール",
            "ビタミンC",
            "フェライト",
            "グレイプフルーツ",
            "ストリップライン",
            "ディスプレー",
            "ポリフェノール",
            "プレゼント",
            "グラフ",
            "システム",
        ):
            with self.subTest(word=word):
                self.assertFalse(blocked(word))

    def test_standalone_car_reading_ignores_contextual_variants(self):
        observed = ["guruma", "ぐるま", "グルマ", "kuruma", "くるま", "クルマ"]
        self.assertEqual(completion_aliases("車", observed), observed[3:])
        self.assertEqual(completion_aliases("車椅子", observed), observed)

    def test_mixed_input_prioritizes_reviewed_keys_within_the_alias_limit(self):
        self.assertEqual(completion_aliases("ビタミンc", []), ["びたみんc"])
        self.assertEqual(completion_aliases("メール", ["めーる"]), ["めーる"])
        self.assertEqual(completion_aliases("eめーる", []), [])

        observed = {"eめーる": 20, "email": 10, "e-mail": 8, "i-me-ru": 1}
        [row] = candidates(
            {"eメール": 25},
            {"eメール": observed},
            5,
            blocked,
            select_aliases=completion_aliases,
        )
        self.assertEqual(
            row["aliases"],
            [
                "eめーる",
                "eme-ru",
                "emeru",
                "email",
                "iimeeru",
                "いいめえる",
                "いーめーる",
                "イーメール",
            ],
        )

    def test_checked_in_snapshot_obeys_demo_policy(self):
        lock = json.loads(Path("data/fineweb.lock.json").read_text(encoding="utf-8"))
        snapshot = json.loads((ROOT / "snapshot.json").read_text(encoding="utf-8"))
        report = json.loads((ROOT / "corpus.json").read_text(encoding="utf-8"))
        self.assertEqual(
            snapshot["source"],
            {name: lock[name] for name in ("dataset", "revision", "subset")},
        )
        self.assertEqual(
            report["completionPolicySha256"],
            sha256(Path(__file__).with_name("policy.py")),
        )
        with gzip.open(ROOT / "candidates.jsonl.gz", "rt", encoding="utf-8") as stream:
            rows = [json.loads(line) for line in stream]

        self.assertEqual(len(rows), snapshot["count"])
        self.assertEqual(len({row["text"] for row in rows}), len(rows))
        words = {row["text"] for row in rows}
        self.assertTrue(
            {
                "世界",
                "京都",
                "日本",
                "ビタミン",
                "水",
                "薬",
                "猫",
                "本",
                "家",
                "車",
                "卵",
                "塩",
                "駅",
                "茶",
                "鍵",
                "木",
                "肉",
                "紙",
                "eメール",
            }
            <= words
        )
        self.assertTrue(
            {
                "性欲",
                "ノン",
                "ディ",
                "デー",
                "プレ",
                "ポリ",
                "グラ",
                "シス",
                "陰茎",
                "ペニス",
                "以下",
                "上記",
                "当該",
            }.isdisjoint(words)
        )
        aliases = {row["text"]: set(row["aliases"]) for row in rows}
        self.assertEqual(aliases["車"], {"kuruma", "くるま", "クルマ"})
        self.assertTrue(
            {
                "eめーる",
                "eme-ru",
                "emeru",
                "email",
                "iimeeru",
                "いいめえる",
                "いーめーる",
                "イーメール",
            }
            <= aliases["eメール"]
        )
        self.assertTrue(all(not blocked(row["text"]) for row in rows))
        self.assertTrue(
            all(
                not blocked(alias, alias=True)
                for row in rows
                for alias in row["aliases"]
            )
        )
