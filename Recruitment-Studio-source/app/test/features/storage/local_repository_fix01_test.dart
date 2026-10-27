import 'dart:async';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/features/projects/project.dart';
import 'package:recruitment_studio/features/projects/project_bundle.dart';
import 'package:recruitment_studio/features/storage/local_repository.dart';
import 'package:recruitment_studio/shared/operation.dart';
import 'package:recruitment_studio/shared/admission_budget.dart';
import 'package:recruitment_studio/shared/work_budget.dart';

class ClosingStore extends FileStore {
  final entered = Completer<void>(), resume = Completer<void>();
  Future<void>? reentrant;
  FileLocalRepository? repository;
  bool fail = false;
  int closedHandles = 0;
  // New real-IO seams; not replacements for the actual handle finalization.
  @override
  Future<void> unlock(RandomAccessFile handle) async {
    reentrant = repository!.close();
    entered.complete();
    await resume.future;
    await handle.unlock();
    if (fail) throw const FileSystemException('unlock fault');
  }

  @override
  Future<void> closeLock(RandomAccessFile handle) async {
    await handle.close();
    closedHandles++;
    if (fail) throw const FileSystemException('close fault');
  }
}

class FinishingStore extends FileStore {
  final entered = Completer<void>(), resume = Completer<void>();
  @override
  Future<void> finishOwnedOperation(WorkOperation operation) async {
    entered.complete();
    await resume.future;
    await operation.finish();
  }
}

void main() {
  test('repository close joins owned save finalization after the serial IO tail', () async {
    final root = await Directory.systemTemp.createTemp('t07-fix01-save-drain-');
    final budget = WorkBudgetController();
    final store = FinishingStore();
    final repository = FileLocalRepository(root, budget: budget, store: store);
    final bundle = ProjectBundle(Project.blank(id: 'drain'), const {});
    final save = repository.saveDraft(bundle);
    var saveSettled = false;
    save.then((_) => saveSettled = true);
    try {
      // The new seam surrounds real WorkOperation.finish, not a synthetic save.
      for (
        var i = 0;
        i < 100 && !store.entered.isCompleted && !saveSettled;
        i++
      ) {
        await Future<void>.delayed(const Duration(milliseconds: 10));
      }
      expect(
        store.entered.isCompleted,
        isTrue,
        reason:
            'Own operation finalization must participate in repository close',
      );
      var closed = false;
      final close = repository.close().then((_) => closed = true);
      await Future<void>.delayed(const Duration(milliseconds: 20));
      expect(closed, isFalse);
      expect(saveSettled, isFalse);
      store.resume.complete();
      expect((await save).status, SaveStatus.completed);
      await close;
      expect(saveSettled, isTrue);
    } finally {
      if (!store.resume.isCompleted) store.resume.complete();
      await save;
      await repository.close();
      await root.delete(recursive: true);
    }
    expect(budget.reservedBytes, 0);
  });

  test('ordinary missing private descendants are created and usable', () async {
    final root = await Directory.systemTemp.createTemp('t07-fix01-create-');
    final budget = WorkBudgetController();
    final child = Directory('${root.path}/valid/missing/child');
    final repository = FileLocalRepository(child, budget: budget);
    try {
      expect(await repository.listProjects(), isEmpty);
      expect(child.existsSync(), isTrue);
      expect(File('${child.path}/t07.lock').existsSync(), isTrue);
    } finally {
      await repository.close();
      await root.delete(recursive: true);
    }
    expect(budget.reservedBytes, 0);
  });

  test(
    'missing descendants under linked ancestry are refused before mkdir',
    () async {
      final root = await Directory.systemTemp.createTemp('t07-fix01-ancestry-');
      final target = Directory('${root.path}/target')..createSync();
      final link = Link('${root.path}/link')..createSync(target.path);
      final budget = WorkBudgetController();
      final repository = FileLocalRepository(
        Directory('${link.path}/missing/child'),
        budget: budget,
      );
      try {
        await expectLater(
          repository.listProjects(),
          throwsA(isA<RepositoryException>()),
        );
        expect(
          target.listSync(),
          isEmpty,
          reason: 'Refused initialization must have no out-of-root mkdir',
        );
      } finally {
        await repository.close();
        await root.delete(recursive: true);
        expect(budget.reservedBytes, 0);
      }
    },
  );

  for (final fail in [false, true]) {
    test(
      'repeated close joins real cleanup and shared error fail=$fail',
      () async {
        final root = await Directory.systemTemp.createTemp('t07-fix01-close-');
        final budget = WorkBudgetController();
        final store = ClosingStore()..fail = fail;
        final repository = FileLocalRepository(
          root,
          store: store,
          budget: budget,
        );
        store.repository = repository;
        await repository.listProjects();
        final before = AdmissionBudget.shared.reservedBytes;
        final pressure = AdmissionBudget.shared.reserve(
          AdmissionBudget.shared.capacityBytes - before,
        );
        final first = repository.close();
        final second = repository.close();
        first.ignore();
        second.ignore();
        var secondSettled = false;
        second.then(
          (_) => secondSettled = true,
          onError: (Object _, StackTrace _) => secondSettled = true,
        );
        try {
          await Future<void>.delayed(Duration.zero);
          expect(
            identical(first, second),
            isTrue,
            reason: 'One close completion must be published before cleanup',
          );
          expect(store.entered.isCompleted, isTrue);
          expect(identical(first, store.reentrant), isTrue);
          expect(secondSettled, isFalse);
          expect(store.closedHandles, 0);
        } finally {
          if (!store.resume.isCompleted) store.resume.complete();
          if (fail && store.entered.isCompleted) {
            await expectLater(first, throwsA(isA<FileSystemException>()));
            await expectLater(second, throwsA(isA<FileSystemException>()));
            await expectLater(
              repository.close(),
              throwsA(isA<FileSystemException>()),
            );
          } else {
            await first;
            await second;
          }
          pressure.release();
          await root.delete(recursive: true);
        }
        expect(
          store.closedHandles,
          1,
          reason: 'Close attempted even after unlock error',
        );
        expect(AdmissionBudget.shared.reservedBytes, before - 2 * 1024 * 1024);
        expect(budget.reservedBytes, 0);
      },
    );
  }
}
