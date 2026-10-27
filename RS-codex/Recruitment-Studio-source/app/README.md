# Recrutamento — T00 core candidate

This is the empty Editorial B Flutter bootstrap, **not the finished product**.
`main()` launches `buildApplication()`. The only content is the neutral title and
**Criar projeto**, explicitly disabled until the session controller is implemented.
There is no project creation, demo data, editor, translation, export, backend or
telemetry. Windows/Android are the scaffold's only platform targets. Generated
icons and scaffold package version `1.0.0+1` are development placeholders, not
approved release identity/version/signing.

## Reproduce the verified Linux core

The verified SDK is Flutter **3.47.5 / Dart 3.13.4**, under
`/home/hermes/.local/share/recruitment-toolchains/3.47.5/flutter`. Use a small explicit
subprocess environment (HOME, USER/LOGNAME, PATH, LANG, TMPDIR, CI=true, PUB_CACHE,
FLUTTER_SUPPRESS_ANALYTICS=true, DART_SUPPRESS_ANALYTICS=true), never the whole agent
or provider environment. SDK/cache provenance and native gaps are recorded by the
parent under `../docs/build/`; chronological author evidence is
`../docs/releases/0.1.0/tdd/T00-hermes.md` (historical R1) and
`../docs/releases/0.1.0/tdd/T00-fix-01.md` (canonical-path correction).

From this directory with that SDK/environment:

```text
flutter pub get --enforce-lockfile
flutter test test/bootstrap_test.dart
flutter test test/canonical_font_paths_test.dart
flutter test test/font_assets_test.dart test/font_loading_test.dart test/theme_test.dart test/overflow_test.dart
flutter test --coverage
flutter analyze
dart format --output=none --set-exit-if-changed lib test tool
```

The five exact candidate packages are file_selector 1.1.0, path_provider 2.1.6,
archive 4.3.0, image 4.10.1 and crypto 3.0.7. SDK `flutter_test` and
`integration_test` are development dependencies. Keep `pubspec.lock`.
Native builds/device tests have **not run**; core widget/source tests are not
Windows/APK/SAF evidence. No Linux/web target or native infrastructure was added.

## Local fonts and reproducible build-only coverage

Exactly five DM TrueType faces were extracted from the original local
`../design-studies/v1/estudo-B.html` bytes, with the two original OFLs copied unchanged.
Their exact canonical paths under `assets/fonts/` are `DM-Sans-400.ttf`,
`DM-Sans-500.ttf`, `DM-Sans-600.ttf`, `DM-Sans-700.ttf`, and
`DM-Serif-Display-400.ttf`; no alternate-name copies or aliases are retained.
The pubspec registers DM Sans 400/500/600/700 and DM Serif Display 400. Widget suites
initialize the test binding and call `loadBundledFonts()`; the harness loads only
these assets and propagates load failures. Native Flutter uses pubspec font
registration. No remote font provider is used.

Python/FontTools are **development-only**, not application/user runtime requirements.
The verified dedicated interpreter is
`/home/hermes/.local/share/recruitment-toolchains/fonttools-4.60.2-venv/bin/python`
(Python 3.14.7, FontTools 4.60.2); dependencies are pinned in `tool/requirements.txt`.
The original `fonttools-3.14-venv` / 4.60.1 environment is retained unchanged for
historical evidence. The new environment was installed from a verified public PyPI
wheel; its generator output is byte-identical to the post-canonical-rename manifest.
Provenance and test outcomes are in the correction report above.
With an equivalent dedicated venv and its Python:

```text
python -m pip --isolated install --index-url https://pypi.org/simple -r tool/requirements.txt
python -m unittest discover -s tool -p 'test_*.py' -v
python tool/build_font_coverage.py
```

The generator defaults resolve relative to its own file, not the caller's working
directory. Optional `--font-dir` and `--output` take explicit paths. It validates
TrueType magic/tables/checksums and eagerly parses all tables, then checks name
family, OS/2 weight and nonempty Unicode cmap, emits
sorted nonzero-glyph codepoints and family/weight/version/SHA256 under schema 1 /
`editorial-b-v1`, and publishes via same-directory atomic replacement. Missing or
malformed input and failed publication do not replace a valid output. A missing
output parent is an error; no destination is invented. The bundled manifest is
checked against font hashes and original output by host tests. Missing glyphs are
coverage facts, not permission to silently translate or replace future user text.

Host tests use checked-in original bytes and read relative checkout paths for
integrity only; they are not device integration tests or device fixtures. The
future T01/domain/session/editor work remains outside this candidate.
