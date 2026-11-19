"""Choose dictionary nouns suited to the public completion demo."""

import re
import unicodedata

from tools.data.commoncrawl.build import POLICY, sha256

TERM = re.compile(r"[ぁ-ゖァ-ヺ一-鿿][ぁ-ゖァ-ヺ一-鿿々ー・]{1,23}")
FRAGMENTS = frozenset(
    {"アー", "ウィ", "ファー", "エー", "イー", "オー", "オブ", "ヴァ", "っぽ", "っつ"}
)
EXACT = frozenset(
    {
        "風俗",
        "援助交際",
        "売春",
        "買春",
        "売買春",
        "裸",
        "全裸",
        "裸体",
        "セクシー",
        "エッチ",
        "エロ",
        "エロい",
        "いやらしい",
        "痴女",
        "痴漢",
        "変態",
    }
)
EXPLICIT = (
    "アダルト",
    "成人向け",
    "エロ漫画",
    "エロ画像",
    "エロ動画",
    "エロ小説",
    "エロサイト",
    "エロティック",
    "ポルノ",
    "セックス",
    "性交",
    "性行為",
    "性的サービス",
    "わいせつ",
    "猥褻",
    "淫行",
    "淫乱",
    "卑猥",
    "自慰",
    "強姦",
    "レイプ",
    "性器",
    "陰茎",
    "陰部",
    "精液",
    "男性器",
    "女性器",
    "勃起",
    "射精",
    "巨乳",
    "貧乳",
    "乳首",
    "乳輪",
    "フェラ",
    "オナニー",
    "パイズリ",
    "パンチラ",
    "デリヘル",
    "ソープランド",
    "ストリップ",
    "無修正",
    "ラブホテル",
    "ラブホ",
    "性風俗",
    "濡れ場",
)


def canonical(text):
    """Fold Unicode width and kana variants for policy comparisons."""
    return "".join(
        chr(ord(c) - 96) if "ァ" <= c <= "ヶ" else c
        for c in unicodedata.normalize("NFKC", text).casefold()
    )


EXCLUSIONS = frozenset(canonical(term) for term in FRAGMENTS | EXACT)
EXPLICIT_FRAGMENTS = tuple(canonical(term) for term in EXPLICIT)


def blocked(text, *, alias=False):
    """Reject reviewed unsuitable forms and fragments before index compilation."""
    key = canonical(text)
    if key in EXCLUSIONS or any(piece in key for piece in EXPLICIT_FRAGMENTS):
        return True
    if alias:
        return False
    return TERM.fullmatch(text) is None or "\u30fb\u30fb" in text or text.endswith("・")


def meaningful_lines(text):
    """Read the active entries of a Lucene word or tag list."""
    return [
        line.strip()
        for line in text.splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    ]


def analyzer_policy(directory, pins):
    """Load exact licensed upstream files, then add demo-specific POS restrictions."""
    checked = {}
    for name in ("stopwords.txt", "stoptags.txt"):
        path = directory / name
        if sha256(path) != pins[name]:
            raise ValueError(f"upstream {name} does not match its lock")
        checked[name] = meaningful_lines(path.read_text(encoding="utf-8-sig"))

    tags = [
        tuple(part.strip() for part in tag.split(","))
        for tag in checked["stoptags.txt"]
    ]
    if any(not tag or any(not part for part in tag) for tag in tags):
        raise ValueError("invalid upstream part-of-speech path")

    return {
        **POLICY,
        "split_mode": "C",
        "stopwords": sorted(set(POLICY["stopwords"] + checked["stopwords.txt"])),
        "stoptags": sorted(
            set(
                tags
                + [tuple(tag) for tag in POLICY["stoptags"]]
                + [
                    ("名詞", "普通名詞", "助数詞可能"),
                ]
            )
        ),
    }
