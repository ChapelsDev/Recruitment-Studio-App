import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/features/projects/project.dart';
import 'package:recruitment_studio/features/projects/project_bundle.dart';
import 'package:recruitment_studio/features/storage/draft_scheduler.dart';
import 'package:recruitment_studio/features/storage/local_repository.dart';
import 'package:recruitment_studio/features/storage/project_codec.dart';
import 'package:recruitment_studio/shared/admission_budget.dart';
import 'package:recruitment_studio/shared/operation.dart';
import 'package:recruitment_studio/shared/work_budget.dart';

import '../../support/project_fixtures.dart';
import 'draft_scheduler_test.dart' show ManualClock;

class IdentityStore extends FileStore {
  final encoded = <ProjectBundle>[];
  void Function()? onStarted;
  @override
  Future<void> encode(
    ZipProjectCodec codec,
    ProjectBundle bundle,
    File file,
    WorkOperation operation,
  ) {
    encoded.add(bundle);
    final result = super.encode(codec, bundle, file, operation);
    onStarted?.call();
    return result;
  }
}

Future<ProjectBundle> twoResources(WorkBudgetController budget) async {
  final photo = await fixtureBundle();
  final logo = await File('test/fixtures/assets/logo.png').readAsBytes();
  final header = ByteData.sublistView(logo);
  final ref = AssetRef(
    id: 'logo',
    kind: AssetKind.logo,
    mediaType: MediaType.png,
    width: header.getUint32(16),
    height: header.getUint32(20),
    sha256: sha256.convert(logo).toString(),
  );
  return photo.withResource(
    ResourceEntry(ref: ref, bytes: logo, budget: budget),
    project: photo.project.withLogo(ref),
  );
}

