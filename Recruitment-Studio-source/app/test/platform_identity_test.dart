import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test(
    'Android launcher label is neutral without changing development identifier',
    () {
      final manifest = File('android/app/src/main/AndroidManifest.xml')
          .readAsStringSync();
      expect(manifest, contains('android:label="Recrutamento"'));
      final gradle = File('android/app/build.gradle.kts').readAsStringSync();
      expect(
        gradle,
        contains('applicationId = "local.recruitment.recruitment_studio"'),
      );
    },
  );
  test('Windows window and descriptive metadata use neutral title, no invented company', () {
    final main = File('windows/runner/main.cpp').readAsStringSync();
    expect(main, contains('window.Create(L"Recrutamento", origin, size)'));
    final metadata = File('windows/runner/Runner.rc').readAsStringSync();
    expect(metadata, contains('VALUE "FileDescription", "Recrutamento"'));
    expect(metadata, contains('VALUE "ProductName", "Recrutamento"'));
    expect(metadata, contains('VALUE "CompanyName", ""'));
    expect(metadata, contains('VALUE "LegalCopyright", ""'));
    expect(metadata, contains('"recruitment_studio.exe"'));
  });
}
