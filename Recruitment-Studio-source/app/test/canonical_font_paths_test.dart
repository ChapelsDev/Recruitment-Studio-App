import 'dart:convert';
import 'dart:io';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

String _assetPath(String path) => path.replaceAll(r'\', '/');

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  // Independent literal contract: do not derive this from generator/fixtures.
  const paths = <String>{
    'assets/fonts/DM-Sans-400.ttf',
    'assets/fonts/DM-Sans-500.ttf',
    'assets/fonts/DM-Sans-600.ttf',
    'assets/fonts/DM-Sans-700.ttf',
    'assets/fonts/DM-Serif-Display-400.ttf',
  };
  const windowsMixed = <String>{
    r'assets/fonts\DM-Sans-400.ttf',
    r'assets/fonts\DM-Sans-500.ttf',
    r'assets/fonts\DM-Sans-600.ttf',
    r'assets/fonts\DM-Sans-700.ttf',
    r'assets/fonts\DM-Serif-Display-400.ttf',
  };

  test('POSIX listing preserves the exact canonical set', () {
    expect(paths.map(_assetPath).toSet(), paths);
  });
  test('modeled Windows mixed-separator listing matches canonical set', () {
    expect(windowsMixed.map(_assetPath).toSet(), paths);
  });
  test('modeled Windows all-backslash listing matches canonical set', () {
    final windows = windowsMixed.map((path) => path.replaceAll('/', r'\'));
    expect(windows.map(_assetPath).toSet(), paths);
  });
  test('wrong or extra paths cannot satisfy the exact canonical set', () {
    for (final wrong in <String>[
      r'other\fonts\DM-Sans-400.ttf',
      r'assets\fonts\dm-sans-400.ttf',
      r'assets\fonts\DM-Sans-900.ttf',
    ]) {
      final replaced = <String>{
        ...paths.where((path) => path != 'assets/fonts/DM-Sans-400.ttf'),
        wrong,
      };
      expect(replaced.map(_assetPath).toSet(), isNot(equals(paths)));
    }
    final extra = <String>{...paths, r'assets\fonts\DM-Sans-900.ttf'};
    expect(extra.map(_assetPath).toSet(), isNot(equals(paths)));
  });

  test(
    'exact canonical five font paths exist on disk and in the bundle',
    () async {
      final disk = Directory('assets/fonts')
          .listSync()
          .where((entry) => entry.path.toLowerCase().endsWith('.ttf'))
          .map((entry) => _assetPath(entry.path))
          .toSet();
      expect(
        disk,
        paths,
        reason: 'only the five canonical TTF paths are allowed',
      );
      for (final path in paths) {
        final file = File(path);
        expect(file.statSync().type, FileSystemEntityType.file);
        expect(
          Link(path).existsSync(),
          isFalse,
          reason: 'no compatibility aliases',
        );
        final data = await rootBundle.load(path);
        expect(
          data.buffer.asUint8List(data.offsetInBytes, data.lengthInBytes),
          file.readAsBytesSync(),
          reason: 'canonical disk and bundle bytes must agree',
        );
      }
      final manifest =
          jsonDecode(await rootBundle.loadString('FontManifest.json')) as List;
      final bundled = <String>{
        for (final dynamic family in manifest)
          for (final dynamic face in family['fonts'])
            if ((face['asset'] as String).toLowerCase().endsWith('.ttf') &&
                (face['asset'] as String).startsWith('assets/fonts/'))
              face['asset'] as String,
      };
      expect(
        bundled,
        paths,
        reason: 'bundle must register exactly canonical paths',
      );
    },
  );
}
