import 'dart:async';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/features/documents/document_gateway.dart';
import 'package:recruitment_studio/shared/operation.dart';

import 'android_document_gateway_test.dart' show MemoryDocuments;

final class PickerLatch implements DocumentChannel {
  final started = Completer<void>();
  final reply = Completer<Map<String, Object?>>();
  bool released = false;
  @override
  Future<Map<String, Object?>> invoke(
    String method,
    Map<String, Object?> args,
  ) async {
    if (method == 'prepareSave') {
      started.complete();
      return reply.future;
    }
    if (method == 'releaseOperation') {
      released = true;
      if (!reply.isCompleted) reply.complete({'status': 'cancelled'});
      return {'status': 'released'};
    }
    throw StateError('Unexpected $method');
  }
}

final class StopChannel implements DocumentChannel {
  StopChannel(
    this.op, {
    this.finishBeforeCommit = false,
    this.cancelAfterCommit = false,
  });
  final Operation op;
  final bool finishBeforeCommit, cancelAfterCommit;
  final fake = MemoryDocuments();
  Future<void>? finish;
  @override
  Future<Map<String, Object?>> invoke(
    String method,
    Map<String, Object?> args,
  ) async {
    final response = await fake.invoke(method, args);
    if (method == 'writeChunk' && finishBeforeCommit) finish = op.finish();
    if (method == 'writePrepared' && cancelAfterCommit) op.cancel();
    return response;
  }
}

void main() {
  test('operation cancel settles active Android picker instead of waiting for user', () async {
    final op = Operation.create();
    final channel = PickerLatch();
    final gateway = AndroidDocumentGateway(channel);
    final result = gateway.prepareSave(['a.png'], 'image/png', operation: op);
    await channel.started.future;
    op.cancel();
    try {
      expect(await result.timeout(const Duration(seconds: 1)), isNull);
      expect(channel.released, isTrue);
    } finally {
      if (!channel.reply.isCompleted) {
        channel.reply.complete({'status': 'cancelled'});
      }
      await result;
      await gateway.close();
      await op.finish();
    }
  });
  test(
    'operation finish before commit refuses promotion while draining upload',
    () async {
      final root = await Directory.systemTemp.createTemp('t08-stop-');
      final op = Operation.create();
      final channel = StopChannel(op, finishBeforeCommit: true);
      final gateway = AndroidDocumentGateway(channel, stagingDirectory: root);
      try {
        final file = await File('${root.path}/source').writeAsBytes([1, 2]);
        final d = (await gateway.prepareSave(
          ['a.png'],
          'image/png',
          operation: op,
        ))!;
        final r = await gateway.writePrepared(file, d, 'a.png', operation: op);
        expect(r.status, WriteStatus.cancelled);
        expect(channel.fake.methods, isNot(contains('writePrepared')));
      } finally {
        await gateway.close();
        await op.finish();
        await root.delete(recursive: true);
      }
    },
  );
  test('cancel after commit reconciles actual closed readback instead of hiding output', () async {
    final root = await Directory.systemTemp.createTemp('t08-commit-');
    final op = Operation.create();
    final channel = StopChannel(op, cancelAfterCommit: true);
    final gateway = AndroidDocumentGateway(channel, stagingDirectory: root);
    try {
      final file = await File('${root.path}/source').writeAsBytes([1, 2]);
      final d = (await gateway.prepareSave(
        ['a.png'],
        'image/png',
        operation: op,
      ))!;
      final r = await gateway.writePrepared(file, d, 'a.png', operation: op);
      expect(r.status, WriteStatus.completed);
      expect(r.confirmedBytes, 2);
    } finally {
      await gateway.close();
      await op.finish();
      await root.delete(recursive: true);
    }
  });
}
