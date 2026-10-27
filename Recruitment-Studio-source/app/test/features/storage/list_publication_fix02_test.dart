import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/features/projects/project.dart';
import 'package:recruitment_studio/features/projects/project_bundle.dart';
import 'package:recruitment_studio/features/storage/local_repository.dart';
import 'package:recruitment_studio/shared/admission_budget.dart';
import 'package:recruitment_studio/shared/problem.dart';
import 'package:recruitment_studio/shared/work_budget.dart';
import 'package:recruitment_studio/shared/work_limits.dart';

void main() {
  // _serial pays 4096 plus reserveCopy's ordinary 1024 before the list's 8192.
  // The authenticated static 12288 example actually refuses the list reserve;
  // 13312 reaches first-summary refusal in the real implementation.
  for (final scenario in [
    (headroom: 12288, rows: 1, consumed: 0),
    (headroom: 13312, rows: 1, consumed: 0),
    (
      headroom: 13312 + 2048 + 4 * 'first'.length,
      rows: 2,
      consumed: 2048 + 4 * 'first'.length,
    ),
  ]) {
    test(
      'unpublished list rollback rows=${scenario.rows} headroom=${scenario.headroom}',
      () async {
        final root = await Directory.systemTemp.createTemp('t07-list02-');
        final budget = WorkBudgetController();
        final repository = FileLocalRepository(root, budget: budget);
        try {
          for (var i = 0; i < scenario.rows; i++) {
            final receipt = await repository.saveDraft(
              ProjectBundle(
                Project.blank(id: 'list-$i')
                    .withName(i == 0 ? 'first' : 'second'),
                const {},
                budget: budget,
              ),
            );
            expect(receipt.status, SaveStatus.completed);
          }
          await Future<void>.delayed(Duration.zero);
          expect(budget.queuedCount, 0);
          expect(
            budget.capacityBytes - budget.reservedBytes,
            greaterThan(256 * 1024),
          );
          expect(
            AdmissionBudget.shared.ticketCount,
            lessThan(WorkLimits.admissionTickets - 8),
          );
          final pressure = AdmissionBudget.shared.reserve(
            AdmissionBudget.shared.capacityBytes -
                AdmissionBudget.shared.reservedBytes -
                scenario.headroom,
          );
          final beforeBytes = AdmissionBudget.shared.reservedBytes;
          final beforeTickets = AdmissionBudget.shared.ticketCount;
          final beforeScalars = RepositoryResultCustody.reservedBytes;
          expect(
            AdmissionBudget.shared.capacityBytes - beforeBytes,
            scenario.headroom,
          );
          try {
            await expectLater(
              repository.listProjects(),
              throwsA(
                isA<RepositoryException>().having(
                  (e) => e.problem.code,
                  'code',
                  ProblemCode.capacityExceeded,
                ),
              ),
            );
            expect(
              RepositoryResultCustody.reservedBytes - beforeScalars,
              scenario.consumed,
            );
            expect(
              AdmissionBudget.shared.reservedBytes - beforeBytes,
              scenario.consumed,
              reason: 'No unpublished 8192-byte collection may remain charged',
            );
            expect(
              AdmissionBudget.shared.ticketCount - beforeTickets,
              scenario.consumed == 0 ? 0 : 1,
            );
          } finally {
            pressure.release();
          }
          final successful = await repository.listProjects();
          expect(successful, hasLength(scenario.rows));
          expect(successful.first.name, 'first');
          await repository.close();
          expect(successful.first.id, 'list-0');
        } finally {
          await repository.close();
          await root.delete(recursive: true);
        }
        expect(budget.reservedBytes, 0);
      },
    );
  }

  test(
    'published list and independently escaped scalars stay paid through close',
    () async {
      final root = await Directory.systemTemp.createTemp('t07-list02-escape-');
      final budget = WorkBudgetController();
      final repository = FileLocalRepository(root, budget: budget);
      try {
        expect(
          (await repository.saveDraft(
            ProjectBundle(
              Project.blank(id: 'escape').withName('manual name'),
              const {},
              budget: budget,
            ),
          )).status,
          SaveStatus.completed,
        );
        final beforeBytes = AdmissionBudget.shared.reservedBytes;
        final beforeTickets = AdmissionBudget.shared.ticketCount;
        final beforeScalars = RepositoryResultCustody.reservedBytes;
        final list = await repository.listProjects();
        final name = list.single.name, id = list.single.id;
        final scalarPrice = 2048 + 4 * name.length;
        expect(
          AdmissionBudget.shared.reservedBytes - beforeBytes,
          8192 + scalarPrice,
        );
        expect(AdmissionBudget.shared.ticketCount - beforeTickets, 2);
        expect(
          RepositoryResultCustody.reservedBytes - beforeScalars,
          scalarPrice,
        );
        await repository.close();
        expect(
          RepositoryResultCustody.reservedBytes - beforeScalars,
          scalarPrice,
        );
        expect(list.single.name, same(name));
        expect(id, 'escape');
      } finally {
        await repository.close();
        await root.delete(recursive: true);
      }
      expect(budget.reservedBytes, 0);
    },
  );
}
