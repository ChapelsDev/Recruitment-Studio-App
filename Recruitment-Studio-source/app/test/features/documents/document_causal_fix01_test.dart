import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/features/documents/document_gateway.dart';
import 'package:recruitment_studio/shared/admission_budget.dart';
import 'package:recruitment_studio/shared/operation.dart';

// A stateful protocol frontier, NOT a SAF/native result. In particular release
// enforces the actual Kotlin committed || aborted predicate.
class SafState implements DocumentChannel {
  final methods = <String>[];
  bool live = false, committed = false, aborted = false, deleted = false;
  bool readableReservation = true,
      failAfterCommit = false,
      placeholder = false,
      invalidPickedName = false;
  Uint8List bytes = Uint8List(0);
  String? failPrecommit;
  bool failAbortOnce = false, failReleaseOnce = false, failAbortAlways = false;
  Operation? finishDuringUpload, finishDuringRead;
  Future<void>? finishing;
  String? holdMethod;
  final held = Completer<void>();
  final resume = Completer<void>();
  int providerOpens = 0;
  @override
  Future<Map<String, Object?>> invoke(
    String method,
    Map<String, Object?> args,
  ) async {
    methods.add(method);
    if (method == holdMethod && !held.isCompleted) {
      held.complete();
      await resume.future;
    }
    switch (method) {
      case 'prepareSave':
      case 'pickOpen':
        live = true;
        placeholder = method == 'prepareSave';
        return {
          'status': method == 'prepareSave' ? 'prepared' : 'picked',
          'opaqueId': 'target',
          'operationId': args['operationId'],
          'displayName': invalidPickedName ? '/' : 'a.png',
          'canReadBack': readableReservation,
          'ownsReservedPlaceholder': true,
        };
      case 'beginWrite':
        if (!live || aborted || committed) {
          return {'status': 'failed', 'problem': 'invalidSelection'};
        }
        bytes = Uint8List(0);
        return {'status': 'ready', 'transferId': 'upload'};
      case 'writeChunk':
        if (aborted || !live) {
          return {'status': 'failed', 'problem': 'invalidSelection'};
        }
        bytes = Uint8List.fromList([...bytes, ...args['bytes'] as Uint8List]);
        finishing = finishDuringUpload?.finish();
        return {'status': 'ready'};
      case 'writePrepared':
        if (failPrecommit != null) {
          return {
            'status': 'failed',
            'problem': 'ioFailure',
            'committed': false,
            'residualPlaceholder': true,
          };
        }
        committed = true;
        providerOpens++;
        if (failAfterCommit) {
          return {
            'status': 'failed',
            'problem': 'operationCancelled',
            'residualPlaceholder': true,
            'commitState': 'committed',
          };
        }
        return {
          'status': 'completed',
          'operationId': args['operationId'],
          'opaqueId': 'target',
          'displayName': 'a.png',
          'confirmedBytes': bytes.length,
          'confirmedSha256': sha256.convert(bytes).toString(),
          'committed': true,
        };
      case 'beginRead':
        return {'status': 'ready', 'transferId': 'read'};
      case 'readChunk':
        finishing ??= finishDuringRead?.finish();
        final offset = args['offset'] as int;
        return {
          'status': 'ready',
          'bytes': Uint8List.sublistView(
            bytes,
            offset,
            (offset + (args['length'] as int)).clamp(0, bytes.length),
          ),
        };
      case 'endRead':
        return {'status': 'released'};
      case 'abortPrepared':
        if (failAbortOnce || failAbortAlways) {
          failAbortOnce = false;
          return {'status': 'failed', 'problem': 'ioFailure'};
        }
        aborted = true;
        if (!committed && placeholder) deleted = true;
        return {
          'status': 'aborted',
          'residualPlaceholder': committed,
          'commitState': committed ? 'committed' : 'reserved',
        };
      case 'abortWrite':
        if (failReleaseOnce) {
          failReleaseOnce = false;
          return {'status': 'failed', 'problem': 'ioFailure'};
        }
        if (args['releaseTarget'] == true) {
          if (live && !committed && !aborted) {
            return {'status': 'failed', 'problem': 'invalidSelection'};
          }
          live = false;
        }
        return {'status': 'released'};
      case 'releaseOperation':
        aborted = true;
        if (!committed) deleted = true;
        live = false;
        return {'status': 'released'};
    }
    throw StateError('Unexpected $method');
  }
}

