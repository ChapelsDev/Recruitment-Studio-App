import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/features/documents/document_gateway.dart';
import 'package:recruitment_studio/shared/operation.dart';

import 'windows_document_gateway_test.dart' show HostIo, HostPicker;

final class PrivateErrorIo implements WindowsDocumentIo {
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
  Future<void> publishNew(String id, String path) => host.publishNew(id, path);
  @override
  Future<WindowsDocumentRead> openRead(String path) async =>
      throw const FileSystemException('controlled', 'fictional-private-path');
  @override
  Future<void> forget(String id) => host.forget(id);
  @override
  Future<void> discardTemporary(String id) => host.discardTemporary(id);
}

void main() {
  test('stage read converts internal I/O error to public Problem without private path', () async {
    final root = await Directory.systemTemp.createTemp('t08-privacy-');
    final op = Operation.create();
    final gateway = WindowsDocumentGateway(
      picker: HostPicker('${root.path}/input.png'),
      io: PrivateErrorIo(),
      stagingDirectory: root,
    );
    try {
      final ref = (await gateway.pickOpen({'image/png'}, operation: op))!;
      await expectLater(
        gateway.stageRead(ref, 4, operation: op),
        throwsA(
          isA<DocumentGatewayException>().having(
            (e) => e.toString(),
            'no private path',
            isNot(contains('fictional-private-path')),
          ),
        ),
      );
    } finally {
      await gateway.close();
      await op.finish();
      await root.delete(recursive: true);
    }
  });
}
