"""Regressions for the static rustdoc artifact installed into Pages."""

import importlib.util
import io
import tarfile
import tempfile
import unittest
from pathlib import Path


spec = importlib.util.spec_from_file_location(
    "install_rustdoc", Path(__file__).with_name("install-rustdoc.py")
)
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)


class RustdocInstall(unittest.TestCase):
    def test_complete_archive(self):
        with tempfile.TemporaryDirectory() as work:
            root = Path(work)
            archive = root / "docs.tar.gz"
            with tarfile.open(archive, "w:gz") as bundle:
                for path in installer.EXPECTED:
                    data = b"<!doctype html>"
                    entry = tarfile.TarInfo(f"./{path}")
                    entry.size = len(data)
                    bundle.addfile(entry, io.BytesIO(data))
            installer.install(archive, root / "site")
            self.assertEqual(
                (root / "site" / installer.EXPECTED[0]).read_bytes(), data
            )

    def test_invalid_or_incomplete_archive_leaves_no_output(self):
        with tempfile.TemporaryDirectory() as work:
            root = Path(work)
            archive = root / "docs.tar.gz"
            target = root / "site"
            for name, kind in (
                ("../outside", tarfile.REGTYPE),
                ("index.html", tarfile.SYMTYPE),
                ("index.html", tarfile.REGTYPE),
            ):
                with self.subTest(name=name, kind=kind):
                    with tarfile.open(archive, "w:gz") as bundle:
                        entry = tarfile.TarInfo(name)
                        entry.type = kind
                        entry.linkname = "../outside"
                        bundle.addfile(entry)
                    with self.assertRaises(ValueError):
                        installer.install(archive, target)
                    self.assertFalse(target.exists())
                    self.assertFalse((root / "outside").exists())


if __name__ == "__main__":
    unittest.main()
