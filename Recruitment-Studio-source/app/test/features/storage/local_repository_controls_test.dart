import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/features/projects/project.dart';
import 'package:recruitment_studio/features/projects/project_bundle.dart';
import 'package:recruitment_studio/features/storage/local_repository.dart';
import 'package:recruitment_studio/shared/work_budget.dart';
import 'package:recruitment_studio/shared/problem.dart';
import 'package:recruitment_studio/shared/admission_budget.dart';
import 'package:recruitment_studio/shared/operation.dart';

import '../../support/project_fixtures.dart';

class AdmissionFileStore extends FileStore {
  bool starve = false;
  AdmissionTicket? held;
  @override
  Future<String> hash(
    File file,
    int maximumBytes, {
    int start = 0,
    int? count,
    WorkOperation? operation,
  }) async {
    final result = await super.hash(
      file,
      maximumBytes,
      start: start,
      count: count,
      operation: operation,
    );
    if (starve && held == null) {
      held = AdmissionBudget.shared.reserve(
        AdmissionBudget.shared.capacityBytes -
            AdmissionBudget.shared.reservedBytes,
      );
    }
    return result;
  }
}

class CleanupFileStore extends FileStore {
  bool failCleanup = false;
  @override
  Future<void> removeOwned(File file, FileStat owned) async {
    if (failCleanup) {
      throw const FileSystemException('private cleanup fault', '/private');
    }
    await super.removeOwned(file, owned);
  }
}

void main() {
  late Directory root;
  late WorkBudgetController budget;
  late FileStore store;
  late FileLocalRepository repository;
  ProjectBundle blank(String name) =>
      ProjectBundle(Project.blank(id: 'p1').withName(name), const {});
  setUp(() async {
    root = await Directory.systemTemp.createTemp('t07-repository-controls-');
    budget = WorkBudgetController();
    store = FileStore();
    repository = FileLocalRepository(root, store: store, budget: budget);
  });
  tearDown(() async {
    await repository.close();
    await root.delete(recursive: true);
    expect(budget.reservedBytes, 0);
  });
  List<File> snapshots() =>
      root
          .listSync()
          .whereType<File>()
          .where((f) => f.path.endsWith('.recruitproj'))
          .toList()
        ..sort((a, b) => a.path.compareTo(b.path));
  test('pruning retains previous valid snapshot even when intervening generation is corrupt', () async {
    final first = blank('first');
    await repository.saveDraft(first);
    final second = first.withProject(first.project.withName('second'));
    await repository.saveDraft(second);
    await snapshots().last.writeAsBytes([1, 2, 3]);
    final third = second.withProject(second.project.withName('third'));
    await repository.saveDraft(third);
    await snapshots().last.writeAsBytes([1, 2, 3]);
    final recovered = await repository.recoverDraft('p1');
    expect(recovered, isNotNull);
    expect(recovered!.project.name, 'first');
    repository.releaseRecoveredDraft(recovered);
  });
  test('startup list reconciles structurally valid index whose latest package is corrupt', () async {
    final first = blank('first');
    await repository.saveDraft(first);
    await repository.saveDraft(
      first.withProject(first.project.withName('second')),
    );
    await repository.close();
    await snapshots().last.writeAsBytes([1, 2, 3]);
    repository = FileLocalRepository(root, store: store, budget: budget);
    expect((await repository.listProjects()).single.name, 'first');
  });
  test(
    'real resource package round trips without changing encoded bytes',
    () async {
      final b = await fixtureBundle();
      expect((await repository.saveDraft(b)).status, SaveStatus.completed);
      final recovered = await repository.recoverDraft(b.project.id);
      expect(recovered!.project.toManifest(), b.project.toManifest());
      expect(recovered.resources.values.single, b.resources.values.single);
      repository.releaseRecoveredDraft(recovered);
    },
  );
  test(
    'same-length snapshot corruption during index readback never confirms',
    () async {
      final first = blank('first');
      await repository.saveDraft(first);
      store.onPhase = (p) async {
        if (p == RepositoryPhase.readback) {
          final file = snapshots().last;
          final bytes = await file.readAsBytes();
          bytes[0] ^= 1;
          await file.writeAsBytes(bytes);
        }
      };
      expect(
        (await repository.saveDraft(
          first.withProject(first.project.withName('second')),
        )).status,
        SaveStatus.failed,
      );
      store.onPhase = null;
      final recovered = await repository.recoverDraft('p1');
      expect(recovered!.project.name, 'first');
      repository.releaseRecoveredDraft(recovered);
    },
  );
  test(
    'caller must explicitly release a paid recovery before requesting another',
    () async {
      await repository.saveDraft(blank('first'));
      final recovered = await repository.recoverDraft('p1');
      await expectLater(
        repository.recoverDraft('p1'),
        throwsA(isA<RepositoryException>()),
      );
      expect(recovered!.project.name, 'first');
      repository.releaseRecoveredDraft(recovered);
      final again = await repository.recoverDraft('p1');
      repository.releaseRecoveredDraft(again!);
    },
  );
  test(
    'linked private root is refused without creating data in its target',
    () async {
      await repository.close();
      final target = await Directory.systemTemp.createTemp(
        't07-repository-link-target-',
      );
      final link = Link('${root.path}/linked');
      await link.create(target.path);
      repository = FileLocalRepository(
        Directory(link.path),
        store: store,
        budget: budget,
      );
      expect(
        (await repository.saveDraft(blank('linked'))).status,
        SaveStatus.failed,
      );
      expect(target.listSync(), isEmpty);
      await target.delete(recursive: true);
    },
  );
  test('owned-buffer refusal has no IO and no leaked reservation', () async {
    await repository.close();
    budget = WorkBudgetController(capacityBytes: 0);
    repository = FileLocalRepository(root, store: store, budget: budget);
    final receipt = await repository.saveDraft(blank('no capacity'));
    expect(receipt.status, SaveStatus.failed);
    expect(receipt.problem!.code, ProblemCode.capacityExceeded);
    expect(root.listSync(), isEmpty);
  });
  test(
    'completed receipt is prepaid before final admission exhaustion',
    () async {
      await repository.close();
      final guard = AdmissionFileStore();
      repository = FileLocalRepository(root, store: guard, budget: budget);
      guard.onPhase = (p) async {
        if (p == RepositoryPhase.readback) guard.starve = true;
      };
      try {
        expect(
          (await repository.saveDraft(blank('prepaid'))).status,
          SaveStatus.completed,
        );
      } finally {
        guard.held?.release();
        guard.onPhase = null;
      }
    },
  );
  test(
    'cleanup failure cannot strand index buffer or parser credits',
    () async {
      await repository.close();
      final guard = CleanupFileStore();
      repository = FileLocalRepository(root, store: guard, budget: budget);
      await repository.saveDraft(blank('first'));
      guard.onPhase = (p) async {
        if (p == RepositoryPhase.readback) {
          guard.failCleanup = true;
          throw const FileSystemException('fault');
        }
      };
      final before = AdmissionBudget.shared.reservedBytes;
      expect(
        (await repository.saveDraft(blank('second'))).status,
        SaveStatus.failed,
      );
      expect(budget.reservedBytes, 0);
      expect(
        AdmissionBudget.shared.reservedBytes - before,
        lessThan(1024 * 1024),
      );
      guard.failCleanup = false;
      guard.onPhase = null;
    },
  );
  test('close refuses future saves with honest cancelled receipt', () async {
    await repository.close();
    expect(
      (await repository.saveDraft(blank('closed'))).status,
      SaveStatus.cancelled,
    );
    expect(root.listSync(), isEmpty);
  });
}