void main() {
  test('discard close cancels real queued media admission and drains every capture', () async {
    final root = await Directory.systemTemp.createTemp(
      't07-fix01-cancel-media-',
    );
    final budget = WorkBudgetController();
    final store = IdentityStore();
    final repository = FileLocalRepository(root, budget: budget, store: store);
    final receipts = <SaveReceipt>[];
    final scheduler = DraftScheduler(
      repository,
      ManualClock(),
      budget: budget,
      onReceipt: receipts.add,
    );
    final source = await fixtureBundle();
    final sourcePayment = budget.reserveCopy(
      source.resources.values.single.length,
    );
    final heavy = WorkOperation.create();
    final held = await budget.acquire(heavy, 0);
    final entered = Completer<void>();
    store.onStarted = entered.complete;
    try {
      scheduler.changed(source, sessionGeneration: 1);
      final save = scheduler.checkpoint();
      await entered.future;
      expect(budget.queuedCount, 1);
      final closed = scheduler.close(checkpoint: false);
      expect(identical(closed, scheduler.close(checkpoint: false)), isTrue);
      expect((await save)!.status, SaveStatus.cancelled);
      await closed;
      expect(budget.queuedCount, 0);
      expect(receipts, isEmpty);
      expect(
        root.listSync().whereType<File>().where(
          (f) => f.path.endsWith('.recruitproj'),
        ),
        isEmpty,
      );
    } finally {
      held.release();
      await heavy.finish();
      store.onStarted = null;
      store.encoded.clear();
      await scheduler.close(checkpoint: false);
      await repository.close();
      sourcePayment.release();
      await root.delete(recursive: true);
    }
    expect(budget.reservedBytes, 0);
  });

  for (final control in [
    'foreign-equal',
    'stale-metadata',
    'changed-corrupt',
    'mutable-alias',
  ]) {
    test(
      'resource admission control $control never inherits digest-only trust',
      () async {
        final root = await Directory.systemTemp.createTemp(
          't07-fix01-media-control-',
        );
        final budget = WorkBudgetController();
        final store = IdentityStore();
        final repository = FileLocalRepository(
          root,
          budget: budget,
          store: store,
        );
        final scheduler = DraftScheduler(
          repository,
          ManualClock(),
          budget: budget,
        );
        final raw = await File('test/fixtures/assets/photo.jpg').readAsBytes();
        final rawPayment = budget.reserveCopy(raw.length);
        final source = ProjectBundle(fixtureProject(), {
          'fixture-photo': raw,
        }, budget: budget);
        final sourcePayment = budget.reserveCopy(
          source.resources.values.single.length,
        );
        scheduler.changed(source, sessionGeneration: 1);
        expect((await scheduler.checkpoint())!.status, SaveStatus.completed);
        final previous = source.project.photo!;
        ProjectBundle candidate;
        if (control == 'foreign-equal') {
          candidate = ProjectBundle(
            source.project.withName('foreign same bytes'),
            source.resources,
            budget: budget,
          );
        } else if (control == 'stale-metadata') {
          candidate = source.withProject(
            source.project.withPhoto(
              AssetRef(
                id: previous.id,
                kind: previous.kind,
                mediaType: previous.mediaType,
                width: previous.width + 1,
                height: previous.height,
                sha256: previous.sha256,
              ),
            ),
          );
        } else if (control == 'changed-corrupt') {
          final changed = Uint8List.fromList([1, 2, 3]);
          final ref = AssetRef(
            id: previous.id,
            kind: previous.kind,
            mediaType: previous.mediaType,
            width: previous.width,
            height: previous.height,
            sha256: sha256.convert(changed).toString(),
          );
          candidate = ProjectBundle(source.project.withPhoto(ref), {
            ref.id: changed,
          }, budget: budget);
        } else {
          raw.fillRange(0, raw.length, 0);
          candidate = source.withProject(
            source.project.withName('caller mutable alias changed'),
          );
          expect(candidate.resources.values.single, isNot(raw));
        }
        final candidatePayment = budget.reserveCopy(
          candidate.resources.values.single.length,
        );
        final heavy = WorkOperation.create();
        final held = await budget.acquire(heavy, 0);
        Future<SaveReceipt?>? saving;
        try {
          final entered = Completer<void>();
          store.onStarted = entered.complete;
          scheduler.changed(candidate, sessionGeneration: 2);
          saving = scheduler.checkpoint();
          await entered.future;
          if (control == 'mutable-alias') {
            expect((await saving)!.status, SaveStatus.completed);
            expect(budget.queuedCount, 0);
          } else {
            expect(
              budget.queuedCount,
              1,
              reason: 'New identity or stale ref must enter the unchanged codec admission gate',
            );
            held.release();
            final receipt = (await saving)!;
            expect(
              receipt.status,
              control == 'foreign-equal'
                  ? SaveStatus.completed
                  : SaveStatus.failed,
            );
            expect(scheduler.hasPendingChanges, control != 'foreign-equal');
          }
        } finally {
          held.release();
          await heavy.finish();
          if (saving != null) await saving;
          store.onStarted = null;
          store.encoded.clear();
          await scheduler.close(checkpoint: false);
          await repository.close();
          sourcePayment.release();
          candidatePayment.release();
          rawPayment.release();
          await root.delete(recursive: true);
        }
        expect(budget.queuedCount, 0);
        expect(budget.reservedBytes, 0);
      },
    );
  }

  for (final scenario in [
    (scheduled: false, afterRecovery: false),
    (scheduled: true, afterRecovery: false),
    (scheduled: false, afterRecovery: true),
    (scheduled: true, afterRecovery: true),
  ]) {
    final scheduled = scenario.scheduled;
    test(
      'warm paid photo and logo save while heavy lane and worker are held scheduled=$scheduled afterRecovery=${scenario.afterRecovery}',
      () async {
        final root = await Directory.systemTemp.createTemp('t07-fix01-warm-');
        final budget = WorkBudgetController();
        final store = IdentityStore();
        final phases = <String>[];
        final repository = FileLocalRepository(
          root,
          budget: budget,
          store: store,
          onCodecPhase: phases.add,
        );
        final scheduler = DraftScheduler(
          repository,
          ManualClock(),
          budget: budget,
        );
        final source = await twoResources(budget);
        final sourcePayment = budget.reserveCopy(
          source.resources.values.fold<int>(0, (n, b) => n + b.length),
        );
        Future<SaveReceipt?> save(ProjectBundle b, int generation) {
          if (scheduled) {
            scheduler.changed(b, sessionGeneration: generation);
            return scheduler.checkpoint();
          }
          return repository
              .saveDraft(b)
              .then<SaveReceipt?>((receipt) => receipt);
        }

        try {
          expect((await save(source, 1))!.status, SaveStatus.completed);
          if (scenario.afterRecovery) {
            final recovered = (await repository.recoverDraft(
              source.project.id,
            ))!;
            expect(
              recovered.resources.keys,
              unorderedEquals(source.resources.keys),
            );
            repository.releaseRecoveredDraft(recovered);
          }
          expect(phases.where((p) => p == 'mediaAdmission'), hasLength(2));
          final coldMediaAdmissions = phases
              .where((p) => p == 'mediaAdmission')
              .length;
          final heavy = WorkOperation.create();
          final held = await budget.acquire(heavy, 0);
          final worker = WorkerAdmission.acquire();
          final next = source.withProject(
            source.project.withName('only text changed'),
          );
          final warm = save(next, 2);
          SaveReceipt? beforeRelease;
          try {
            beforeRelease = await warm.timeout(
              const Duration(seconds: 2),
              onTimeout: () => null,
            );
          } finally {
            worker.release();
            held.release();
            await heavy.finish();
            await warm;
          }
          expect(
            beforeRelease?.status,
            SaveStatus.completed,
            reason: 'Text-only save must not queue for another heavy lease/media worker',
          );
          expect(budget.queuedCount, 0);
          expect(
            phases.where((p) => p == 'mediaAdmission').length,
            coldMediaAdmissions,
            reason: 'Warm output must emit no further media admission',
          );
          for (final id in source.resources.keys) {
            expect(
              identical(
                store.encoded[0].resources[id],
                store.encoded[1].resources[id],
              ),
              isTrue,
              reason: 'Exact codec-authenticated identity must stay continuously paid',
            );
          }
        } finally {
          store.encoded.clear();
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
