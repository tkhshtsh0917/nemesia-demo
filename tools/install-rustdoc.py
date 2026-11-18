"""Install the verified release's static Rust API reference into the site."""

import shutil
import sys
import tarfile
from pathlib import Path, PurePosixPath

MAX_ENTRIES = 5000
MAX_BYTES = 64 * 1024 * 1024
EXPECTED = (
    "index.html",
    "nemesia_engine/index.html",
    "nemesia_index/index.html",
    "nemesia_builder/index.html",
    "nemesia_analyzer/index.html",
    "nemesia_wasm/index.html",
)


def install(archive: Path, destination: Path) -> None:
    destination.mkdir(parents=True)
    try:
        total = 0
        with tarfile.open(archive, mode="r|gz") as bundle:
            for count, entry in enumerate(bundle, 1):
                path = PurePosixPath(entry.name)
                total += entry.size
                if (
                    count > MAX_ENTRIES
                    or total > MAX_BYTES
                    or path.is_absolute()
                    or ".." in path.parts
                    or "\\" in entry.name
                    or entry.issparse()
                ):
                    raise ValueError("Invalid rustdoc archive entry")

                target = destination.joinpath(*path.parts)
                if entry.isdir():
                    target.mkdir(parents=True, exist_ok=True)
                elif entry.isfile() and path.parts:
                    target.parent.mkdir(parents=True, exist_ok=True)
                    source = bundle.extractfile(entry)
                    if source is None:
                        raise ValueError("Missing rustdoc file data")
                    with source, target.open("xb") as output:
                        shutil.copyfileobj(source, output)
                else:
                    raise ValueError("Unsupported rustdoc archive entry type")

        if any(not (destination / path).is_file() for path in EXPECTED):
            raise ValueError("Rustdoc archive is missing an entry page")
    except BaseException:
        shutil.rmtree(destination)
        raise


if __name__ == "__main__":
    install(Path(sys.argv[1]), Path(sys.argv[2]))
