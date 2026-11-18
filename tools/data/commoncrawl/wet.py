"""Read bounded WET records and project Japanese text for Sudachi."""

import gzip
import re
import unicodedata
from pathlib import Path
from urllib.parse import urlsplit

MAX_RECORD = 8 * 1024 * 1024
MAX_HEADER_LINE = 16_384
JAPANESE = re.compile(r"[ぁ-ゖァ-ヶ一-龯々]")
LONG_ASCII = re.compile(r"[!-~]{200,}")


def read_headers(stream):
    """Return WARC fields, or None after EOF."""
    version = stream.readline(MAX_HEADER_LINE)
    while version in (b"\r\n", b"\n"):
        version = stream.readline(MAX_HEADER_LINE)
    if not version:
        return None
    if version.rstrip(b"\r\n") not in (b"WARC/1.0", b"WARC/1.1"):
        raise ValueError("invalid WET record version")

    headers = {}
    for _ in range(100):
        line = stream.readline(MAX_HEADER_LINE)
        if line in (b"\r\n", b"\n"):
            return headers
        name, separator, value = line.partition(b":")
        key = name.lower()
        if not separator or not line.endswith(b"\n") or key in headers:
            raise ValueError("invalid WET header")
        headers[key] = value.strip()
    raise ValueError("too many WET headers")


def japanese_records(path: Path):
    """Yield (hostname, plaintext) for Japanese conversion records."""
    with gzip.open(path, "rb") as stream:
        while (headers := read_headers(stream)) is not None:
            raw_size = headers.get(b"content-length", b"")
            if len(raw_size) > 8 or not raw_size.isdigit():
                raise ValueError("invalid WET content length")
            size = int(raw_size)
            if size > MAX_RECORD:
                raise ValueError("WET record exceeds size limit")

            body = stream.read(size)
            if len(body) != size:
                raise ValueError("truncated WET body")
            languages = re.split(
                rb"[,;\s]+",
                headers.get(b"warc-identified-content-language", b"").lower(),
            )
            if headers.get(b"warc-type") != b"conversion" or b"jpn" not in languages:
                continue

            try:
                url = urlsplit(headers[b"warc-target-uri"].decode("utf-8"))
                host = url.hostname
            except (KeyError, UnicodeError, ValueError):
                continue
            if url.scheme in ("http", "https") and host:
                yield (
                    host.rstrip(".").removeprefix("www."),
                    body.decode("utf-8", errors="replace"),
                )


def projection(body: str, character_limit: int = 4_800) -> str:
    """Keep varied Japanese prose and bound the tokenizer input per page."""
    lines = []
    seen = set()
    written = 0
    for raw in body.splitlines():
        cleaned = "".join(
            c
            for c in unicodedata.normalize("NFKC", raw)
            if not unicodedata.category(c).startswith("C") or c.isspace()
        )
        line = " ".join(cleaned.split())
        if len(JAPANESE.findall(line)) < 8 or line in seen:
            continue
        line = LONG_ASCII.sub(" ", line)
        remaining = character_limit - written
        line = line[:remaining].strip()
        if line:
            lines.append(line)
            seen.add(line)
            written += len(line) + 1
        if written >= character_limit:
            break
    return "\n".join(lines)
