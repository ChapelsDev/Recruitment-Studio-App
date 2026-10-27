import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

// SOURCE-BINDING controls only. None executes Win32, injects libc allocation
// failure, or claims a native runtime leak reproducer. Freeze before repair.
String method(String source, String start, String end) => source.substring(
  source.indexOf(start),
  source.indexOf(end, source.indexOf(start)),
);
void main() {
  final win = File('lib/features/documents/win32_document_io.dart')
      .readAsStringSync();
  final linux = File('lib/features/documents/owned_document_stage.dart')
      .readAsStringSync();
  for (var index = 1; index <= 5; index++) {
    test(
      'SOURCE Win32 allocation $index has ownership before allocation and population',
      () {
        final body = method(win, '  int openRelative(', '  String identity(');
        final guarded = body.indexOf('arguments.run');
        final allocation = body.indexOf(
          index == 1
              ? 'arguments.wide(name)'
              : 'arguments.allocate(${[0, 0, 16, 48, 16, 8][index]})',
        );
        expect(
          guarded,
          greaterThanOrEqualTo(0),
          reason: 'protected scope before first native allocation',
        );
        expect(allocation, greaterThan(guarded));
        expect(body, contains('opened = out.cast<ffi.IntPtr>().value'));
        expect(body, contains('_WinOpenFailure'));
      },
    );
  }
  for (var index = 1; index <= 2; index++) {
    test(
      'SOURCE Linux link allocation $index is registered before population',
      () {
        final body = method(
          linux,
          '  void link(',
          '\n}\n\nfinal class _WindowsDocumentStage',
        );
        final guarded = body.indexOf('arguments.run');
        final allocation = body.indexOf(
          index == 1
              ? "arguments.text('/proc/self/fd/\$fd')"
              : 'arguments.text(name)',
        );
        expect(guarded, greaterThanOrEqualTo(0));
        expect(allocation, greaterThan(guarded));
        expect(body, contains('linkAt(-100, from, directory, to, 0x400)'));
      },
    );
  }
  test(
    'SOURCE wide and text population share bounded partial-allocation owner',
    () {
      final wide = method(
        win,
        '  ffi.Pointer<ffi.Uint16> _wide(',
        '  Never _error()',
      );
      final text = method(
        linux,
        '  ffi.Pointer<ffi.Uint8> text(',
        '  int openAt(',
      );
      expect(wide, contains('arguments.run'));
      expect(wide, contains('arguments.transfer(arguments.wide(path))'));
      expect(text, contains('arguments.run'));
      expect(text, contains('arguments.transfer(arguments.text(s))'));
    },
  );
  test('SOURCE Windows caller-visible staging descriptor stays path and ancestry bounded', () {
    final body = method(
      linux,
      '  static Future<_WindowsDocumentStage> create(',
      '  @override\n  Future<void> write',
    );
    expect(body, contains('path.length + 64 > WorkLimits.stagingPathUnits'));
    expect(
      body.indexOf('throw const CapacityExceeded()'),
      lessThan(body.indexOf('_token()')),
    );
    expect(body, contains('length > 63'));
  });
}
