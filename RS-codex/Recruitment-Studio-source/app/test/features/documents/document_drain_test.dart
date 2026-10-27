import 'dart:async';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/features/documents/document_gateway.dart';
import 'package:recruitment_studio/shared/operation.dart';

import 'android_document_gateway_test.dart' show MemoryDocuments;

final class DrainProbe implements DocumentChannel {
  DrainProbe(this.operation);
  final Operation operation;
  final fake = MemoryDocuments();
  final abortStarted = Completer<void>();
  final abortClosed = Completer<void>();
  Future<void>? finishing;
  @override
  Future<Map<String, Object?>> invoke(
    String method,
    Map<String, Object?> args,
  ) async {
    if (method == 'writeChunk') {
      final r = await fake.invoke(method, args);
      finishing = operation.finish();
      return r;
    }
    if (method == 'abortPrepared') {
      if (!abortStarted.isCompleted) abortStarted.complete();
      await abortClosed.future;
    }
    return fake.invoke(method, args);
  }
}

void main() {
  test('operation finish joins native abort close before declaring its drain finished', () async {
    final root = await Directory.systemTemp.createTemp('t08-drain-');
    final op = Operation.create();
    final channel = DrainProbe(op);
    final gateway = AndroidDocumentGateway(channel, stagingDirectory: root);
    Future<WriteReceipt>? writing;
    try {
      final file = await File('${root.path}/source').writeAsBytes([1, 2]);
      final d = (await gateway.prepareSave(
        ['a.png'],
        'image/png',
        operation: op,
      ))!;
      writing = gateway.writePrepared(file, d, 'a.png', operation: op);
      await channel.abortStarted.future;
      final prematurelyFinished = await Future.any<bool>([
        channel.finishing!.then((_) => true),
        Future<bool>.delayed(const Duration(milliseconds: 50), () => false),
      ]);
      expect(
        prematurelyFinished,
        isFalse,
        reason: 'native output/staging close still belongs to this operation',
      );
    } finally {
      if (!channel.abortClosed.isCompleted) channel.abortClosed.complete();
      await writing;
      await gateway.close();
      await op.finish();
      await root.delete(recursive: true);
    }
  });
}
