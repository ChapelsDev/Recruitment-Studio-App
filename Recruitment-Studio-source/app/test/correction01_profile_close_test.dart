import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/features/projects/project_profile.dart';
import 'package:recruitment_studio/features/storage/local_repository.dart';
import 'package:recruitment_studio/shared/admission_budget.dart';
import 'package:recruitment_studio/shared/work_budget.dart';

void main() {
  test(
    'D05 profile retirement needs no fresh ordinary admission at full budget',
    () async {
      final root = await Directory.systemTemp.createTemp('d05-close-');
      final budget = WorkBudgetController();
      final repository = FileLocalRepository(root, budget: budget);
      final profile = ProjectProfileController(repository, budget: budget);
      final ordinary = AdmissionBudget.shared;
      final full = ordinary.reserve(
        ordinary.capacityBytes - ordinary.reservedBytes,
      );
      try {
        expect(
          profile.close,
          returnsNormally,
          reason: 'A prepaid owner must retire at full admission',
        );
        expect(profile.close, returnsNormally);
      } finally {
        full.release();
        profile.close();
        await repository.close();
        await root.delete(recursive: true);
      }
    },
  );
}
