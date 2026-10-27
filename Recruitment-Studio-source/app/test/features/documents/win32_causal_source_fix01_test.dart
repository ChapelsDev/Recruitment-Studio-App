import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

// Source-only regression binding: Win32 remains UNEXECUTED. This guards the
// exact causal frontier, and is not a claim that an FFI call ran on Windows.
void main() {
  test('Win32 creation and rename bind retained ancestor handles rather than snapshots', () {
    final source = File('lib/features/documents/win32_document_io.dart')
        .readAsStringSync();
    expect(source, contains("'NtCreateFile'"));
    expect(source, contains('pinParents'));
    expect(source, contains('openRelative'));
    expect(source, contains('pins.last'));
    expect(source, isNot(contains('void _parents(')));
    expect(source, contains('RootDirectory'));
  });
}
