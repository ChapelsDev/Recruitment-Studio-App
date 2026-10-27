import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/features/documents/document_gateway.dart';
import 'package:recruitment_studio/shared/operation.dart';

import 'windows_document_gateway_test.dart' show HostIo, HostPicker;

final class CleanupFailure implements WindowsDocumentIo {
  final host = HostIo()..closeFails = true;
  int cleanupCalls = 0;
  @override
  Future<bool> exists(String path) => host.exists(path);
  @override
  Future<String> createTemporary(String path) => host.createTemporary(path);
  @override
  Future<void> append(String id, Uint8List bytes) => host.append(id, bytes);
  @override
  Future<void> closeOutput(String id) => host.closeOutput(id);
  @override
  Future<String> temporaryPath(String id) => host.temporaryPath(id);
  @override
  Future<void> publishNew(String id, String path) => host.publishNew(id, path);
  @override
  Future<WindowsDocumentRead> openRead(String path) => host.openRead(path);
  @override
  Future<void> forget(String id) => host.forget(id);
  @override
  Future<void> discardTemporary(String id) async {
    cleanupCalls++;
    if (cleanupCalls == 1) {
      throw const FileSystemException('controlled cleanup failure');
    }
    await host.discardTemporary(id);
  }
}

void main() {
  test('temporary deletion failure returns honest failed receipt and keeps cleanup identity', () async {
    final root = await Directory.systemTemp.createTemp('t08-cleanup-');
    final op = Operation.create();
    final io = CleanupFailure();
    final path = '${root.path}/a.png';
    final gateway = WindowsDocumentGateway(
      picker: HostPicker(path),
      io: io,
      stagingDirectory: root,
    );
    try {
      final source = await File('${root.path}/source').writeAsBytes([1, 2]);
      final d = (await gateway.prepareSave(
        ['a.png'],
        'image/png',
        operation: op,
      ))!;
      final r = await gateway.writePrepared(source, d, 'a.png', operation: op);
      expect(r.status, WriteStatus.failed);
      expect(r.residualPlaceholder, isTrue);
      expect(r.confirmedBytes, isNull);
      expect(await File(path).exists(), isFalse);
    } finally {
      try {
        await gateway.close();
      } on DocumentGatewayException {
        /* reported failure is retained */
      }
      expect(io.cleanupCalls, 2);
      expect(io.host.temporary, isEmpty);
      await op.finish();
      await root.delete(recursive: true);
    }
  });
}
