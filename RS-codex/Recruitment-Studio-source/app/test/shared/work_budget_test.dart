import 'dart:async';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/shared/work_budget.dart';
import 'package:recruitment_studio/shared/work_limits.dart';
import 'package:recruitment_studio/shared/operation.dart';
import 'package:recruitment_studio/shared/problem.dart';

// A real delegated Operation lacks the WorkOperation drain registry: refuse it.
final class DelegatingOperation implements Operation {
  final Operation inner = Operation.create();
  @override
  String get id => inner.id;
  @override
  bool get isCancelled => inner.isCancelled;
  @override
  void cancel() => inner.cancel();
  @override
  void throwIfCancelled() => inner.throwIfCancelled();
  @override
  void ownStaging(File file) => inner.ownStaging(file);
  @override
  Future<void> finish() => inner.finish();
}

void main() {
  for (final heavy in [true, false]) {
    test(
      'reentrant accepted barriers retain ${heavy ? 'heavy' : 'reservation'} through multiple drains and FIFO recovery',
      () async {
        final budget = WorkBudgetController(capacityBytes: 10);
        final owner = WorkOperation.create();
        final first = Completer<void>();
        final second = Completer<void>();
        final third = Completer<void>();
        final enrolledSecond = Completer<void>();
        final enrolledThird = Completer<void>();
        final drained = Completer<void>();
        final a = Operation.create();
        final b = Operation.create();
        final lease = heavy ? await budget.acquire(owner, 7) : null;
        final retained = budget.reserve(owner, heavy ? 3 : 10);
        owner.registerPending(first.future);
        owner.afterPending(() {
          owner.registerPending(second.future);
          enrolledSecond.complete();
        });
        owner.afterPending(() {
          owner.registerPending(third.future);
          enrolledThird.complete();
        });
        lease?.release();
        lease?.release();
        retained.release();
        retained.release();
        owner.afterPending(drained.complete);
        // Reservations alone do not serialize work; queue behind an independent
        // zero-byte heavy lease to witness the same-drain accounting at admission.
        final blocker = heavy ? null : await budget.acquire(a, 0);
        final nextOwner = heavy ? a : Operation.create();
        final next = budget.acquire(nextOwner, 10);
        final last = budget.acquire(b, 10);
        try {
          first.complete();
          await enrolledSecond.future;
          expect(budget.reservedBytes, 10);
          expect(budget.queuedCount, 2);
          expect(drained.isCompleted, isFalse);
          second.complete();
          await enrolledThird.future;
          expect(budget.reservedBytes, 10);
          expect(budget.queuedCount, 2);
          expect(drained.isCompleted, isFalse);
          // Seal after accepted enrollment; both cancel and finish must wait.
          owner.cancel();
          final finish = owner.finish();
          expect(owner.finish(), same(finish));
          expect(() => owner.registerPending(Future.value()), throwsStateError);
          expect(budget.reservedBytes, 10);
          third.complete();
          await drained.future;
          await finish;
          blocker?.release();
          final admitted = await next;
          expect(budget.reservedBytes, 10);
          expect(budget.queuedCount, 1);
          admitted.release();
          admitted.release();
          final finalLease = await last;
          expect(budget.reservedBytes, 10);
          finalLease.release();
          retained.release();
          lease?.release();
          expect(budget.reservedBytes, 0);
        } finally {
          for (final barrier in [first, second, third]) {
            if (!barrier.isCompleted) barrier.complete();
          }
          blocker?.release();
          (await next).release();
          (await last).release();
          await owner.finish();
          await a.finish();
          await b.finish();
          await nextOwner.finish();
        }
      },
    );
  }
  test('pre-registered barriers and throwing idle observers retain releases until final drain', () async {
    final budget = WorkBudgetController(capacityBytes: 10);
    final owner = WorkOperation.create();
    final first = Completer<void>();
    final second = Completer<void>();
    final firstObserved = Completer<void>();
    final lease = await budget.acquire(owner, 6);
    final extra = budget.reserve(owner, 4);
    owner.registerPending(first.future);
    owner.registerPending(second.future);
    owner.afterPending(() {
      throw StateError('private idle error');
    });
    lease.release();
    extra.release();
    first.future.then((_) => firstObserved.complete());
    first.complete();
    await firstObserved.future;
    expect(budget.reservedBytes, 10);
    final failure = expectLater(
      owner.finish(),
      throwsA(isA<OperationException>()),
    );
    second.complete();
    await failure;
    expect(budget.reservedBytes, 0);
    final later = Operation.create();
    (await budget.acquire(later, 10)).release();
    await later.finish();
  });
  test(
    'budget refuses operation without required completion registry',
    () async {
      final budget = WorkBudgetController(capacityBytes: 10);
      final op = DelegatingOperation();
      await expectLater(budget.acquire(op, 1), throwsArgumentError);
      expect(() => budget.reserve(op, 1), throwsArgumentError);
      expect(budget.reservedBytes, 0);
      await op.finish();
    },
  );
  test('shared production controller and exact owned-byte cap refuse first invalid', () async {
    final budget = WorkBudget.shared() as WorkBudgetController;
    expect(budget.capacityBytes, WorkLimits.ownedBufferBytes);
    final owner = Operation.create();
    final other = Operation.create();
    final retained = budget.reserve(owner, WorkLimits.ownedBufferBytes);
    await expectLater(
      budget.acquire(other, 1),
      throwsA(isA<CapacityExceeded>()),
    );
    expect(() => budget.reserve(other, 1), throwsA(isA<CapacityExceeded>()));
    retained.release();
    final first = await budget.acquire(owner, WorkLimits.ownedBufferBytes);
    await expectLater(
      budget.acquire(other, WorkLimits.ownedBufferBytes + 1),
      throwsA(isA<CapacityExceeded>()),
    );
    final next = WorkBudget.shared().acquire(other, 1);
    expect(budget.queuedCount, 1);
    first.release();
    final second = await next;
    second.release();
    await owner.finish();
    await other.finish();
    expect(budget.reservedBytes, 0);
    expect(
      () =>
          WorkBudgetController(capacityBytes: WorkLimits.ownedBufferBytes + 1),
      throwsArgumentError,
    );
  });
  test('duplicate queued identity is refused and active cancelled lease cannot be borrowed', () async {
    final budget = WorkBudgetController(capacityBytes: 10);
    final active = Operation.create();
    final waiting = Operation.create();
    final lease = await budget.acquire(active, 1);
    final next = budget.acquire(waiting, 1);
    await expectLater(budget.acquire(waiting, 1), throwsStateError);
    active.cancel();
    expect(() => lease.forChild(active), throwsA(isA<OperationException>()));
    expect(budget.reservedBytes, 1);
    lease.release();
    final admitted = await next;
    admitted.release();
    await active.finish();
    await waiting.finish();
    await expectLater(budget.acquire(waiting, 1), throwsStateError);
    expect(() => budget.reserve(waiting, 1), throwsStateError);
  });
  test(
    'default budget shares one controller and FIFO admits one heavy slot',
    () async {
      expect(WorkBudget.shared(), same(WorkBudget.shared()));
      final budget = WorkBudgetController(capacityBytes: 10);
      final a = Operation.create();
      final b = Operation.create();
      final c = Operation.create();
      final first = await budget.acquire(a, 4);
      var secondAdmitted = false;
      var thirdAdmitted = false;
      final second = budget.acquire(b, 5).then((lease) {
        secondAdmitted = true;
        return lease;
      });
      final third = budget.acquire(c, 6).then((lease) {
        thirdAdmitted = true;
        return lease;
      });
      expect(budget.queuedCount, 2);
      expect(budget.reservedBytes, 4);
      expect(secondAdmitted, isFalse);
      expect(thirdAdmitted, isFalse);
      first.release();
      first.release();
      final leaseB = await second;
      expect(secondAdmitted, isTrue);
      expect(thirdAdmitted, isFalse);
      expect(budget.reservedBytes, 5);
      leaseB.release();
      final leaseC = await third;
      expect(thirdAdmitted, isTrue);
      leaseC.release();
      await a.finish();
      await b.finish();
      await c.finish();
      expect(budget.reservedBytes, 0);
      expect(budget.queuedCount, 0);
    },
  );
  test('child reuses live lease with aggregate reservations and no recursive deadlock', () async {
    final budget = WorkBudgetController(capacityBytes: 10);
    final owner = Operation.create();
    final other = Operation.create();
    final retained = budget.reserve(other, 3);
    final lease = await budget.acquire(owner, 4);
    expect(lease.forChild(owner), same(lease));
    final scratch = lease.reserveAdditional(owner, 3);
    expect(budget.reservedBytes, 10);
    expect(
      () => lease.reserveAdditional(owner, 1),
      throwsA(isA<CapacityExceeded>()),
    );
    expect(() => lease.forChild(other), throwsArgumentError);
    await expectLater(budget.acquire(owner, 0), throwsStateError);
    scratch.release();
    scratch.release();
    expect(budget.reservedBytes, 7);
    retained.release();
    lease.release();
    expect(budget.reservedBytes, 0);
    expect(() => lease.forChild(owner), throwsStateError);
    expect(() => lease.reserveAdditional(owner, 1), throwsStateError);
    final later = await budget.acquire(other, 10);
    later.release();
    await owner.finish();
    await other.finish();
  });
  test('negative oversized aggregate refusal preserves budget and later admissions', () async {
    final budget = WorkBudgetController(capacityBytes: 10);
    final op = Operation.create();
    await expectLater(budget.acquire(op, -1), throwsArgumentError);
    await expectLater(budget.acquire(op, 11), throwsA(isA<CapacityExceeded>()));
    expect(() => budget.reserve(op, -1), throwsArgumentError);
    expect(() => budget.reserve(op, 11), throwsA(isA<CapacityExceeded>()));
    expect(() => WorkBudgetController(capacityBytes: -1), throwsArgumentError);
    final existing = budget.reserve(op, 8);
    await expectLater(budget.acquire(op, 3), throwsA(isA<CapacityExceeded>()));
    expect(budget.reservedBytes, 8);
    existing.release();
    final zero = await budget.acquire(op, 0);
    zero.release();
    final full = await budget.acquire(op, 10);
    full.release();
    await op.finish();
    expect(budget.reservedBytes, 0);
  });
  test('cancel while queued removes waiter immediately never promotes it and next succeeds', () async {
    final budget = WorkBudgetController(capacityBytes: 10);
    final active = Operation.create();
    final cancelled = Operation.create();
    final later = Operation.create();
    final lease = await budget.acquire(active, 1);
    final refusal = expectLater(
      budget.acquire(cancelled, 1),
      throwsA(
        isA<OperationException>().having(
          (e) => e.problem.code,
          'code',
          ProblemCode.operationCancelled,
        ),
      ),
    );
    expect(budget.queuedCount, 1);
    cancelled.cancel();
    expect(budget.queuedCount, 0);
    await refusal;
    lease.release();
    final next = await budget.acquire(later, 10);
    next.release();
    await expectLater(
      budget.acquire(cancelled, 1),
      throwsA(isA<OperationException>()),
    );
    expect(
      () => budget.reserve(cancelled, 1),
      throwsA(isA<OperationException>()),
    );
    await active.finish();
    await cancelled.finish();
    await later.finish();
  });
  test('finish while queued removes waiter and admission-time exhaustion refuses only that request', () async {
    final budget = WorkBudgetController(capacityBytes: 10);
    final active = Operation.create();
    final finished = Operation.create();
    final denied = Operation.create();
    final next = Operation.create();
    final lease = await budget.acquire(active, 1);
    final ended = expectLater(budget.acquire(finished, 1), throwsStateError);
    await finished.finish();
    await ended;
    expect(budget.queuedCount, 0);
    final fail = expectLater(
      budget.acquire(denied, 10),
      throwsA(isA<CapacityExceeded>()),
    );
    final later = budget.acquire(next, 1);
    final retained = budget.reserve(active, 2);
    lease.release();
    await fail;
    final second = await later;
    expect(budget.reservedBytes, 3);
    second.release();
    retained.release();
    await active.finish();
    await denied.finish();
    await next.finish();
  });
  test('release or cancel cannot unlock pending worker and finish drains before release', () async {
    final budget = WorkBudgetController(capacityBytes: 10);
    final op = Operation.create() as WorkOperation;
    final next = Operation.create();
    final lease = await budget.acquire(op, 7);
    final pending = Completer<void>();
    op.registerPending(pending.future);
    final extra = lease.reserveAdditional(op, 3);
    final later = budget.acquire(next, 10);
    lease.release();
    extra.release();
    op.cancel();
    expect(budget.reservedBytes, 10);
    expect(budget.queuedCount, 1);
    expect(() => lease.forChild(op), throwsStateError);
    final finish = op.finish();
    expect(budget.reservedBytes, 10);
    pending.complete();
    await finish;
    final admitted = await later;
    expect(budget.reservedBytes, 10);
    admitted.release();
    await next.finish();
    expect(budget.reservedBytes, 0);
  });
  test('active error finally and failed pending finish both release for next successful operation', () async {
    final budget = WorkBudgetController(capacityBytes: 10);
    final a = Operation.create();
    final first = await budget.acquire(a, 10);
    try {
      throw StateError('failure');
    } catch (_) {
      /* real failure path */
    } finally {
      first.release();
    }
    await a.finish();
    final failed = Operation.create() as WorkOperation;
    final barrier = Completer<void>();
    final lease = await budget.acquire(failed, 10);
    failed.registerPending(barrier.future);
    final later = Operation.create();
    final next = budget.acquire(later, 10);
    final failure = expectLater(
      failed.finish(),
      throwsA(isA<OperationException>()),
    );
    barrier.completeError(StateError('private worker failure'));
    await failure;
    lease.release();
    final admitted = await next;
    admitted.release();
    await later.finish();
    expect(budget.reservedBytes, 0);
  });
  test('bounded waiter queue rejects overflow and repeated cancellation does not retain waiters', () async {
    final budget = WorkBudgetController(capacityBytes: 10);
    final active = Operation.create();
    final lease = await budget.acquire(active, 1);
    final ops = <Operation>[];
    final outcomes = <Future<void>>[];
    for (var i = 0; i < WorkLimits.heavyWaiters; i++) {
      final op = Operation.create();
      ops.add(op);
      outcomes.add(
        expectLater(budget.acquire(op, 1), throwsA(isA<OperationException>())),
      );
    }
    final overflow = Operation.create();
    await expectLater(
      budget.acquire(overflow, 1),
      throwsA(isA<CapacityExceeded>()),
    );
    for (final op in ops) {
      op.cancel();
      await op.finish();
    }
    await Future.wait(outcomes);
    expect(budget.queuedCount, 0);
    lease.release();
    final next = await budget.acquire(overflow, 1);
    next.release();
    await overflow.finish();
    await active.finish();
  });
}
