import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/features/projects/project.dart';
import 'package:recruitment_studio/features/projects/project_bundle.dart';
import 'package:recruitment_studio/features/storage/local_repository.dart';
import 'package:recruitment_studio/shared/admission_budget.dart';
import 'package:recruitment_studio/shared/problem.dart';
import 'package:recruitment_studio/shared/work_budget.dart';

void main() {
  test('escaped receipt and summary scalars retain process-lifetime credit without GC timing', () async {
    final root = await Directory.systemTemp.createTemp('t07-fix01-scalars-');
    final budget = WorkBudgetController();
    final repository = FileLocalRepository(root, budget: budget);
    final baseline = RepositoryResultCustody.reservedBytes;
    final escaped = <String>[];
    try {
      final bundle = ProjectBundle(
        Project.blank(id: 'scalar-project').withName('scalar name'),
        const {},
      );
      SaveReceipt? receipt = await repository.saveDraft(bundle);
      expect(receipt.status, SaveStatus.completed);
      escaped.add(receipt.snapshotSha256!);
      escaped.add(receipt.projectId);
      expect(RepositoryResultCustody.reservedBytes - baseline, 2048);
      receipt = null;
      List<ProjectSummary>? summaries = await repository.listProjects();
      escaped.add(summaries.single.name);
      escaped.add(summaries.single.id);
      final resultCredit = RepositoryResultCustody.reservedBytes;
      expect(resultCredit - baseline, 2048 + 2048 + 4 * 'scalar name'.length);
      summaries = null;
      await repository.close();
      expect(
        RepositoryResultCustody.reservedBytes,
        resultCredit,
        reason: 'Wrapper/list/repository retirement must not refund escaped Strings',
      );
      expect(escaped, hasLength(4));
      final pressure = AdmissionBudget.shared.reserve(
        AdmissionBudget.shared.capacityBytes -
            AdmissionBudget.shared.reservedBytes,
      );
      try {
        expect(
          () => ProjectSummary(
            id: 'blocked',
            name: 'blocked',
            revision: 0,
            lastConfirmedSave: DateTime.utc(2026),
          ),
          throwsA(isA<CapacityExceeded>()),
        );
        expect(RepositoryResultCustody.reservedBytes, resultCredit);
      } finally {
        pressure.release();
      }
    } finally {
      await repository.close();
      await root.delete(recursive: true);
    }
    expect(budget.reservedBytes, 0);
  });

  test('SDK rejects String finalizer targets rather than authenticating scalar lifetime', () {
    final finalizer = Finalizer<void>((_) {});
    expect(() => finalizer.attach('escaped scalar', null), throwsArgumentError);
  });
}
