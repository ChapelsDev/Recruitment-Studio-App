import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter/painting.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/features/composition/font_catalog.dart';

class _ObservedBundle extends CachingAssetBundle {
  _ObservedBundle({this.badAsset, this.missing = false});
  final String? badAsset;
  final bool missing;
  final counts = <String, int>{};
  @override
  Future<ByteData> load(String key) async {
    counts[key] = (counts[key] ?? 0) + 1;
    if (key == badAsset) {
      if (missing) {
        throw FlutterError('missing local $key');
      }
      return ByteData.sublistView(Uint8List.fromList([0, 1, 2]));
    }
    return rootBundle.load(key);
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test('T04 catalog registers only once-read verified font bytes without loader reread', () async {
    final source = _ObservedBundle();
    final catalog = await FontCatalog.load(bundle: source);
    expect(catalog.faces, hasLength(5));
    expect(source.counts, hasLength(6));
    expect(
      source.counts.values.every((n) => n == 1),
      isTrue,
      reason: 'loader must not reread bytes after verification',
    );
  });
  for (final asset in [
    'assets/fonts/font-coverage.json',
    'assets/fonts/DM-Sans-400.ttf',
    'assets/fonts/DM-Sans-500.ttf',
    'assets/fonts/DM-Sans-600.ttf',
    'assets/fonts/DM-Sans-700.ttf',
    'assets/fonts/DM-Serif-Display-400.ttf',
  ]) {
    for (final missing in [false, true]) {
      test(
        'T04 catalog refuses ${missing ? 'missing' : 'corrupt'} $asset without replacing loaded catalog',
        () async {
          final good = await FontCatalog.load();
          await expectLater(
            FontCatalog.load(
              bundle: _ObservedBundle(badAsset: asset, missing: missing),
            ),
            throwsA(missing ? isA<FlutterError>() : isA<StateError>()),
          );
          expect(FontCatalog.bundled, same(good));
          expect(good.face('DM Sans', 400).unsupported('É\r\nœ'), isEmpty);
        },
      );
    }
  }

  test(
    'T04 catalog authenticates all five bundled face identities and cmap',
    () async {
      final catalog = await FontCatalog.load();
      expect(catalog.faces.length, 5);
      for (final weight in [400, 500, 600, 700]) {
        final face = catalog.face('DM Sans', weight);
        expect(face.weight, weight);
        expect(face.family, 'DM Sans');
        expect(face.asset, 'assets/fonts/DM-Sans-$weight.ttf');
        expect(face.unsupported('É Zürich Straße œuvre\nSão João'), isEmpty);
        expect(face.unsupported('A😀'), [0x1f600]);
        expect(() => face.codepoints.add(0x1f600), throwsUnsupportedError);
      }
      expect(
        catalog
            .face('DM Serif Display', 400)
            .unsupported('É Zürich Straße œuvre'),
        isEmpty,
      );
      expect(() => catalog.face('DM Serif Display', 700), throwsStateError);
      expect(() => catalog.face('Other', 400), throwsStateError);
      expect(() => catalog.faces.clear(), throwsUnsupportedError);
      final narrow = TextPainter(
        text: const TextSpan(
          text: 'iiii',
          style: TextStyle(fontFamily: 'DM Sans', fontSize: 30),
        ),
        textDirection: TextDirection.ltr,
      )..layout();
      final wide = TextPainter(
        text: const TextSpan(
          text: 'WWWW',
          style: TextStyle(fontFamily: 'DM Sans', fontSize: 30),
        ),
        textDirection: TextDirection.ltr,
      )..layout();
      expect(narrow.width, lessThan(wide.width));
      narrow.dispose();
      wide.dispose();
    },
  );
}
