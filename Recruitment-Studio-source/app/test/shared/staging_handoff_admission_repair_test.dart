// Inert source-only repair controls. No SDK execution or RED is claimed.
import 'dart:async';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/shared/admission_budget.dart';
import 'package:recruitment_studio/shared/operation.dart';
import 'package:recruitment_studio/shared/problem.dart';
import 'package:recruitment_studio/shared/work_limits.dart';

void main() {
  late Directory fixture;
  setUp(() {
    fixture = Directory.systemTemp.createTempSync('t06-staging-escrow-');
  });
  tearDown(() {
    fixture.deleteSync(recursive: true);
  });

  test('accepted closed output cleans up with ordinary budget exhausted',
      () async {
    final before = AdmissionBudget.shared.reservedBytes;
    final file = File('${fixture.path}/owned.bin')..writeAsBytesSync([1, 2]);
    final closed = Completer<File>();
    final op = WorkOperation.create();
    AdmissionTicket? filler;
    try {
      op.ownStagingWhenClosed(closed.future);
      filler = AdmissionBudget.shared.reserve(
        AdmissionBudget.shared.capacityBytes -
            AdmissionBudget.shared.reservedBytes,
      );
      expect(AdmissionBudget.shared.reservedBytes,
          AdmissionBudget.shared.capacityBytes);
      closed.complete(file);
      // Essential staging admission was prepaid before accepting the handoff.
      // No new ticket is needed at completion, including while finish drains.
      await op.finish();
      expect(file.existsSync(), isFalse);
      expect(filler.isActive, isTrue);
    } finally {
      if (!closed.isCompleted) {
        closed.complete(file);
      }
      filler?.release();
      try {
        await op.finish();
      } catch (_) {
        // A reached assertion/operation failure remains the test outcome;
        // still return the fixture's competing ticket and finish its owner.
      }
    }
    expect(AdmissionBudget.shared.reservedBytes, before);
  });

  test('cancelled accepted output remains prepaid through real close and drain',
      () async {
    final before = AdmissionBudget.shared.reservedBytes;
    final file = File('${fixture.path}/cancelled.bin')..writeAsBytesSync([3]);
    final closed = Completer<File>();
    final op = WorkOperation.create();
    AdmissionTicket? filler;
    try {
      op.ownStagingWhenClosed(closed.future);
      filler = AdmissionBudget.shared.reserve(
        AdmissionBudget.shared.capacityBytes -
            AdmissionBudget.shared.reservedBytes,
      );
      op.cancel();
      final finished = op.finish();
      closed.complete(file);
      await finished;
      expect(file.existsSync(), isFalse);
      expect(filler.isActive, isTrue);
    } finally {
      if (!closed.isCompleted) {
        closed.complete(file);
      }
      filler?.release();
      try {
        await op.finish();
      } catch (_) {}
    }
    expect(AdmissionBudget.shared.reservedBytes, before);
  });

  test('producer failure rolls back staging escrow and pending observation',
      () async {
    final before = AdmissionBudget.shared.reservedBytes;
    final closed = Completer<File>();
    final op = WorkOperation.create();
    op.ownStagingWhenClosed(closed.future);
    closed.completeError(const FileSystemException('synthetic close failure'));
    await expectLater(op.finish(), throwsA(isA<OperationException>()));
    expect(AdmissionBudget.shared.reservedBytes, before);
    expect(fixture.listSync(), isEmpty);
  });

  test('refused pending enrollment returns escrow without accepting output',
      () async {
    final before = AdmissionBudget.shared.reservedBytes;
    final pending = Completer<void>();
    final closed = Completer<File>();
    final op = WorkOperation.create();
    try {
      for (var i = 0; i < WorkLimits.pendingCompletions; i++) {
        op.registerPending(pending.future);
      }
      final atLimit = AdmissionBudget.shared.reservedBytes;
      expect(() => op.ownStagingWhenClosed(closed.future),
          throwsA(isA<CapacityExceeded>()));
      expect(AdmissionBudget.shared.reservedBytes, atLimit);
      // Rejected future has no admitted callback. This path never creates a file.
      closed.complete(File('${fixture.path}/not-created.bin'));
    } finally {
      pending.complete();
      await op.finish();
    }
    expect(AdmissionBudget.shared.reservedBytes, before);
    expect(fixture.listSync(), isEmpty);
  });

  test('invalid closed output refunds prepaid credit and reports failure',
      () async {
    final before = AdmissionBudget.shared.reservedBytes;
    final closed = Completer<File>();
    final op = WorkOperation.create();
    op.ownStagingWhenClosed(closed.future);
    closed.complete(File('${fixture.path}/missing.bin'));
    await expectLater(op.finish(), throwsA(isA<OperationException>()));
    expect(AdmissionBudget.shared.reservedBytes, before);
    expect(fixture.listSync(), isEmpty);
  });

  test('same file replaces staging ticket without a retained duplicate charge',
      () async {
    final before = AdmissionBudget.shared.reservedBytes;
    final file = File('${fixture.path}/same.bin')..writeAsBytesSync([4]);
    final op = WorkOperation.create();
    final closed = Completer<File>();
    try {
      op.ownStaging(file);
      final oneRecord = AdmissionBudget.shared.reservedBytes;
      op.ownStagingWhenClosed(closed.future);
      closed.complete(file);
      await Future<void>.delayed(Duration.zero);
      expect(AdmissionBudget.shared.reservedBytes, oneRecord);
      await op.finish();
      expect(file.existsSync(), isFalse);
    } finally {
      if (!closed.isCompleted) {
        closed.complete(file);
      }
      await op.finish();
    }
    expect(AdmissionBudget.shared.reservedBytes, before);
  });
}
