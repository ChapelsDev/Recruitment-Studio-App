import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/features/projects/project_list.dart';
import 'package:recruitment_studio/features/projects/project.dart';
import 'package:recruitment_studio/features/storage/local_repository.dart';
import 'package:recruitment_studio/shared/work_budget.dart';

void main() {
  test('F01 library starts empty duplicates with new identity removes only confirmed owned generations', () async {
    final root = await Directory.systemTemp.createTemp('f01-library-');
    final budget = WorkBudgetController();
    var repo = FileLocalRepository(Directory('${root.path}/private'), budget: budget);
    final library = ProjectListController(repo, budget: budget);
    try {
      expect(await library.refresh(), isEmpty);
      final session = library.create(id: 'human-project');
      session.setHeadline(AppLocale.ptPT, 'Manual test');
      final original = session.project.toManifest();
      expect((await repo.saveDraft(session.bundle)).status, SaveStatus.completed);
      final copy = await library.duplicate('human-project', newId: 'copy-project');
      expect(copy.project.id, 'copy-project');
      expect(copy.project.edition(AppLocale.ptPT).headline, 'Manual test');
      expect(session.project.toManifest(), original);
      copy.dispose();
      final external = await File('${root.path}/external.recruitproj').writeAsBytes([9, 8]);
      expect(await library.remove('human-project', confirmed: false), isFalse);
      expect((await library.refresh()).length, 2);
      expect(await library.remove('human-project', confirmed: true), isTrue);
      expect((await library.refresh()).single.id, 'copy-project');
      expect(await external.readAsBytes(), [9, 8]);
      await repo.close();
      repo = FileLocalRepository(Directory('${root.path}/private'), budget: budget);
      expect((await repo.listProjects()).single.id, 'copy-project');
      session.dispose();
    } finally {
      library.close();
      await repo.close();
      await root.delete(recursive: true);
    }
    expect(budget.reservedBytes, 0);
  });
}
