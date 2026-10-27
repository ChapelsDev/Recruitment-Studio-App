"""Build-only Editorial B cmap manifest generator (never a runtime dependency)."""
import argparse
import hashlib
import io
import json
import os
import struct
import sys
import tempfile
from pathlib import Path

from fontTools.ttLib import TTFont, TTLibError

FACES = (
    ("DM Sans", 400, "DM-Sans-400.ttf"),
    ("DM Sans", 500, "DM-Sans-500.ttf"),
    ("DM Sans", 600, "DM-Sans-600.ttf"),
    ("DM Sans", 700, "DM-Sans-700.ttf"),
    ("DM Serif Display", 400, "DM-Serif-Display-400.ttf"),
)


def generate(font_dir: Path, output: Path) -> None:
    """Derive deterministic per-face Unicode coverage from the local TrueType cmap."""
    faces = []
    for family, weight, filename in FACES:
        path = font_dir / filename
        try:
            data = path.read_bytes()
        except FileNotFoundError as error:
            raise ValueError(f"{filename}: missing font") from error
        if data[:4] != b"\x00\x01\x00\x00":
            raise ValueError(f"{filename}: expected TrueType sfnt magic")
        try:
            with TTFont(io.BytesIO(data), checkChecksums=2) as font:
                # Force lazy tables to be parsed; metadata alone can hide corrupt outlines.
                font.ensureDecompiled()
                for table in ("glyf", "loca", "name", "OS/2", "cmap"):
                    if table not in font:
                        raise ValueError(f"{filename}: missing TrueType {table} table")
                actual_family = font["name"].getDebugName(16) or font["name"].getDebugName(1)
                if actual_family != family:
                    raise ValueError(f"{filename}: unexpected family {actual_family!r}")
                if font["OS/2"].usWeightClass != weight:
                    raise ValueError(f"{filename}: unexpected OS/2 weight")
                cmap = font.getBestCmap()
                if not cmap:
                    raise ValueError(f"{filename}: empty or missing Unicode cmap")
                faces.append({
                    "asset": "assets/fonts/" + filename,
                    "family": family,
                    "weight": weight,
                    "sha256": hashlib.sha256(data).hexdigest(),
                    "version": font["name"].getDebugName(5),
                    "codepoints": sorted(cp for cp, glyph in cmap.items() if font.getGlyphID(glyph) != 0),
                })
        except (TTLibError, KeyError, struct.error, AssertionError) as error:
            raise ValueError(f"{filename}: malformed TrueType font") from error
    manifest = {"schemaVersion": 1, "modelVersion": "editorial-b-v1", "faces": faces}
    payload = (json.dumps(manifest, ensure_ascii=False, sort_keys=True, indent=2) + "\n").encode("utf-8")
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(dir=output.parent, prefix=output.name + ".", suffix=".tmp", delete=False) as stream:
            temporary = Path(stream.name)
            stream.write(payload)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, output)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def main() -> int:
    app = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--font-dir", type=Path, default=app / "assets/fonts")
    parser.add_argument("--output", type=Path, default=app / "assets/fonts/font-coverage.json")
    args = parser.parse_args()
    try:
        generate(args.font_dir, args.output)
    except (ValueError, OSError) as error:
        print(f"font coverage: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
