import 'dart:async';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/features/documents/document_gateway.dart';
import 'package:recruitment_studio/shared/operation.dart';

import 'document_causal_fix01_test.dart' show SafState;

// Protocol controls only, never Android execution evidence. The epoch validity
// predicate and reserved-barrier binding below are checked against actual Kotlin
// source; these transport fixtures cannot prove provider/executor behavior.
class EpochFrontier extends SafState {
  final acquired = Completer<void>(), deliver = Completer<void>();
  int engine = 1, activity = 1;
  bool engineLive = true, activityLive = true;
  void detach({bool rotation = false, bool engineToo = false}) {
    if (rotation) return;
    activityLive = false;
    activity++;
    if (engineToo) {
      engineLive = false;
      engine++;
    }
  }

  @override
  Future<Map<String, Object?>> invoke(
    String method,
    Map<String, Object?> args,
  ) async {
    if (method != 'prepareSave') return super.invoke(method, args);
    final stamp = (engine, activity);
    final reservation = await super.invoke(method, args);
    acquired.complete();
    await deliver.future;
    final current = engineLive && activityLive && stamp == (engine, activity);
    return current
        ? reservation
        : {'status': 'cancelled', 'residualPlaceholder': true};
  }
}

void main() {
  final source = File(
    'android/app/src/main/kotlin/local/recruitment/recruitment_studio/documents/DocumentBridgePlugin.kt',
  ).readAsStringSync();
  final helper = File(
    'android/app/src/main/kotlin/local/recruitment/recruitment_studio/documents/DocumentOwnership.kt',
  ).readAsStringSync();
  test('source binding: native acquisition uses epoch guard at insertion and UI delivery', () {
    expect(
      helper,
      contains('engineLive && activityLive && stamp == capture()'),
    );
    expect(source, contains('acquisitions[pending.requestCode] = pending'));
    expect(
      source,
      contains('if (!current(pending)) throw DocumentCancelledException()'),
    );
    expect(
      source,
      contains('result.sendGuarded(response, { current(acquired) }'),
    );
    expect(source, contains('invalidateAcquisitions()'));
  });
  test('source binding: ordinary saturation cannot consume reserved cleanup barrier', () {
    expect(helper, contains('Semaphore(5)'));
    expect(helper, contains('ArrayBlockingQueue<Runnable>(5)'));
    expect(helper, contains('override fun terminated()'));
    expect(source, contains('io.requestCleanup(true)'));
    expect(source, contains('teardown.thenAccept'));
  });
  test('source binding: a first close fault preserves identities and other cleanup attempts', () {
    expect(
      source,
      contains('{ cleanupRead() }, { cleanupWrite() }, { cleanupTargets() }'),
    );
    expect(source, contains('r.input.close(); read = null'));
    expect(
      source,
      contains('if (failure != null) throw failure\n        write = null'),
    );
    expect(source, isNot(contains('targets.clear()')));
    expect(source, isNot(contains('write = null; w.output.close()')));
  });
  for (final engineToo in [false, true]) {
    test(
      'stale worker epoch protocol refuses acquired capability engineDetach=$engineToo',
      () async {
        final native = EpochFrontier();
        final op = Operation.create(), gateway = AndroidDocumentGateway(native);
        final request = gateway.prepareSave(
          ['a.png'],
          'image/png',
          operation: op,
        );
        final observed = expectLater(
          request,
          throwsA(isA<DocumentGatewayException>()),
        );
        try {
          await native.acquired.future;
          native.detach(engineToo: engineToo);
          native.deliver.complete();
          await observed;
          expect(native.methods, contains('releaseOperation'));
          expect(native.live, isFalse);
          expect(native.providerOpens, 0);
        } finally {
          if (!native.deliver.isCompleted) native.deliver.complete();
          await observed;
          await gateway.close();
          await op.finish();
        }
      },
    );
  }
  test(
    'rotation protocol positive control retains intended acquisition',
    () async {
      final native = EpochFrontier();
      final op = Operation.create(), gateway = AndroidDocumentGateway(native);
      try {
        final request = gateway.prepareSave(
          ['a.png'],
          'image/png',
          operation: op,
        );
        await native.acquired.future;
        native.detach(rotation: true);
        native.deliver.complete();
        final destination = await request;
        expect(destination, isNotNull);
        expect(native.live, isTrue);
        await gateway.abortPrepared(destination!, operation: op);
        expect(native.live, isFalse);
      } finally {
        if (!native.deliver.isCompleted) native.deliver.complete();
        await gateway.close();
        await op.finish();
      }
    },
  );
}