void main() {
  test(
    'refused picked capability retains admission through native release tail',
    () async {
      final native = SafState()
        ..invalidPickedName = true
        ..holdMethod = 'releaseOperation';
      final g = AndroidDocumentGateway(native);
      final first = Operation.create(), second = Operation.create();
      final pick = g.pickOpen({'image/png'}, operation: first);
      final observed = expectLater(
        pick,
        throwsA(isA<DocumentGatewayException>()),
      );
      try {
        expect(
          await Future.any<bool>([
            native.held.future.then((_) => true),
            observed.then((_) => false),
          ]),
          isTrue,
          reason: 'release tail must be owned before refusal returns',
        );
        await expectLater(
          g.pickOpen({'image/png'}, operation: second),
          throwsA(isA<DocumentGatewayException>()),
        );
        expect(native.methods.where((m) => m == 'pickOpen'), hasLength(1));
        native.resume.complete();
        await observed;
        expect(native.live, isFalse);
      } finally {
        if (!native.resume.isCompleted) native.resume.complete();
        await observed;
        await g.close();
        await first.finish();
        await second.finish();
      }
    },
  );
  test('failed native cleanup settles an already-finishing operation without deadlock', () async {
    final root = await Directory.systemTemp.createTemp('t08-failed-drain-');
    final op = Operation.create();
    final native = SafState()
      ..finishDuringUpload = op
      ..failAbortAlways = true;
    final g = AndroidDocumentGateway(native, stagingDirectory: root);
    Object? finishError;
    try {
      final source = await File('${root.path}/source').writeAsBytes([1]);
      final d = (await g.prepareSave(['a.png'], 'image/png', operation: op))!;
      final r = await g.writePrepared(source, d, 'a.png', operation: op);
      expect(r.status, WriteStatus.failed);
      expect(r.residualPlaceholder, isTrue);
      final observed = native.finishing!.then<bool>(
        (_) => true,
        onError: (Object e) {
          finishError = e;
          return true;
        },
      );
      expect(
        await Future.any<bool>([
          observed,
          Future<bool>.delayed(const Duration(milliseconds: 100), () => false),
        ]),
        isTrue,
      );
      expect(finishError, isA<OperationException>());
    } finally {
      native.failAbortAlways = false;
      try {
        await g.close();
      } catch (_) {
        /* previously failed drain stays failed */
      }
      try {
        await op.finish();
      } catch (_) {
        /* explicit failure observed above */
      }
      await root.delete(recursive: true);
    }
  });
  test(
    'native postcommit cancellation is failed and never deletes actual output',
    () async {
      final root = await Directory.systemTemp.createTemp('t08-effect-');
      final op = Operation.create(),
          native = SafState()..failAfterCommit = true;
      final g = AndroidDocumentGateway(native, stagingDirectory: root);
      try {
        final file = await File('${root.path}/source').writeAsBytes([1, 2]);
        final d = (await g.prepareSave(['a.png'], 'image/png', operation: op))!;
        final r = await g.writePrepared(file, d, 'a.png', operation: op);
        expect(r.status, WriteStatus.failed);
        expect(r.residualPlaceholder, isTrue);
        expect(r.target, isNotNull);
        expect(native.providerOpens, 1);
        expect(native.deleted, isFalse);
        expect(native.bytes, [1, 2]);
      } finally {
        await g.close();
        await op.finish();
        await root.delete(recursive: true);
      }
    },
  );
  test('picker refusal terminal release still owns the gateway call', () async {
    final op = Operation.create();
    final native = SafState()
      ..readableReservation = false
      ..holdMethod = 'releaseOperation';
    final g = AndroidDocumentGateway(native);
    final first = g
        .prepareSave(['a.png'], 'image/png', operation: op)
        .then<Object?>((_) => null, onError: (Object e) => e);
    await native.held.future;
    try {
      await expectLater(
        g.prepareSave(['a.png'], 'image/png', operation: op),
        throwsA(isA<DocumentGatewayException>()),
      );
      expect(native.methods.where((m) => m == 'prepareSave').length, 1);
    } finally {
      native.resume.complete();
      await first;
      await g.close();
      await op.finish();
    }
  });
  test(
    'close needs no fresh pending admission at zero ordinary headroom',
    () async {
      final op = Operation.create(), native = SafState();
      final g = AndroidDocumentGateway(native);
      await g.prepareSave(['a.png'], 'image/png', operation: op);
      await Future<void>.delayed(
        Duration.zero,
      ); // retire the preceding call marker
      final budget = AdmissionBudget.shared;
      final exhausted = budget.reserve(
        budget.capacityBytes - budget.reservedBytes,
      );
      try {
        final error = await g.close().then<Object?>(
          (_) => null,
          onError: (Object e) => e,
        );
        expect(
          error,
          isNull,
          reason: 'indispensable cleanup was prepaid at capability issue',
        );
        expect(native.live, isFalse);
      } finally {
        exhausted.release();
        await op.finish();
      }
    },
  );
  test(
    'stop cleanup owns serialization until its asynchronous release settles',
    () async {
      final op = Operation.create(), other = Operation.create();
      final native = SafState()..holdMethod = 'abortPrepared';
      final g = AndroidDocumentGateway(native);
      await g.prepareSave(['a.png'], 'image/png', operation: op);
      op.cancel();
      await native.held.future;
      try {
        await expectLater(
          g.prepareSave(['a.png'], 'image/png', operation: other),
          throwsA(isA<DocumentGatewayException>()),
        );
        expect(native.methods.where((m) => m == 'prepareSave').length, 1);
      } finally {
        native.resume.complete();
        await g.close();
        await op.finish();
        await other.finish();
      }
    },
  );
  test(
    'busy prepare refusal cannot release the active Android operation',
    () async {
      final root = await Directory.systemTemp.createTemp(
        't08-prepare-refusal-',
      );
      final op = Operation.create(),
          native = SafState()..holdMethod = 'writeChunk';
      final g = AndroidDocumentGateway(native, stagingDirectory: root);
      final source = await File('${root.path}/source').writeAsBytes([1]);
      final d = (await g.prepareSave(['a.png'], 'image/png', operation: op))!;
      final writing = g.writePrepared(source, d, 'a.png', operation: op);
      await native.held.future;
      try {
        await expectLater(
          g.prepareSave(['a.png'], 'image/png', operation: op),
          throwsA(isA<DocumentGatewayException>()),
        );
        expect(native.methods, isNot(contains('releaseOperation')));
        expect(native.live, isTrue);
      } finally {
        native.resume.complete();
        await writing;
        await g.close();
        await op.finish();
        await root.delete(recursive: true);
      }
    },
  );
  test(
    'implicit read late release failure cleans producer stage before rejection',
    () async {
      final root = await Directory.systemTemp.createTemp('t08-implicit-');
      final native = SafState()
        ..bytes = Uint8List.fromList([3, 4])
        ..failReleaseOnce = true;
      final g = AndroidDocumentGateway(native, stagingDirectory: root);
      try {
        final ref = (await g.pickOpen({'image/png'}))!;
        await expectLater(
          g.stageRead(ref, 2),
          throwsA(isA<DocumentGatewayException>()),
        );
        expect(
          await root.list().toList(),
          isEmpty,
          reason: 'unreturned bytes stay producer-owned',
        );
        await g.close();
        expect(native.live, isFalse);
      } finally {
        await g.close();
        await root.delete(recursive: true);
      }
    },
  );
  for (final fails in [false, true]) {
    test('all close callers share held drain and failure=$fails', () async {
      final op = Operation.create();
      final native = SafState()
        ..holdMethod = 'abortPrepared'
        ..failAbortOnce = fails;
      final gateway = AndroidDocumentGateway(native);
      await gateway.prepareSave(['a.png'], 'image/png', operation: op);
      final first = gateway.close();
      final observedFirst = first.then<Object?>(
        (_) => null,
        onError: (Object e) => e,
      );
      await native.held.future;
      final second = gateway.close();
      final observedSecond = second.then<Object?>(
        (_) => null,
        onError: (Object e) => e,
      );
      var settled = false;
      observedSecond.then((_) => settled = true);
      await Future<void>.delayed(Duration.zero);
      try {
        expect(settled, isFalse, reason: 'cleanup has not reached a terminal');
      } finally {
        native.resume.complete();
      }
      final a = await observedFirst, b = await observedSecond;
      expect(identical(first, second), isTrue);
      expect(identical(a, b), isTrue);
      expect(a, fails ? isA<DocumentGatewayException>() : isNull);
      if (fails) {
        await expectLater(op.finish(), throwsA(isA<OperationException>()));
      } else {
        await op.finish();
      }
    });
  }
  for (final fault in ['flush', 'digest']) {
    test(
      'native precommit $fault failure aborts exact retryable placeholder',
      () async {
        final root = await Directory.systemTemp.createTemp('t08-precommit-');
        final op = Operation.create();
        final native = SafState()..failPrecommit = fault;
        final gateway = AndroidDocumentGateway(native, stagingDirectory: root);
        try {
          final source = await File('${root.path}/source').writeAsBytes([1, 2]);
          final d = (await gateway.prepareSave(
            ['a.png'],
            'image/png',
            operation: op,
          ))!;
          expect(
            (await gateway.writePrepared(
              source,
              d,
              'a.png',
              operation: op,
            )).status,
            WriteStatus.failed,
          );
          expect(native.providerOpens, 0);
          expect(native.methods, contains('abortPrepared'));
          expect(native.deleted, isTrue);
          expect(native.live, isFalse);
        } finally {
          try {
            await gateway.close();
          } catch (_) {
            /* historical cleanup failure */
          }
          await op.finish();
          await root.delete(recursive: true);
        }
      },
    );
  }
  test(
    'busy Android duplicate write cannot abort the active transfer',
    () async {
      final root = await Directory.systemTemp.createTemp('t08-duplicate-');
      final op = Operation.create();
      final native = SafState()..holdMethod = 'writeChunk';
      final gateway = AndroidDocumentGateway(native, stagingDirectory: root);
      final source = await File('${root.path}/source').writeAsBytes([1, 2]);
      final d = (await gateway.prepareSave(
        ['a.png'],
        'image/png',
        operation: op,
      ))!;
      final writing = gateway.writePrepared(source, d, 'a.png', operation: op);
      await native.held.future;
      try {
        expect(
          (await gateway.writePrepared(
            source,
            d,
            'a.png',
            operation: op,
          )).status,
          WriteStatus.failed,
        );
        expect(native.methods.where((m) => m.startsWith('abort')), isEmpty);
      } finally {
        native.resume.complete();
        expect((await writing).status, WriteStatus.completed);
        await gateway.close();
        await op.finish();
        await root.delete(recursive: true);
      }
    },
  );
  test('busy Android abort has zero effect on held active writer', () async {
    final root = await Directory.systemTemp.createTemp('t08-causal-');
    final op = Operation.create();
    final native = SafState()..holdMethod = 'writeChunk';
    final gateway = AndroidDocumentGateway(native, stagingDirectory: root);
    final source = await File('${root.path}/source').writeAsBytes([1, 2]);
    final d = (await gateway.prepareSave(
      ['a.png'],
      'image/png',
      operation: op,
    ))!;
    final writing = gateway.writePrepared(source, d, 'a.png', operation: op);
    await native.held.future;
    try {
      await expectLater(
        gateway.abortPrepared(d, operation: op),
        throwsA(isA<DocumentGatewayException>()),
      );
      expect(native.methods.where((m) => m.startsWith('abort')), isEmpty);
      expect(native.live, isTrue);
    } finally {
      native.resume.complete();
      await writing;
      await gateway.close();
      await op.finish();
      await root.delete(recursive: true);
    }
  });
}
