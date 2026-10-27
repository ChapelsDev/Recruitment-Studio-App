import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/features/projects/project.dart';
import 'package:recruitment_studio/features/projects/project_bundle.dart';
import 'package:recruitment_studio/features/storage/draft_scheduler.dart';
import 'package:recruitment_studio/features/storage/local_repository.dart';
import 'package:recruitment_studio/shared/admission_budget.dart';
import 'package:recruitment_studio/shared/problem.dart';
import 'package:recruitment_studio/shared/work_budget.dart';

import '../../support/project_fixtures.dart';
import 'draft_scheduler_test.dart' show ManualClock, drain;

void main() {
  for (final timer in [false, true]) {
    for (final headroom in [0, 4096]) {
      test(
        'capacity observer checkpoint reentry is bounded timer=$timer headroom=$headroom',
        () async {
          final root = await Directory.systemTemp.createTemp('t07-observer02-');
          final budget = WorkBudgetController();
          final repository = FileLocalRepository(root, budget: budget);
          final clock = ManualClock();
          final problems = <Problem>[];
          final reentries = <Future<SaveReceipt?>>[];
          var depth = 0, maximumDepth = 0;
          late DraftScheduler scheduler;
          scheduler = DraftScheduler(
            repository,
            clock,
            budget: budget,
            onProblem: (problem) {
              problems.add(problem);
              depth++;
              if (depth > maximumDepth) maximumDepth = depth;
              try {
                // A failure sentinel prevents a broken implementation exhausting the
                // test VM stack. Correct production never reaches this ninth call.
                if (problems.length <= 8) reentries.add(scheduler.checkpoint());
              } finally {
                depth--;
              }
            },
          );
          final source = await fixtureBundle();
          final sourcePayment = budget.reserveCopy(
            source.resources.values.single.length,
          );
          scheduler.changed(source, sessionGeneration: 11);
          final owned = budget.reservedBytes;
          final pressure = AdmissionBudget.shared.reserve(
            AdmissionBudget.shared.capacityBytes -
                AdmissionBudget.shared.reservedBytes -
                headroom,
          );
          final ordinary = AdmissionBudget.shared.reservedBytes;
          final tickets = AdmissionBudget.shared.ticketCount;
          try {
            try {
              if (timer) {
                expect(
                  () => clock.advance(const Duration(seconds: 2)),
                  returnsNormally,
                );
                await drain();
              } else {
                expect(await scheduler.checkpoint(), isNull);
              }
              expect(
                problems,
                hasLength(1),
                reason: 'Synchronous retry must not recursively notify',
              );
              expect(maximumDepth, 1);
              expect(problems.single.code, ProblemCode.capacityExceeded);
              expect(await Future.wait(reentries), everyElement(isNull));
              expect(scheduler.hasPendingChanges, isTrue);
              expect(budget.reservedBytes, owned);
              expect(AdmissionBudget.shared.reservedBytes, ordinary);
              expect(AdmissionBudget.shared.ticketCount, tickets);
              expect(root.listSync(), isEmpty);
            } finally {
              pressure.release();
            }
            final receipt = (await scheduler.checkpoint())!;
            expect(receipt.status, SaveStatus.completed);
            expect(receipt.projectId, source.project.id);
            expect(receipt.revision, source.project.revision);
            expect(receipt.sessionGeneration, 11);
            expect(receipt.snapshotSha256, matches(RegExp(r'^[0-9a-f]{64}$')));
            expect(scheduler.hasPendingChanges, isFalse);
            final recovered = (await repository.recoverDraft(
              source.project.id,
            ))!;
            expect(recovered.project.revision, source.project.revision);
            expect(recovered.resources.keys, source.resources.keys);
            repository.releaseRecoveredDraft(recovered);
            expect(problems, hasLength(1));
          } finally {
            await scheduler.close(checkpoint: false);
            await repository.close();
            sourcePayment.release();
            await root.delete(recursive: true);
          }
          expect(budget.reservedBytes, 0);
        },
      );
    }
  }

  test(
    'reentrant discard closes only scheduler custody after refused startup',
    () async {
      final root = await Directory.systemTemp.createTemp(
        't07-observer02-discard-',
      );
      final budget = WorkBudgetController();
      final repository = FileLocalRepository(root, budget: budget);
      final source = await fixtureBundle();
      final sourcePayment = budget.reserveCopy(
        source.resources.values.single.length,
      );
      late DraftScheduler scheduler;
      Future<SaveReceipt?>? closing;
      var notifications = 0;
      scheduler = DraftScheduler(
        repository,
        ManualClock(),
        budget: budget,
        onProblem: (_) {
          notifications++;
          if (notifications > 8) return;
          scheduler.checkpoint();
          closing ??= scheduler.close(checkpoint: false);
        },
      );
      scheduler.changed(source, sessionGeneration: 5);
      final pressure = AdmissionBudget.shared.reserve(
        AdmissionBudget.shared.capacityBytes -
            AdmissionBudget.shared.reservedBytes,
      );
      try {
        expect(await scheduler.checkpoint(), isNull);
        expect(notifications, 1);
        expect(closing, isNotNull);
        await closing;
        expect(scheduler.hasPendingChanges, isFalse);
        expect(source.resources.values.single, isNotEmpty);
        expect(budget.reservedBytes, sourcePayment.bytes);
        expect(scheduler.close(checkpoint: false), same(closing));
      } finally {
        pressure.release();
        await scheduler.close(checkpoint: false);
        await repository.close();
        sourcePayment.release();
        await root.delete(recursive: true);
      }
      expect(budget.reservedBytes, 0);
    },
  );

  test(
    'reentrant save-close reports refusal without manufacturing a saved draft',
    () async {
      final root = await Directory.systemTemp.createTemp(
        't07-observer02-close-',
      );
      final budget = WorkBudgetController();
      final repository = FileLocalRepository(root, budget: budget);
      late DraftScheduler scheduler;
      Future<SaveReceipt?>? closing;
      var notifications = 0;
      scheduler = DraftScheduler(
        repository,
        ManualClock(),
        budget: budget,
        onProblem: (_) {
          notifications++;
          if (notifications <= 8) closing ??= scheduler.close();
        },
      );
      scheduler.changed(
        ProjectBundle(
          Project.blank(id: 'close-refusal'),
          const {},
          budget: budget,
        ),
      );
      final pressure = AdmissionBudget.shared.reserve(
        AdmissionBudget.shared.capacityBytes -
            AdmissionBudget.shared.reservedBytes,
      );
      try {
        expect(await scheduler.checkpoint(), isNull);
        expect(await closing, isNull);
        expect(notifications, 1);
        expect(root.listSync(), isEmpty);
        expect(scheduler.hasPendingChanges, isFalse);
        expect(scheduler.close(), same(closing));
      } finally {
        pressure.release();
        await scheduler.close(checkpoint: false);
        await repository.close();
        await root.delete(recursive: true);
      }
      expect(budget.reservedBytes, 0);
    },
  );
}
