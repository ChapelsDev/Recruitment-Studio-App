import 'dart:async';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/shared/operation.dart';
import 'package:recruitment_studio/shared/problem.dart';

import '../support/operation_io_witness.dart';

void main() {
  test('nested idle subscription and throwing reentrant enrollment retain FIFO callbacks until drain', () async {
    final op = WorkOperation.create();
    final first = Completer<void>();
    final second = Completer<void>();
    final enrolled = Completer<void>();
    final calls = <String>[];
    op.registerPending(first.future);
    op.afterPending(() {
      calls.add('enroll');
      op.afterPending(() {
        calls.add('nested');
      });
      op.registerPending(second.future);
      enrolled.complete();
      throw StateError('private observer');
    });
    op.afterPending(() {
      calls.add('tail');
    });
    op.registerDrainFinalizer(() {
      calls.add('finalizer');
    });
    try {
      first.complete();
      await enrolled.future;
      expect(calls, ['enroll']);
      final finish = op.finish();
      final result = expectLater(finish, throwsA(isA<OperationException>()));
      expect(op.finish(), same(finish));
      second.complete();
      await result;
      expect(calls, ['enroll', 'tail', 'nested', 'finalizer']);
    } finally {
      if (!first.isCompleted) first.complete();
      if (!second.isCompleted) second.complete();
      await expectLater(op.finish(), throwsA(isA<OperationException>()));
    }
  });
  late Directory dir;
  setUp(() async {
    dir = await createOperationTestDirectory();
  });
  tearDown(() async {
    await dir.delete(recursive: true);
  });
  test('enrolled staging written by a registered worker is cleaned only after its actual close', () async {
    final file = await File('${dir.path}/worker-writing')
        .writeAsString('initial');
    final op = Operation.create() as WorkOperation;
    final mayWrite = Completer<void>();
    final completion = () async {
      await mayWrite.future;
      final writer = await file.open(mode: FileMode.append);
      await writer.writeString(' appended by worker');
      await writer.close();
      return file;
    }();
    op.ownStagingWhenClosed(completion);
    op.cancel();
    final finish = op.finish();
    expect(await file.exists(), isTrue);
    mayWrite.complete();
    await completion;
    await finish;
    expect(await file.exists(), isFalse);
  });
  test('closed-output handoff retains partial staging on worker failure only until drain', () async {
    final file = await File('${dir.path}/failed-worker')
        .writeAsString('initial');
    final op = Operation.create() as WorkOperation;
    final mayWrite = Completer<void>();
    final workerError = Completer<void>();
    op.registerPending(workerError.future);
    final closedOutput = () async {
      await mayWrite.future;
      final writer = await file.open(mode: FileMode.append);
      try {
        await writer.writeString(' partial before error');
      } finally {
        await writer.close();
      }
      workerError.completeError(StateError('private worker error'));
      return file;
    }();
    op.ownStagingWhenClosed(closedOutput);
    final finish = expectLater(op.finish(), throwsA(isA<OperationException>()));
    expect(await file.exists(), isTrue);
    mayWrite.complete();
    await finish;
    expect(await file.exists(), isFalse);
  });
  test('closed-output handoff failure or unsafe returned path does not suppress other cleanup', () async {
    for (final unsafe in [false, true]) {
      final op = Operation.create() as WorkOperation;
      final owned = await File('${dir.path}/known-$unsafe')
          .writeAsString('staging');
      final input = await File('${dir.path}/input-$unsafe')
          .writeAsString('original');
      final link = await Link('${dir.path}/link-$unsafe').create(input.path);
      op.ownStaging(owned);
      final output = Completer<File>();
      op.ownStagingWhenClosed(output.future);
      final finish = expectLater(
        op.finish(),
        throwsA(isA<OperationException>()),
      );
      if (unsafe) {
        output.complete(File(link.path));
      } else {
        output.completeError(StateError('private worker output failed'));
      }
      await finish;
      expect(await owned.exists(), isFalse);
      expect(await input.readAsString(), 'original');
      expect(await link.exists(), isTrue);
    }
  });
  test(
    'closed-output handoff forbids new enrollment after cancel or finish',
    () async {
      final file = await File('${dir.path}/not-enrolled')
          .writeAsString('foreign');
      final cancelled = Operation.create() as WorkOperation;
      cancelled.cancel();
      expect(
        () => cancelled.ownStagingWhenClosed(Future.value(file)),
        throwsA(isA<OperationException>()),
      );
      await cancelled.finish();
      final finished = Operation.create() as WorkOperation;
      await finished.finish();
      expect(
        () => finished.ownStagingWhenClosed(Future.value(file)),
        throwsStateError,
      );
      expect(await file.readAsString(), 'foreign');
    },
  );
  test('finish is reentrant and returns the identical completion to stop observers', () async {
    final op = Operation.create() as WorkOperation;
    Future<void>? observed;
    op.addStopListener(() {
      observed = op.finish();
    });
    final finish = op.finish();
    expect(observed, same(finish));
    await finish;
    expect(op.finish(), same(finish));
  });
  test(
    'failing stop observer cannot suppress other observers or owned cleanup',
    () async {
      final op = Operation.create() as WorkOperation;
      final file = await File('${dir.path}/observer').writeAsString('staging');
      op.ownStaging(file);
      var called = false;
      op.addStopListener(() {
        throw StateError('private callback');
      });
      op.addStopListener(() {
        called = true;
      });
      expect(op.cancel, returnsNormally);
      expect(called, isTrue);
      await expectLater(op.finish(), throwsA(isA<OperationException>()));
      expect(await file.exists(), isFalse);
    },
  );
  test('failing deferred idle callback still drains and runs every finalizer and cleanup', () async {
    final op = Operation.create() as WorkOperation;
    final barrier = Completer<void>();
    final file = await File('${dir.path}/idle-error').writeAsString('staging');
    op.ownStaging(file);
    op.registerPending(barrier.future);
    op.afterPending(() {
      throw StateError('private idle callback');
    });
    var finalized = false;
    op.registerDrainFinalizer(() {
      finalized = true;
    });
    final result = expectLater(op.finish(), throwsA(isA<OperationException>()));
    barrier.complete();
    await result;
    expect(finalized, isTrue);
    expect(await file.exists(), isFalse);
  });
  test('finalizer failures and already-completed pending errors produce safe cleanup', () async {
    final op = Operation.create() as WorkOperation;
    final file = await File('${dir.path}/finalizer-error')
        .writeAsString('staging');
    op.ownStaging(file);
    final pending = Completer<void>();
    op.registerPending(pending.future);
    pending.completeError(StateError('private failure'));
    await pending.future.catchError((_) {});
    op.registerDrainFinalizer(() {
      throw StateError('private finalizer');
    });
    var called = false;
    op.registerDrainFinalizer(() {
      called = true;
    });
    await expectLater(op.finish(), throwsA(isA<OperationException>()));
    expect(called, isTrue);
    expect(await file.exists(), isFalse);
  });
  test('portable root selection honors override and models missing override and Windows paths', () {
    var fallbackCalls = 0;
    String fallback() {
      fallbackCalls++;
      return r'C:\runner\temp';
    }

    expect(
      operationTestRoot(
        environment: {'TMPDIR': r'D:\run\scratch'},
        platformTemporaryRoot: fallback,
      ),
      r'D:\run\scratch',
    );
    expect(fallbackCalls, 0);
    expect(
      operationTestRoot(environment: {}, platformTemporaryRoot: fallback),
      r'C:\runner\temp',
    );
    expect(
      operationTestRoot(
        environment: {'TMPDIR': ''},
        platformTemporaryRoot: () => '/modeled/temp',
      ),
      '/modeled/temp',
    );
    expect(
      operationTestRoot(
        environment: {'TEMP': r'C:\user\temp'},
        platformTemporaryRoot: fallback,
      ),
      r'C:\user\temp',
    );
    expect(fallbackCalls, 1);
    expect(dir.parent.path, Directory(operationTestRoot()).absolute.path);
  });
  test(
    'ordinary cleanup suite has no POSIX utility or null TMPDIR prerequisite',
    () async {
      final source = await File('test/shared/operation_test.dart')
          .readAsString();
      expect(
        source,
        isNot(
          contains(
            '/bin/'
            'chmod',
          ),
        ),
      );
      expect(
        source,
        isNot(
          contains(
            "Platform.environment['TMPDIR']"
            '!',
          ),
        ),
      );
    },
  );
  test('portable specific deletion IO failure preserves guards and does not hide real successful cleanup', () async {
    final denied = await File('${dir.path}/denied').writeAsString('staging');
    final allowed = await File('${dir.path}/allowed').writeAsString('staging');
    final replaced = await File('${dir.path}/replaced').writeAsString('old');
    final removed = await File('${dir.path}/removed').writeAsString('old');
    final swapped = await File('${dir.path}/swapped').writeAsString('owned');
    final foreign = await File('${dir.path}/input').writeAsString('original');
    final destination = await File('${dir.path}/destination')
        .writeAsString('completed');
    final witness = DeletionErrorWitness(denied.absolute.path);
    final op = WorkOperation.create(deleteStaging: witness.delete);
    for (final f in [denied, allowed, replaced, removed, swapped]) {
      op.ownStaging(f);
    }
    expect(() => op.ownStaging(File(dir.path)), throwsArgumentError);
    await replaced.writeAsString('foreign replacement, different size');
    await removed.delete();
    await swapped.delete();
    await Link(swapped.path).create(foreign.path);
    await expectLater(
      op.finish(),
      throwsA(
        isA<OperationException>().having(
          (e) => e.problem.code,
          'code',
          ProblemCode.ioFailure,
        ),
      ),
    );
    expect(witness.visited, [denied.absolute.path, allowed.absolute.path]);
    expect(await denied.exists(), isTrue);
    expect(await allowed.exists(), isFalse);
    expect(
      await replaced.readAsString(),
      'foreign replacement, different size',
    );
    expect(await foreign.readAsString(), 'original');
    expect(await destination.readAsString(), 'completed');
    await expectLater(op.finish(), throwsA(isA<OperationException>()));
    expect(witness.visited.length, 2);
  });
  test('finish waits registered worker and stream completion before cleanup and finalizers', () async {
    final op = Operation.create() as WorkOperation;
    final worker = Completer<void>();
    final stream = StreamController<int>();
    final events = <String>[];
    final streamDone = stream.stream.forEach((value) {
      events.add('stream$value');
    });
    op.registerPending(worker.future);
    op.registerPending(streamDone);
    final staging = await File('${dir.path}/pending').writeAsString('partial');
    op.ownStaging(staging);
    op.registerDrainFinalizer(() {
      events.add('release');
    });
    var finished = false;
    op.cancel();
    final completion = op.finish().then((_) {
      finished = true;
    });
    expect(op.isFinishing, isTrue);
    expect(finished, isFalse);
    expect(await staging.exists(), isTrue);
    expect(() => op.registerPending(Future.value()), throwsStateError);
    expect(() => op.registerDrainFinalizer(() {}), throwsStateError);
    worker.complete();
    stream.add(1);
    expect(events.contains('release'), isFalse);
    expect(await staging.exists(), isTrue);
    await stream.close();
    await completion;
    expect(events, ['stream1', 'release']);
    expect(finished, isTrue);
    expect(await staging.exists(), isFalse);
    await op.finish();
    expect(events.where((e) => e == 'release').length, 1);
  });
  test('pending error waits remaining barriers and still cleans owned staging with safe result', () async {
    final op = Operation.create() as WorkOperation;
    final failed = Completer<void>();
    final stillRunning = Completer<void>();
    op.registerPending(failed.future);
    op.registerPending(stillRunning.future);
    final staging = await File('${dir.path}/failure').writeAsString('partial');
    op.ownStaging(staging);
    failed.completeError(StateError('sensitive source /private/example'));
    final result = expectLater(
      op.finish(),
      throwsA(
        isA<OperationException>()
            .having((e) => e.problem.code, 'code', ProblemCode.ioFailure)
            .having((e) => e.toString(), 'safe', isNot(contains('/private'))),
      ),
    );
    expect(await staging.exists(), isTrue);
    stillRunning.complete();
    await result;
    expect(await staging.exists(), isFalse);
    await expectLater(op.finish(), throwsA(isA<OperationException>()));
  });
  test('stop listeners are removable synchronous and no registration follows cancel', () async {
    final op = Operation.create() as WorkOperation;
    final calls = <int>[];
    final remove = op.addStopListener(() {
      calls.add(1);
    });
    op.addStopListener(() {
      calls.add(2);
    });
    remove();
    remove();
    op.cancel();
    expect(calls, [2]);
    op.cancel();
    expect(calls, [2]);
    expect(
      () => op.registerPending(Future.value()),
      throwsA(isA<OperationException>()),
    );
    expect(() => op.addStopListener(() {}), throwsA(isA<OperationException>()));
    expect(
      () => op.registerDrainFinalizer(() {}),
      throwsA(isA<OperationException>()),
    );
    await op.finish();
    expect(calls, [2]);
    final normal = Operation.create() as WorkOperation;
    normal.addStopListener(() {
      calls.add(3);
    });
    await normal.finish();
    expect(calls, [2, 3]);
  });
  test(
    'unique operation retains scope and idempotent explicit cancellation',
    () async {
      final op = Operation.create(
        projectId: 'p',
        revision: 4,
        sessionGeneration: 2,
      ) as WorkOperation;
      expect(op.projectId, 'p');
      expect(op.revision, 4);
      expect(op.sessionGeneration, 2);
      expect(op.id, isNot(Operation.create().id));
      expect(op.isCancelled, isFalse);
      op.throwIfCancelled();
      op.cancel();
      op.cancel();
      expect(op.isCancelled, isTrue);
      expect(
        () => op.throwIfCancelled(),
        throwsA(
          isA<OperationException>().having(
            (e) => e.problem.code,
            'code',
            ProblemCode.operationCancelled,
          ),
        ),
      );
      await op.finish();
      await op.finish();
      expect(() => op.ownStaging(File('${dir.path}/later')), throwsStateError);
      expect(() => Operation.create(revision: -1), throwsArgumentError);
      expect(
        () => Operation.create(sessionGeneration: -1),
        throwsArgumentError,
      );
    },
  );
  test('finish clears only declared regular staging preserving inputs and destinations', () async {
    final staging = await File('${dir.path}/owned').writeAsString('partial');
    final input = await File('${dir.path}/input').writeAsString('original');
    final saved = await File('${dir.path}/saved').writeAsString('completed');
    final op = Operation.create();
    op.ownStaging(staging);
    op.ownStaging(staging);
    await op.finish();
    await op.finish();
    expect(await staging.exists(), isFalse);
    expect(await input.readAsString(), 'original');
    expect(await saved.readAsString(), 'completed');
    expect(await dir.exists(), isTrue);
  });
  test(
    'cancelled staging is cleaned but cancellation forbids later enrollment',
    () async {
      final staging = await File('${dir.path}/owned').writeAsString('partial');
      final op = Operation.create();
      op.ownStaging(staging);
      op.cancel();
      expect(() => op.ownStaging(staging), throwsA(isA<OperationException>()));
      await op.finish();
      expect(await staging.exists(), isFalse);
    },
  );
  test('staging registry rejects directory link missing and symlinked-parent abuse', () async {
    final input = await File('${dir.path}/input').writeAsString('original');
    final link = await Link('${dir.path}/link').create(input.path);
    final sub = await Directory('${dir.path}/sub').create();
    final subfile = await File('${sub.path}/f').writeAsString('foreign');
    final parentLink = await Link('${dir.path}/parent-link').create(sub.path);
    final op = Operation.create();
    expect(() => op.ownStaging(File(dir.path)), throwsArgumentError);
    expect(() => op.ownStaging(File(link.path)), throwsArgumentError);
    expect(
      () => op.ownStaging(File('${dir.path}/missing')),
      throwsArgumentError,
    );
    expect(
      () => op.ownStaging(File('${parentLink.path}/f')),
      throwsArgumentError,
    );
    await op.finish();
    expect(await input.readAsString(), 'original');
    expect(await subfile.readAsString(), 'foreign');
    expect(await link.exists(), isTrue);
  });
  test('cleanup does not follow swapped links or delete replaced foreign regular files', () async {
    final owned = await File('${dir.path}/owned').writeAsString('partial');
    final foreign = await File('${dir.path}/foreign').writeAsString('original');
    final replaced = await File('${dir.path}/replaced').writeAsString('old');
    final removed = await File('${dir.path}/removed').writeAsString('x');
    final op = Operation.create();
    op.ownStaging(owned);
    op.ownStaging(replaced);
    op.ownStaging(removed);
    await owned.delete();
    await Link(owned.path).create(foreign.path);
    await replaced.delete();
    await File(replaced.path).writeAsString('new foreign file');
    await removed.delete();
    await op.finish();
    expect(await foreign.readAsString(), 'original');
    expect(await File(replaced.path).readAsString(), 'new foreign file');
    expect(await Link(owned.path).exists(), isTrue);
  });
}
