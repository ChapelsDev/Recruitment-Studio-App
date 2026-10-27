import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/features/documents/document_gateway.dart';
import 'package:recruitment_studio/shared/admission_budget.dart';
import 'package:recruitment_studio/shared/operation.dart';
import 'package:recruitment_studio/shared/problem.dart';
import 'package:recruitment_studio/shared/work_budget.dart';

import 'android_document_gateway_test.dart' show MemoryDocuments;

final class TrackingChannel implements DocumentChannel {
  final fake = MemoryDocuments();
  final live = <String>{};
  bool renameOnCommit = false;
  String? finalName;
  @override
  Future<Map<String, Object?>> invoke(
    String method,
    Map<String, Object?> args,
  ) async {
    if (method == 'beginRead' && !live.contains(args['opaqueId'])) {
      return {'status': 'failed', 'problem': 'invalidSelection'};
    }
    final r = await fake.invoke(method, args);
    if (method == 'prepareSave' || method == 'pickOpen') {
      final id = 'issued-${live.length + 1}';
      live.add(id);
      return {...r, 'opaqueId': id};
    }
    if (method == 'abortPrepared') return {...r, 'residualPlaceholder': false};
    if (method == 'abortWrite' && args['releaseTarget'] == true) {
      live.remove(args['opaqueId']);
    }
    if (method == 'releaseOperation') live.clear();
    if (method == 'writePrepared') {
      if (renameOnCommit) finalName = 'renamed.png';
      return {
        ...r,
        'opaqueId': args['opaqueId'],
        'displayName': finalName ?? r['displayName'],
      };
    }
    return r;
  }
}

void main() {
  test(
    'work buffer refusal returns ordinary per-call admission credit',
    () async {
      final op = Operation.create();
      final zero = WorkBudgetController(capacityBytes: 0);
      final gateway = AndroidDocumentGateway(MemoryDocuments(), budget: zero);
      final before = AdmissionBudget.shared.reservedBytes;
      await expectLater(
        gateway.prepareSave(['a.png'], 'image/png', operation: op),
        throwsA(isA<CapacityExceeded>()),
      );
      expect(AdmissionBudget.shared.reservedBytes, before);
      await gateway.close();
      await op.finish();
    },
  );
  test('successful document releases bounded native capability after reconciliation', () async {
    final root = await Directory.systemTemp.createTemp('t08-life-');
    final op = Operation.create();
    final channel = TrackingChannel();
    final gateway = AndroidDocumentGateway(channel, stagingDirectory: root);
    try {
      final source = await File('${root.path}/source').writeAsBytes([1, 2]);
      final d = (await gateway.prepareSave(
        ['a.png'],
        'image/png',
        operation: op,
      ))!;
      expect(
        (await gateway.writePrepared(source, d, 'a.png', operation: op)).status,
        WriteStatus.completed,
      );
      expect(channel.live, isEmpty);
    } finally {
      await gateway.close();
      await op.finish();
      await root.delete(recursive: true);
    }
  });
  test('provider final effective name is displayed rather than pretending initial name persisted', () async {
    final root = await Directory.systemTemp.createTemp('t08-name-');
    final op = Operation.create();
    final channel = TrackingChannel()..renameOnCommit = true;
    final gateway = AndroidDocumentGateway(channel, stagingDirectory: root);
    try {
      final source = await File('${root.path}/source').writeAsBytes([1, 2]);
      final d = (await gateway.prepareSave(
        ['a.png'],
        'image/png',
        operation: op,
      ))!;
      final r = await gateway.writePrepared(source, d, 'a.png', operation: op);
      expect(r.status, WriteStatus.completed);
      expect(r.target!.displayName, 'renamed.png');
    } finally {
      await gateway.close();
      await op.finish();
      await root.delete(recursive: true);
    }
  });
  test('closing one gateway does not revoke another gateway targets in same operation', () async {
    final root = await Directory.systemTemp.createTemp('t08-scopes-');
    final op = Operation.create();
    final channel = TrackingChannel();
    final first = AndroidDocumentGateway(channel, stagingDirectory: root);
    final second = AndroidDocumentGateway(channel, stagingDirectory: root);
    try {
      await first.pickOpen({'image/png'}, operation: op);
      final ref = (await second.pickOpen({'image/png'}, operation: op))!;
      await first.close();
      final staged = await second.stageRead(ref, 0, operation: op);
      expect(await staged.length(), 0);
    } finally {
      await first.close();
      await second.close();
      await op.finish();
      await root.delete(recursive: true);
    }
  });
}
