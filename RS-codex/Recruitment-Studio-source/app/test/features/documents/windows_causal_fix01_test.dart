import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/features/documents/document_gateway.dart';
import 'package:recruitment_studio/shared/operation.dart';

import 'windows_document_gateway_test.dart' show HostIo;

class CountPicker implements WindowsDocumentPicker {
  CountPicker(this.path);
  final String path;
  int saves = 0;
  @override
  Future<String?> open(Set<String> mimes) async => path;
  @override
  Future<String?> save(String name, String mime) async {
    saves++;
    return path;
  }
}

class HeldWindows implements WindowsDocumentIo {
  final host = HostIo();
  final held = Completer<void>(), resume = Completer<void>();
  String hold = 'discard';
  int discards = 0;
  @override
  Future<bool> exists(String p) => host.exists(p);
  @override
  Future<String> createTemporary(String p) => host.createTemporary(p);
  @override
  Future<void> append(String id, Uint8List b) async {
    if (hold == 'append' && !held.isCompleted) {
      held.complete();
      await resume.future;
    }
    await host.append(id, b);
  }

  @override
  Future<void> closeOutput(String id) => host.closeOutput(id);
  @override
  Future<String> temporaryPath(String id) => host.temporaryPath(id);
  @override
  Future<void> publishNew(String id, String p) => host.publishNew(id, p);
  @override
  Future<WindowsDocumentRead> openRead(String p) => host.openRead(p);
  @override
  Future<void> discardTemporary(String id) async {
    discards++;
    if (hold == 'discard' && !held.isCompleted) {
      held.complete();
      await resume.future;
    }
    await host.discardTemporary(id);
  }

  @override
  Future<void> forget(String id) => host.forget(id);
}

void main() {
  test('Windows serialization covers held terminal discard', () async {
    final root = await Directory.systemTemp.createTemp('t08-win-tail-');
    final op = Operation.create();
    final io = HeldWindows()..host.closeFails = true;
    final picker = CountPicker('${root.path}/a.png');
    final g = WindowsDocumentGateway(
      picker: picker,
      io: io,
      stagingDirectory: root,
    );
    final source = await File('${root.path}/source').writeAsBytes([1]);
    final d = (await g.prepareSave(['a.png'], 'image/png', operation: op))!;
    final writing = g.writePrepared(source, d, 'a.png', operation: op);
    await io.held.future;
    try {
      await expectLater(
        g.prepareSave(['a.png'], 'image/png', operation: op),
        throwsA(isA<DocumentGatewayException>()),
      );
      expect(picker.saves, 1);
    } finally {
      io.resume.complete();
      await writing;
      await g.close();
      await op.finish();
      await root.delete(recursive: true);
    }
  });
}
