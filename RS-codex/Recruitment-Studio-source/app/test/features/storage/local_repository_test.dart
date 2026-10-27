import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/features/editor/editor_session.dart';
import 'package:recruitment_studio/features/projects/project.dart';
import 'package:recruitment_studio/features/projects/project_bundle.dart';
import 'package:recruitment_studio/features/storage/local_repository.dart';
import 'package:recruitment_studio/shared/operation.dart';
import 'package:recruitment_studio/shared/problem.dart';
import 'package:recruitment_studio/shared/work_budget.dart';

void main() {
  late Directory root;
  late FileStore store;
  late FileLocalRepository repository;
  late WorkBudgetController budget;
  ProjectBundle bundle([String text = '', String id = 'p1']) => ProjectBundle(
    Project.blank(id: id).withHeadline(AppLocale.ptPT, text),
    const {},
  );
  setUp(() async {
    root = await Directory.systemTemp.createTemp('t07-repository-');
    budget = WorkBudgetController();
    store = FileStore();
    repository = FileLocalRepository(root, store: store, budget: budget);
  });
  tearDown(() async {
    await repository.close();
    await root.delete(recursive: true);
    expect(budget.reservedBytes, 0);
  });
  test(
    'confirmed receipt binds reopened bytes and complete operation scope',
    () async {
      final b = bundle('');
      final op = WorkOperation.create(
        projectId: 'p1',
        revision: b.project.revision,
        sessionGeneration: 7,
      );
      final receipt = await repository.saveDraft(b, operation: op);
      expect(receipt.status, SaveStatus.completed);
      expect(receipt.projectId, 'p1');
      expect(receipt.revision, b.project.revision);
      expect(receipt.sessionGeneration, 7);
      final files = root.listSync().whereType<File>().where(
        (f) => f.path.endsWith('.recruitproj'),
      );
      expect(
        receipt.snapshotSha256,
        sha256.convert(await files.single.readAsBytes()).toString(),
      );
      expect(op.isFinishing, isFalse);
      await op.finish();
      final recovered = await repository.recoverDraft('p1');
      expect(recovered!.project.edition(AppLocale.ptPT).headline, '');
      repository.releaseRecoveredDraft(recovered);
      expect(
        (await repository.listProjects()).single.revision,
        receipt.revision,
      );
    },
  );
  for (final phase in RepositoryPhase.values) {
    test(
      'failure at ${phase.name} preserves previous valid snapshot',
      () async {
        final first = bundle('first');
        await repository.saveDraft(first);
        store.onPhase = (p) async {
          if (p == phase) {
            throw const FileSystemException(
              'private path must not escape',
              '/private/company',
              OSError('fault', 28),
            );
          }
        };
        final receipt = await repository.saveDraft(bundle('second'));
        expect(receipt.status, SaveStatus.failed);
        expect(receipt.problem, isNotNull);
        expect(receipt.toString(), isNot(contains('/private/company')));
        store.onPhase = null;
        final recovered = await repository.recoverDraft('p1');
        expect(recovered!.project.edition(AppLocale.ptPT).headline, 'first');
        repository.releaseRecoveredDraft(recovered);
      },
    );
  }
  test('cancel before promotion cannot publish; cancellation after commit reports reality', () async {
    await repository.saveDraft(bundle('first'));
    final b = bundle('second');
    final op = WorkOperation.create(
      projectId: 'p1',
      revision: b.project.revision,
      sessionGeneration: 2,
    );
    store.onPhase = (p) async {
      if (p == RepositoryPhase.promoteSnapshot) op.cancel();
    };
    expect(
      (await repository.saveDraft(b, operation: op)).status,
      SaveStatus.cancelled,
    );
    await op.finish();
    final later = WorkOperation.create(
      projectId: 'p1',
      revision: b.project.revision,
      sessionGeneration: 3,
    );
    store.onPhase = (p) async {
      if (p == RepositoryPhase.writeIndex) later.cancel();
    };
    expect(
      (await repository.saveDraft(b, operation: later)).status,
      SaveStatus.completed,
    );
    await later.finish();
  });
  test('scope mismatch is refused before any write', () async {
    final op = WorkOperation.create(
      projectId: 'other',
      revision: 999,
      sessionGeneration: 0,
    );
    expect(
      (await repository.saveDraft(bundle(), operation: op)).status,
      SaveStatus.failed,
    );
    expect(root.listSync(), isEmpty);
    await op.finish();
  });
  test(
    'writes are serial and equal revisions cannot roll a newer draft backwards',
    () async {
      var active = 0, peak = 0;
      store.onPhase = (p) async {
        if (p == RepositoryPhase.writeSnapshot) {
          active++;
          if (active > peak) peak = active;
          await Future<void>.delayed(const Duration(milliseconds: 5));
          active--;
        }
      };
      final b = bundle('older');
      final newer = b.withProject(b.project.withName('newer'));
      final receipts = await Future.wait([
        repository.saveDraft(newer),
        repository.saveDraft(b),
      ]);
      expect(peak, 1);
      expect(receipts.first.status, SaveStatus.completed);
      expect(receipts.last.status, SaveStatus.superseded);
      final recovered = await repository.recoverDraft('p1');
      expect(recovered!.project.name, 'newer');
      repository.releaseRecoveredDraft(recovered);
    },
  );
  for (final corruption in ['absent', 'corrupt']) {
    test('$corruption index is reconstructed from valid generations', () async {
      await repository.saveDraft(bundle('first'));
      final next = bundle('second')
          .withProject(bundle('second').project.withName('second'));
      await repository.saveDraft(next);
      await repository.close();
      final index = File('${root.path}/index.json');
      if (corruption == 'absent') {
        await index.delete();
      } else {
        await index.writeAsBytes([0, 255, 0]);
      }
      repository = FileLocalRepository(root, store: store, budget: budget);
      final recovered = await repository.recoverDraft('p1');
      expect(recovered!.project.edition(AppLocale.ptPT).headline, 'second');
      repository.releaseRecoveredDraft(recovered);
      expect((await repository.listProjects()).single.name, 'second');
      expect(await index.length(), greaterThan(3));
    });
  }
  test(
    'truncated newest snapshot falls back to previous valid generation',
    () async {
      await repository.saveDraft(bundle('first'));
      await repository.saveDraft(
        bundle('second')
            .withProject(bundle('second').project.withName('second')),
      );
      await repository.close();
      final files =
          root
              .listSync()
              .whereType<File>()
              .where((f) => f.path.endsWith('.recruitproj'))
              .toList()
            ..sort((a, b) => a.path.compareTo(b.path));
      await files.last.writeAsBytes([1, 2, 3]);
      repository = FileLocalRepository(root, store: store, budget: budget);
      final recovered = await repository.recoverDraft('p1');
      expect(recovered!.project.edition(AppLocale.ptPT).headline, 'first');
      repository.releaseRecoveredDraft(recovered);
    },
  );
  test(
    'startup cleanup removes only owned regular staging allowlist',
    () async {
      final owned = File('${root.path}/t07-tmp-${'a' * 32}.snapshot');
      final foreign = File('${root.path}/customer.tmp');
      final target = File('${root.path}/foreign.txt');
      await owned.writeAsBytes([1]);
      await foreign.writeAsBytes([2]);
      await target.writeAsBytes([3]);
      final link = Link('${root.path}/t07-tmp-${'b' * 32}.snapshot');
      await link.create(target.path);
      expect(await repository.listProjects(), isEmpty);
      expect(await owned.exists(), isFalse);
      expect(await foreign.readAsBytes(), [2]);
      expect(await target.readAsBytes(), [3]);
      expect(await link.exists(), isTrue);
    },
  );
  test(
    'recovery scanning refuses a population beyond its explicit bound',
    () async {
      for (
        var i = 0;
        i < FileLocalRepository.maximumDirectoryEntries + 1;
        i++
      ) {
        await File('${root.path}/foreign-$i').writeAsBytes([]);
      }
      await expectLater(
        repository.listProjects(),
        throwsA(isA<RepositoryException>()),
      );
    },
  );
  test(
    'profile is separate partial data and never retroactively edits a session',
    () async {
      final session = EditorSession(Project.blank(id: 'p1'), budget: budget);
      session.setHeadline(AppLocale.ptPT, 'manual');
      final revision = session.project.revision;
      final profile = CompanyProfile(
        colours: {'accent': 0xff112233},
        contacts: {'phone': ' +00 123 '},
      );
      await repository.saveDraft(session.bundle);
      await repository.saveProfile(profile);
      final loaded = await repository.loadProfile();
      expect(loaded!.colours, profile.colours);
      expect(loaded.contacts, profile.contacts);
      expect(loaded.logo, isNull);
      expect(session.project.revision, revision);
      expect(session.hasUnsavedChanges, isTrue);
      repository.releaseLoadedProfile(loaded);
      expect((await repository.listProjects()).map((p) => p.id), ['p1']);
      session.dispose();
    },
  );
  test('profile logo survives restart with explicit owned lifetime', () async {
    final bytes = await File('test/fixtures/assets/logo.png').readAsBytes();
    // The existing fixture generator uses a 240x120 PNG.
    final data = ByteData.sublistView(bytes);
    final ref = AssetRef(
      id: 'logo',
      kind: AssetKind.logo,
      mediaType: MediaType.png,
      width: data.getUint32(16),
      height: data.getUint32(20),
      sha256: sha256.convert(bytes).toString(),
    );
    final profile = CompanyProfile(
      logo: ResourceEntry(ref: ref, bytes: bytes, budget: budget),
    );
    await repository.saveProfile(profile);
    await repository.close();
    repository = FileLocalRepository(root, store: store, budget: budget);
    final loaded = await repository.loadProfile();
    expect(loaded!.logo!.bytes, bytes);
    expect(budget.reservedBytes, greaterThan(0));
    repository.releaseLoadedProfile(loaded);
  });
  test(
    'older generation is superseded even if its revision is numerically higher',
    () async {
      final current = bundle('current');
      final latest = WorkOperation.create(
        projectId: 'p1',
        revision: current.project.revision,
        sessionGeneration: 9,
      );
      await repository.saveDraft(current, operation: latest);
      await latest.finish();
      final stale = current.withProject(
        current.project.withName('stale').withName('staler'),
      );
      final old = WorkOperation.create(
        projectId: 'p1',
        revision: stale.project.revision,
        sessionGeneration: 8,
      );
      expect(
        (await repository.saveDraft(stale, operation: old)).status,
        SaveStatus.superseded,
      );
      await old.finish();
    },
  );
  test(
    'caller finish drains the whole repository transaction before retiring',
    () async {
      final entered = Completer<void>(), resume = Completer<void>();
      store.onPhase = (p) async {
        if (p == RepositoryPhase.writeSnapshot) {
          entered.complete();
          await resume.future;
        }
      };
      final b = bundle('pending');
      final op = WorkOperation.create(
        projectId: 'p1',
        revision: b.project.revision,
        sessionGeneration: 1,
      );
      final save = repository.saveDraft(b, operation: op);
      await entered.future;
      var finished = false;
      final finish = op.finish().then((_) => finished = true);
      await Future<void>.delayed(Duration.zero);
      final retiredEarly = finished;
      resume.complete();
      expect((await save).status, SaveStatus.cancelled);
      await finish;
      expect(retiredEarly, isFalse);
    },
  );
  test(
    'foreign index replacement at readback is not deleted during rollback',
    () async {
      await repository.saveDraft(bundle('first'));
      final foreign = <int>[4, 3, 2, 1];
      store.onPhase = (p) async {
        if (p == RepositoryPhase.readback) {
          await File('${root.path}/index.json').delete();
          await File('${root.path}/index.json').writeAsBytes(foreign);
        }
      };
      expect(
        (await repository.saveDraft(bundle('second'))).status,
        SaveStatus.failed,
      );
      expect(await File('${root.path}/index.json').readAsBytes(), foreign);
      store.onPhase = null;
    },
  );
  test(
    'foreign equal-content staging replacement is refused before promotion',
    () async {
      await repository.saveDraft(bundle('first'));
      final b = bundle('second');
      final op = WorkOperation.create(
        projectId: 'p1',
        revision: b.project.revision,
        sessionGeneration: 2,
      );
      final temp = File('${root.path}/t07-tmp-${op.id}.snapshot');
      store.onPhase = (p) async {
        if (p == RepositoryPhase.promoteSnapshot) {
          final bytes = await temp.readAsBytes();
          await temp.delete();
          await temp.writeAsBytes(bytes);
          await temp.setLastModified(DateTime.utc(2000));
        }
      };
      expect(
        (await repository.saveDraft(b, operation: op)).status,
        SaveStatus.failed,
      );
      expect(await temp.exists(), isTrue);
      store.onPhase = null;
      await op.finish();
      final recovered = await repository.recoverDraft('p1');
      expect(recovered!.project.edition(AppLocale.ptPT).headline, 'first');
      repository.releaseRecoveredDraft(recovered);
    },
  );
  test(
    'profile failure preserves previous profile and maps private diagnostics',
    () async {
      await repository.saveProfile(
        CompanyProfile(contacts: {'phone': 'first'}),
      );
      store.onPhase = (p) async {
        if (p == RepositoryPhase.flushIndex) {
          throw const FileSystemException(
            'secret',
            '/secret',
            OSError('denied', 13),
          );
        }
      };
      await expectLater(
        repository.saveProfile(CompanyProfile(contacts: {'phone': 'second'})),
        throwsA(
          isA<RepositoryException>().having(
            (e) => e.problem.code,
            'code',
            ProblemCode.permissionDenied,
          ),
        ),
      );
      store.onPhase = null;
      final loaded = await repository.loadProfile();
      expect(loaded!.contacts['phone'], 'first');
      repository.releaseLoadedProfile(loaded);
    },
  );
}
