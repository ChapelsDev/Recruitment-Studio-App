import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/app_bootstrap.dart';

class _BrokenBundle extends CachingAssetBundle {
  @override
  Future<ByteData> load(String key) async =>
      throw FlutterError('missing local font: $key');
}

double _width(String family, String text, FontWeight weight) {
  final painter = TextPainter(
    text: TextSpan(
      text: text,
      style: TextStyle(fontFamily: family, fontWeight: weight, fontSize: 32),
    ),
    textDirection: TextDirection.ltr,
  )..layout();
  final width = painter.width;
  painter.dispose();
  return width;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test(
    'local loader propagates missing font errors without silent fallback',
    () async {
      await expectLater(
        loadBundledFonts(bundle: _BrokenBundle()),
        throwsA(
          isA<FlutterError>().having(
            (e) => e.message,
            'cause',
            contains('missing local font: assets/fonts/DM-Sans-400.ttf'),
          ),
        ),
      );
    },
  );

  test(
    'local harness loads proportional DM families and all four sans weights',
    () async {
      await loadBundledFonts();
      for (final family in ['DM Sans', 'DM Serif Display']) {
        expect(
          _width(family, 'iiii', FontWeight.w400),
          lessThan(_width(family, 'WWWW', FontWeight.w400)),
        );
      }
      final widths = [
        FontWeight.w400,
        FontWeight.w500,
        FontWeight.w600,
        FontWeight.w700,
      ].map((w) => _width('DM Sans', 'Recrutamento', w)).toSet();
      expect(widths.length, 4);
      expect(
        _width('DM Sans', 'Recrutamento', FontWeight.w400),
        isNot(_width('DM Serif Display', 'Recrutamento', FontWeight.w400)),
      );
      await loadBundledFonts(); // safe to reuse setup in subsequent suites
      expect(_width('DM Sans', 'iiii', FontWeight.w400), lessThan(40));
    },
  );
}
