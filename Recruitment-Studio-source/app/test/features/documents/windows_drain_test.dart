import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/features/documents/document_gateway.dart';
import 'package:recruitment_studio/shared/operation.dart';

import 'windows_document_gateway_test.dart' show HostIo, HostPicker;

final class WindowsDrainProbe implements WindowsDocumentIo {
  WindowsDrainProbe(this.op);
  final Operation op;
  final host = HostIo();
  final cleanupStarted = Completer<void>(), cleanupClosed = Completer<void>();
  Future<void>? finishing;
  @override
  Future<bool> exists(String path) => host.exists(path);
  @override
  Future<String> createTemporary(String path) => host.createTemporary(path);
  @override
  Future<void> append(String id, Uint8List bytes) async {
    await host.append(id, bytes);
    finishing = op.finish();
  }

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
    if (!cleanupStarted.isCompleted) cleanupStarted.complete();
    await cleanupClosed.future;
    await host.discardTemporary(id);
  }
}

void main() {
  test(
    'operation finish joins Windows owned temporary close and deletion',
    () async {
      final root = await Directory.systemTemp.createTemp('t08-win-drain-');
      final op = Operation.create();
      final io = WindowsDrainProbe(op);
      final gateway = WindowsDocumentGateway(
        picker: HostPicker('${root.path}/a.png'),
        io: io,
        stagingDirectory: root,
      );
      Future<WriteReceipt>? writing;
      try {
        final source = await File('${root.path}/source').writeAsBytes([1, 2]);
        final d = (await gateway.prepareSave(
          ['a.png'],
          'image/png',
          operation: op,
        ))!;
        writing = gateway.writePrepared(source, d, 'a.png', operation: op);
        await io.cleanupStarted.future;
        expect(
          await Future.any<bool>([
            io.finishing!.then((_) => true),
            Future<bool>.delayed(const Duration(milliseconds: 50), () => false),
          ]),
          isFalse,
        );
      } finally {
        if (!io.cleanupClosed.isCompleted) io.cleanupClosed.complete();
        await writing;
        await gateway.close();
        await op.finish();
        await root.delete(recursive: true);
      }
    },
  );
}
