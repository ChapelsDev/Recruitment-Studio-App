import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/features/storage/draft_scheduler.dart';
import 'package:recruitment_studio/features/storage/local_repository.dart';
import 'package:recruitment_studio/shared/admission_budget.dart';
import 'package:recruitment_studio/shared/problem.dart';
import 'package:recruitment_studio/shared/work_budget.dart';

import '../../support/project_fixtures.dart';
import 'draft_scheduler_test.dart' show ManualClock, drain;

void main() {
  for (final scenario in [
    (timer: false, headroom: 0),
    (timer: true, headroom: 0),
    (timer: false, headroom: 4096),
    (timer: true, headroom: 4096),
    (timer: false, headroom: 8192),
    (timer: true, headroom: 8192),
  ]) {
    final timer = scenario.timer;
    test(
      'checkpoint startup refusal preserves retry without phantom active timer=$timer headroom=${scenario.headroom}',
      () async {
        final root = await Directory.systemTemp.createTemp('t07-fix01-start-');
        final budget = WorkBudgetController();
        final repository = FileLocalRepository(root, budget: budget);
        final clock = ManualClock();
        final problems = <Problem>[];
        final scheduler = DraftScheduler(
          repository,
          clock,
          budget: budget,
          onProblem: problems.add,
        );
        final source = await fixtureBundle();
        final sourcePayment = budget.reserveCopy(
          source.resources.values.single.length,
        );
        scheduler.changed(source, sessionGeneration: 4);
        final ownedBefore = budget.reservedBytes;
        final pressure = AdmissionBudget.shared.reserve(
          AdmissionBudget.shared.capacityBytes -
              AdmissionBudget.shared.reservedBytes -
              scenario.headroom,
        );
        final ordinaryBefore = AdmissionBudget.shared.reservedBytes;
        try {
          if (timer) {
            expect(
              () => clock.advance(const Duration(seconds: 2)),
              returnsNormally,
              reason: 'Synchronous startup refusal must not escape timer',
            );
            await drain();
          } else {
            expect(await scheduler.checkpoint(), isNull);
          }
          expect(problems.single.code, ProblemCode.capacityExceeded);
          expect(scheduler.hasPendingChanges, isTrue);
          expect(budget.reservedBytes, ownedBefore);
          expect(
            AdmissionBudget.shared.reservedBytes,
            lessThanOrEqualTo(ordinaryBefore),
            reason:
                'Transactional completion credit must roll back on job refusal',
          );
          expect(root.listSync(), isEmpty);
        } finally {
          pressure.release();
          await scheduler.close(checkpoint: false);
          await repository.close();
          sourcePayment.release();
          await root.delete(recursive: true);
        }
        expect(
          budget.reservedBytes,
          0,
          reason: 'Discard must release the pending owner when startup never published a job',
        );
      },
    );
  }

  test('checkpoint retries the same pending content after startup pressure retires', () async {
    final root = await Directory.systemTemp.createTemp('t07-fix01-retry-');
    final budget = WorkBudgetController();
    final repository = FileLocalRepository(root, budget: budget);
    final problems = <Problem>[];
    final scheduler = DraftScheduler(
      repository,
      ManualClock(),
      budget: budget,
      onProblem: problems.add,
    );
    final source = await fixtureBundle();
    final sourcePayment = budget.reserveCopy(
      source.resources.values.single.length,
    );
    scheduler.changed(source, sessionGeneration: 7);
    final pressure = AdmissionBudget.shared.reserve(
      AdmissionBudget.shared.capacityBytes -
          AdmissionBudget.shared.reservedBytes,
    );
    try {
      expect(await scheduler.checkpoint(), isNull);
    } finally {
      pressure.release();
    }
    try {
      final receipt = (await scheduler.checkpoint())!;
      expect(receipt.status, SaveStatus.completed);
      expect(receipt.projectId, source.project.id);
      expect(receipt.revision, source.project.revision);
      expect(receipt.sessionGeneration, 7);
      expect(scheduler.hasPendingChanges, isFalse);
      expect(problems.single.code, ProblemCode.capacityExceeded);
    } finally {
      await scheduler.close(checkpoint: false);
      await repository.close();
      sourcePayment.release();
      await root.delete(recursive: true);
    }
    expect(budget.reservedBytes, 0);
  });
}
