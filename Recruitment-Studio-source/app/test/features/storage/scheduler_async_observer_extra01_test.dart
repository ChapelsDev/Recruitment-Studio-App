import 'dart:async';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/features/projects/project.dart';
import 'package:recruitment_studio/features/projects/project_bundle.dart';
import 'package:recruitment_studio/features/storage/draft_scheduler.dart';
import 'package:recruitment_studio/features/storage/local_repository.dart';
import 'package:recruitment_studio/shared/admission_budget.dart';
import 'package:recruitment_studio/shared/problem.dart';
import 'package:recruitment_studio/shared/work_budget.dart';

import 'draft_scheduler_test.dart' show ManualClock, drain;

void main() {
  for (final timer in [false, true]) {
    test(
      'asynchronous capacity observer joins without replay timer=$timer',
      () async {
        final root = await Directory.systemTemp.createTemp(
          't07-async-extra01-',
        );
        final budget = WorkBudgetController();
        final repository = FileLocalRepository(root, budget: budget);
        final clock = ManualClock();
        final source = ProjectBundle(
          Project.blank(id: 'storm'),
          const {},
          budget: budget,
        );
        final problems = <Problem>[];
        final joins = <Future<SaveReceipt?>>[];
        late DraftScheduler scheduler;
        scheduler = DraftScheduler(
          repository,
          clock,
          budget: budget,
          onProblem: (problem) {
            problems.add(problem);
            // Test-only failure sentinel. No production retry bound is introduced.
            if (problems.length <= 8) {
              joins.add(scheduler.checkpoint());
            }
          },
        );
        scheduler.changed(source, sessionGeneration: 11);
        final paidBuffers = budget.reservedBytes;
        final pressure = AdmissionBudget.shared.reserve(
          AdmissionBudget.shared.capacityBytes -
              AdmissionBudget.shared.reservedBytes -
              8192,
        );
        final ordinary = AdmissionBudget.shared.reservedBytes;
        final tickets = AdmissionBudget.shared.ticketCount;
        Future<SaveReceipt?>? initial;
        try {
          if (timer) {
            clock.advance(const Duration(seconds: 2));
          } else {
            initial = scheduler.checkpoint();
            expect(await initial, isNull);
          }
          await drain();
          expect(
            problems,
            hasLength(1),
            reason: 'An observer join must not re-arm the same asynchronously refused snapshot',
          );
          expect(problems.single.code, ProblemCode.capacityExceeded);
          expect(joins, hasLength(1));
          if (initial != null) {
            expect(
              joins.single,
              same(initial),
              reason: 'The observer joins the real running future',
            );
          }
          expect(await joins.single, isNull);
          await drain();
          expect(problems, hasLength(1));
          expect(scheduler.hasPendingChanges, isTrue);
          expect(budget.reservedBytes, paidBuffers);
          expect(AdmissionBudget.shared.reservedBytes, ordinary);
          expect(AdmissionBudget.shared.ticketCount, tickets);
          expect(root.listSync(), isEmpty);
          pressure.release();
          final receipt = (await scheduler.checkpoint())!;
          expect(receipt.status, SaveStatus.completed);
          expect(receipt.projectId, 'storm');
          expect(receipt.sessionGeneration, 11);
          expect(scheduler.hasPendingChanges, isFalse);
          final recovered = (await repository.recoverDraft('storm'))!;
          expect(recovered.project.revision, source.project.revision);
          repository.releaseRecoveredDraft(recovered);
          expect(problems, hasLength(1));
        } finally {
          pressure.release();
          await scheduler.close(checkpoint: false);
          await repository.close();
          await root.delete(recursive: true);
        }
        expect(budget.reservedBytes, 0);
      },
    );

    test(
      'asynchronous observer preserves genuinely newer requested capture timer=$timer',
      () async {
        final root = await Directory.systemTemp.createTemp('t07-async-newer-');
        final budget = WorkBudgetController();
        final repository = FileLocalRepository(root, budget: budget);
        final clock = ManualClock();
        final source = ProjectBundle(
          Project.blank(id: 'storm'),
          const {},
          budget: budget,
        );
        final newer = ProjectBundle(
          source.project.withName('new manual edit'),
          const {},
          budget: budget,
        );
        final saved = Completer<SaveReceipt>();
        var notifications = 0;
        late AdmissionTicket pressure;
        late DraftScheduler scheduler;
        Future<SaveReceipt?>? observerJoin;
        scheduler = DraftScheduler(
          repository,
          clock,
          budget: budget,
          onReceipt: (receipt) {
            if (!saved.isCompleted) {
              saved.complete(receipt);
            }
          },
          onProblem: (_) {
            notifications++;
            if (notifications == 1) {
              pressure.release();
              scheduler.changed(newer, sessionGeneration: 12);
              observerJoin = scheduler.checkpoint();
            }
          },
        );
        scheduler.changed(source, sessionGeneration: 11);
        pressure = AdmissionBudget.shared.reserve(
          AdmissionBudget.shared.capacityBytes -
              AdmissionBudget.shared.reservedBytes -
              8192,
        );
        try {
          Future<SaveReceipt?>? initial;
          if (timer) {
            clock.advance(const Duration(seconds: 2));
          } else {
            initial = scheduler.checkpoint();
            expect(await initial, isNull);
          }
          final receipt = await saved.future.timeout(
            const Duration(seconds: 10),
          );
          expect(notifications, 1);
          expect(observerJoin, isNotNull);
          if (initial != null) {
            expect(observerJoin, same(initial));
          }
          expect(await observerJoin, isNull);
          expect(receipt.status, SaveStatus.completed);
          expect(receipt.projectId, 'storm');
          expect(receipt.sessionGeneration, 12);
          expect(receipt.revision, newer.project.revision);
          await scheduler.close(checkpoint: false);
          final recovered = (await repository.recoverDraft('storm'))!;
          expect(recovered.project.name, 'new manual edit');
          expect(recovered.project.revision, newer.project.revision);
          repository.releaseRecoveredDraft(recovered);
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
}
