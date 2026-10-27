import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

const expectedFaces = [
  (
    'DM Sans',
    400,
    'DM-Sans-400.ttf',
    48280,
    'b0ae3e89a7d3ef2b1838bb4b1ceb0b17cc3435af061eee809d76aa623ff116e9',
  ),
  (
    'DM Sans',
    500,
    'DM-Sans-500.ttf',
    48308,
    '376427b5322148d8de1e03f263bcca4935a2d60ba71d9f94f4947ab664c711ae',
  ),
  (
    'DM Sans',
    600,
    'DM-Sans-600.ttf',
    48280,
    'b79a2ea7a38f33fd96a282fadb9ce97626bb0724a44d21075859f0e50239993a',
  ),
  (
    'DM Sans',
    700,
    'DM-Sans-700.ttf',
    48200,
    '2a8e7f713ee79fbccdef3cef5c787aff47580299f7da60144961e7db2ec08211',
  ),
  (
    'DM Serif Display',
    400,
    'DM-Serif-Display-400.ttf',
    70348,
    'c03775f8cc3db88cfea259b231abe13f94e6a3d3cb01c09477a2e42a1f5919e1',
  ),
];

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  for (final face in expectedFaces) {
    test(
      'bundled ${face.$1} ${face.$2} preserves validated B TrueType bytes',
      () async {
        final data = await rootBundle.load('assets/fonts/${face.$3}');
        final bytes = data.buffer.asUint8List(
          data.offsetInBytes,
          data.lengthInBytes,
        );
        expect(bytes.length, face.$4);
        expect(bytes.take(4), [0, 1, 0, 0]);
        expect(sha256.convert(bytes).toString(), face.$5);
      },
    );
  }
  test(
    'font manifest registers exactly five weighted DM faces and no A fonts',
    () async {
      final manifest =
          jsonDecode(await rootBundle.loadString('FontManifest.json')) as List;
      final dm = manifest
          .where((dynamic f) => (f['family'] as String).startsWith('DM '))
          .toList();
      expect(dm.length, 2);
      final actual = <(String, int, String)>[];
      for (final dynamic family in dm) {
        for (final dynamic face in family['fonts']) {
          actual.add((
            family['family'] as String,
            face['weight'] as int,
            face['asset'] as String,
          ));
        }
      }
      expect(
        actual,
        expectedFaces.map((f) => (f.$1, f.$2, 'assets/fonts/${f.$3}')).toList(),
      );
      final disk =
          Directory('assets/fonts')
              .listSync()
              .whereType<File>()
              .where((f) => f.path.endsWith('.ttf'))
              .map((f) => f.uri.pathSegments.last)
              .toList()
            ..sort();
      expect(disk, expectedFaces.map((f) => f.$3).toList()..sort());
      expect(
        manifest.any(
          (dynamic f) =>
              ['Barlow Condensed', 'IBM Plex Sans'].contains(f['family']),
        ),
        isFalse,
      );
    },
  );
  test(
    'generated cmap manifest is bundled, exact and usable offline',
    () async {
      final text = await rootBundle.loadString(
        'assets/fonts/font-coverage.json',
      );
      expect(text, File('assets/fonts/font-coverage.json').readAsStringSync());
      final manifest = jsonDecode(text) as Map<String, dynamic>;
      expect(manifest['schemaVersion'], 1);
      expect(manifest['modelVersion'], 'editorial-b-v1');
      final faces = manifest['faces'] as List;
      expect(faces.length, expectedFaces.length);
      for (var i = 0; i < faces.length; i++) {
        final face = faces[i] as Map<String, dynamic>;
        final expected = expectedFaces[i];
        expect(face['asset'], 'assets/fonts/${expected.$3}');
        expect(face['family'], expected.$1);
        expect(face['weight'], expected.$2);
        expect(face['sha256'], expected.$5);
        expect(face['version'], startsWith('Version '));
        final codepoints = (face['codepoints'] as List).cast<int>();
        expect(codepoints, codepoints.toSet().toList()..sort());
        expect(codepoints.length, expected.$1 == 'DM Sans' ? 403 : 333);
        expect(
          codepoints,
          containsAll('RecrutamentoCriar projetoã'.runes.toSet()),
        );
        expect(codepoints, isNot(contains(0x1f600)));
      }
    },
  );

  for (final file in ['dmsans-OFL.txt', 'dmserifdisplay-OFL.txt']) {
    test('$file is bundled with unchanged upstream bytes', () async {
      final original = File('../design-studies/v1/licenses/$file')
          .readAsBytesSync();
      final bundled = await rootBundle.load('assets/licenses/$file');
      expect(
        bundled.buffer.asUint8List(
          bundled.offsetInBytes,
          bundled.lengthInBytes,
        ),
        original,
      );
    });
  }
}
