"""Build-only tests; fixtures are original checked-in local DM font bytes."""
import hashlib
import json
from pathlib import Path
import tempfile
import shutil
import subprocess
import sys
import unittest
from unittest.mock import patch

from fontTools.ttLib import TTFont

from tool.build_font_coverage import generate

APP = Path(__file__).resolve().parents[1]
FONTS = APP / "assets/fonts"
EXPECTED = [
    ("DM Sans", 400, "DM-Sans-400.ttf"),
    ("DM Sans", 500, "DM-Sans-500.ttf"),
    ("DM Sans", 600, "DM-Sans-600.ttf"),
    ("DM Sans", 700, "DM-Sans-700.ttf"),
    ("DM Serif Display", 400, "DM-Serif-Display-400.ttf"),
]


class CoverageGeneratorTests(unittest.TestCase):
    def test_deterministic_unicode_cmap_metadata_for_exact_five_faces(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / "coverage.json"
            generate(FONTS, output)
            first = output.read_bytes()
            generate(FONTS, output)
            self.assertEqual(output.read_bytes(), first)
            manifest = json.loads(first)
            self.assertEqual(manifest["schemaVersion"], 1)
            self.assertEqual(manifest["modelVersion"], "editorial-b-v1")
            self.assertEqual(len(manifest["faces"]), 5)
            for face, (family, weight, name) in zip(manifest["faces"], EXPECTED):
                self.assertEqual(face["family"], family)
                self.assertEqual(face["weight"], weight)
                self.assertEqual(face["asset"], "assets/fonts/" + name)
                self.assertEqual(face["sha256"], hashlib.sha256((FONTS / name).read_bytes()).hexdigest())
                with TTFont(FONTS / name) as font:
                    cmap = font.getBestCmap()
                    expected = sorted(cp for cp, glyph in cmap.items() if font.getGlyphID(glyph) != 0)
                    self.assertEqual(face["codepoints"], expected)
                    self.assertEqual(face["version"], font["name"].getDebugName(5))
                self.assertIn(ord("ã"), face["codepoints"])
                self.assertNotIn(0x1F600, face["codepoints"])


    def assert_rejected_preserving_output(self, mutate, reason):
        with tempfile.TemporaryDirectory() as tmp:
            fonts = Path(tmp) / "fonts"
            shutil.copytree(FONTS, fonts)
            output = Path(tmp) / "coverage.json"
            generate(fonts, output)
            valid = output.read_bytes()
            mutate(fonts / "DM-Serif-Display-400.ttf")  # late failure after four good faces
            with self.assertRaisesRegex(ValueError, reason):
                generate(fonts, output)
            self.assertEqual(output.read_bytes(), valid)

    def test_missing_font_preserves_valid_manifest(self):
        self.assert_rejected_preserving_output(lambda p: p.unlink(), "DM-Serif-Display-400.ttf.*missing")

    def test_malformed_font_preserves_valid_manifest(self):
        self.assert_rejected_preserving_output(lambda p: p.write_bytes(b"not a font"), "DM-Serif-Display-400.ttf.*TrueType")

    def test_wrong_family_preserves_valid_manifest(self):
        def mutate(path):
            with TTFont(path) as font:
                font["name"].setName("Foreign Family", 1, 3, 1, 0x409)
                font["name"].setName("Foreign Family", 16, 3, 1, 0x409)
                font.save(path)
        self.assert_rejected_preserving_output(mutate, "DM-Serif-Display-400.ttf.*family")

    def test_wrong_weight_preserves_valid_manifest(self):
        def mutate(path):
            with TTFont(path) as font:
                font["OS/2"].usWeightClass = 700
                font.save(path)
        self.assert_rejected_preserving_output(mutate, "DM-Serif-Display-400.ttf.*weight")

    def test_empty_unicode_cmap_preserves_valid_manifest(self):
        def mutate(path):
            with TTFont(path) as font:
                for table in font["cmap"].tables:
                    if table.isUnicode():
                        table.cmap = {}
                font.save(path)
        self.assert_rejected_preserving_output(mutate, "DM-Serif-Display-400.ttf.*Unicode cmap")


    def test_corrupt_truetype_glyph_table_preserves_valid_manifest(self):
        def mutate(path):
            with TTFont(path) as font:
                table = font.reader.tables["glyf"]
                offset = table.offset + table.length // 2
            data = bytearray(path.read_bytes())
            data[offset] ^= 1
            path.write_bytes(data)
        self.assert_rejected_preserving_output(mutate, "DM-Serif-Display-400.ttf.*malformed TrueType")

    def test_failed_atomic_publish_preserves_valid_output_and_cleans_temp(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / "coverage.json"
            generate(FONTS, output)
            valid = output.read_bytes()
            with patch("os.replace", side_effect=OSError("publication denied")):
                with self.assertRaisesRegex(OSError, "publication denied"):
                    generate(FONTS, output)
            self.assertEqual(output.read_bytes(), valid)
            self.assertEqual(list(Path(tmp).iterdir()), [output])

    def run_cli(self, fonts, output):
        return subprocess.run(
            [sys.executable, str(APP / "tool/build_font_coverage.py"),
             "--font-dir", str(fonts), "--output", str(output)],
            env={"PATH": "/usr/local/bin:/usr/bin:/bin", "LANG": "C.UTF-8", "TMPDIR": tempfile.gettempdir()},
            capture_output=True, text=True, check=False,
        )

    def test_cli_writes_same_deterministic_manifest(self):
        with tempfile.TemporaryDirectory() as tmp:
            expected = Path(tmp) / "expected.json"
            output = Path(tmp) / "actual.json"
            generate(FONTS, expected)
            result = self.run_cli(FONTS, output)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertTrue(output.exists(), "CLI must generate the manifest, not silently exit")
            self.assertEqual(output.read_bytes(), expected.read_bytes())

    def test_cli_invalid_fonts_exits_nonzero_without_replacing_valid_output(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / "coverage.json"
            generate(FONTS, output)
            valid = output.read_bytes()
            result = self.run_cli(Path(tmp) / "missing", output)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("DM-Sans-400.ttf: missing font", result.stderr)
            self.assertEqual(output.read_bytes(), valid)


if __name__ == "__main__":
    unittest.main()
