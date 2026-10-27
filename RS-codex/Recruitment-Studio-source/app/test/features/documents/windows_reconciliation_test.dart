import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/features/documents/document_gateway.dart';
import 'package:recruitment_studio/shared/operation.dart';

import 'windows_document_gateway_test.dart' show HostIo, HostPicker;

final class PromotionCloseError implements WindowsDocumentIo {
  final host = HostIo();
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
  Future<void> publishNew(String id, String path) async {
    await host.publishNew(id, path);
    throw const FileSystemException('controlled post-promotion close failure');
  }

  @override
  Future<WindowsDocumentRead> openRead(String path) => host.openRead(path);
  @override
  Future<void> discardTemporary(String id) => host.discardTemporary(id);
  @override
  Future<void> forget(String id) => host.forget(id);
}

void main() {
  test('promotion close error reports possibly created output and never deletes it', () async {
    final root = await Directory.systemTemp.createTemp('t08-postmove-');
    final op = Operation.create();
    final path = '${root.path}/a.png';
    final io = PromotionCloseError();
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
      expect(r.target, isNotNull);
      expect(r.residualPlaceholder, isTrue);
      expect(r.confirmedBytes, isNull);
      expect(await File(path).readAsBytes(), [1, 2]);
    } finally {
      await gateway.close();
      await op.finish();
      await root.delete(recursive: true);
    }
  });
}
