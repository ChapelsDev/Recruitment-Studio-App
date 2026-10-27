import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/features/documents/document_gateway.dart';
import 'package:recruitment_studio/shared/operation.dart';

/// Only the selection is injected: all native file/staging IO remains production.
final class _KnownQaPicker implements WindowsDocumentPicker {
  _KnownQaPicker(this.path);
  final String path;
  @override
  Future<String?> open(Set<String> acceptedMimeTypes) async => path;
  @override
  Future<String?> save(String suggestedName, String mimeType) =>
      throw UnsupportedError('Read-only reproducer');
}

void main() {
  test(
    'native Win32 gateway stages the exact GUI QA JPEG with explicit root',
    () async {
      final sourcePath = Platform.environment['RECRUITMENT_QA_SOURCE'];
      if (sourcePath == null) throw StateError('QA source binding missing');
      final expected = await File(sourcePath).readAsBytes();
      expect(expected.length, 24791);
      expect(
        sha256.convert(expected).toString(),
        '856c8ed5b09a2f5c43b43e1a0aef0f3c7fd7ccabcde5d229825ffda30bab7abc',
      );
      // New owned staging only; never the application's existing private data.
      final staging = await Directory.systemTemp.createTemp('recruit-io01-');
      final gateway = WindowsDocumentGateway(
        picker: _KnownQaPicker(sourcePath),
        stagingDirectory: staging,
      );
      final operation = WorkOperation.create();
      Object? first;
      StackTrace? firstStack;
      try {
        // Closed-code progress only; do not emit paths or document contents.
        final ref = await gateway.pickOpen({
          'image/jpeg',
        }, operation: operation);
        expect(ref, isNotNull);
        final staged = await gateway.stageRead(
          ref!,
          1024 * 1024,
          operation: operation,
        );
        expect(await staged.readAsBytes(), expected);
      } catch (error, stack) {
        first = error;
        firstStack = stack;
      } finally {
        try {
          await gateway.close();
        } catch (error, stack) {
          first ??= error;
          firstStack ??= stack;
        }
        try {
          await operation.finish();
        } catch (error, stack) {
          first ??= error;
          firstStack ??= stack;
        }
        // Retain the new diagnostic staging directory for evidence; no deletion.
      }
      if (first != null) Error.throwWithStackTrace(first, firstStack!);
    },
    skip: !Platform.isWindows,
    timeout: const Timeout(Duration(seconds: 60)),
  );

  test(
    'native Win32 gateway publishes and verifies a new file without overwrite',
    () async {
      final sourcePath = Platform.environment['RECRUITMENT_QA_SOURCE'];
      if (sourcePath == null) throw StateError('QA source binding missing');
      final source = File(sourcePath);
      final expected = await source.readAsBytes();
      expect(expected.length, 24791);
      expect(
        sha256.convert(expected).toString(),
        '856c8ed5b09a2f5c43b43e1a0aef0f3c7fd7ccabcde5d229825ffda30bab7abc',
      );
      final staging = await Directory.systemTemp.createTemp('recruit-save01-');
      final destination = File(
        '${staging.path}${Platform.pathSeparator}roundtrip.jpg',
      );
      final gateway = WindowsDocumentGateway(
        picker: _KnownQaSavePicker(destination.path),
        stagingDirectory: staging,
      );
      final operation = WorkOperation.create();
      Object? first;
      StackTrace? firstStack;
      try {
        expect(await destination.exists(), isFalse);
        final prepared = await gateway.prepareSave(
          ['roundtrip.jpg'],
          'image/jpeg',
          operation: operation,
        );
        expect(prepared, isNotNull);
        final receipt = await gateway.writePrepared(
          source,
          prepared!,
          'roundtrip.jpg',
          operation: operation,
        );
        expect(receipt.status, WriteStatus.completed);
        expect(receipt.residualPlaceholder, isFalse);
        expect(receipt.confirmedBytes, expected.length);
        expect(receipt.confirmedSha256, sha256.convert(expected).toString());
        expect(await destination.readAsBytes(), expected);
      } catch (error, stack) {
        first = error;
        firstStack = stack;
      } finally {
        try {
          await gateway.close();
        } catch (error, stack) {
          first ??= error;
          firstStack ??= stack;
        }
        try {
          await operation.finish();
        } catch (error, stack) {
          first ??= error;
          firstStack ??= stack;
        }
      }
      if (first != null) Error.throwWithStackTrace(first, firstStack!);
    },
    skip: !Platform.isWindows,
    timeout: const Timeout(Duration(seconds: 60)),
  );
  test(
    'native Win32 gateway preserves a destination created after preparation',
    () async {
      final sourcePath = Platform.environment['RECRUITMENT_QA_SOURCE'];
      if (sourcePath == null) throw StateError('QA source binding missing');
      final staging = await Directory.systemTemp.createTemp(
        'recruit-collision01-',
      );
      final destination = File(
        '${staging.path}${Platform.pathSeparator}collision.jpg',
      );
      final gateway = WindowsDocumentGateway(
        picker: _KnownQaSavePicker(destination.path),
        stagingDirectory: staging,
      );
      final operation = WorkOperation.create();
      try {
        final prepared = await gateway.prepareSave(
          ['collision.jpg'],
          'image/jpeg',
          operation: operation,
        );
        expect(prepared, isNotNull);
        // Exercise the real native existence guard after preparation; this is
        // not a claim of injecting a race inside the kernel rename syscall.
        const sentinel = [81, 65, 32, 80, 82, 69, 83, 69, 82, 86, 69];
        await destination.writeAsBytes(sentinel, flush: true);
        final receipt = await gateway.writePrepared(
          File(sourcePath),
          prepared!,
          'collision.jpg',
          operation: operation,
        );
        expect(receipt.status, WriteStatus.failed);
        expect(receipt.problem?.code.name, 'invalidSelection');
        expect(await destination.readAsBytes(), sentinel);
      } finally {
        try {
          await gateway.close();
        } finally {
          await operation.finish();
        }
      }
    },
    skip: !Platform.isWindows,
    timeout: const Timeout(Duration(seconds: 60)),
  );
}

final class _KnownQaSavePicker implements WindowsDocumentPicker {
  _KnownQaSavePicker(this.path);
  final String path;
  @override
  Future<String?> open(Set<String> acceptedMimeTypes) =>
      throw UnsupportedError('Save-only native regression');
  @override
  Future<String?> save(String suggestedName, String mimeType) async => path;
}
