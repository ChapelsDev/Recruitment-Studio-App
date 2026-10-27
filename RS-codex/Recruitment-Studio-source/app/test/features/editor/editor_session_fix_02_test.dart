import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/features/editor/editor_session.dart';
import 'package:recruitment_studio/features/projects/project.dart';
import 'package:recruitment_studio/features/projects/project_bundle.dart';
import 'package:recruitment_studio/shared/problem.dart';
import 'package:recruitment_studio/shared/work_budget.dart';

ResourceEntry entry(int value, {AssetKind kind = AssetKind.logo, String? id}) {
  final bytes = Uint8List.fromList([value, value + 1, value + 2]);
  return ResourceEntry(
    ref: AssetRef(
      id: id ?? kind.name,
      kind: kind,
      mediaType: MediaType.png,
      width: 1,
      height: 1,
      sha256: sha256.convert(bytes).toString(),
    ),
    bytes: bytes,
  );
}

void acknowledge(EditorSession s, CapturedSnapshot h) {
  expect(
    s.acknowledgeProjectSave(
      h,
      projectId: h.projectId,
      revision: h.revision,
      sessionGeneration: h.sessionGeneration,
      succeeded: true,
    ),
    isTrue,
  );
}

void main() {
  group('closure and lifetime controls', () {
    for (final kind in [AssetKind.photo, AssetKind.logo]) {
      for (final dispose in [false, true]) {
        test(
          '$kind deduplicated same-source nested preparation dispose=$dispose',
          () {
            final old = entry(1, kind: kind, id: 'old');
            final orphan = entry(20, kind: kind, id: 'orphan');
            final budget = WorkBudgetController(capacityBytes: 6);
            late EditorSession s;
            var depth = 0;
            var armed = false;
            Object? nestedError;
            int? nestedCharge;
            int? outerCharge;
            ProjectBundle? admitted;
            final work = <int>[];
            late Project target;
            final base = ProjectBundle(
              kind == AssetKind.photo
                  ? Project.blank(id: 'nested').withPhoto(old.ref)
                  : Project.blank(id: 'nested').withLogo(old.ref),
              {'old': old.bytes, 'orphan': orphan.bytes},
              onResourceDigest: (n) {
                work.add(n);
                if (!armed) return;
                depth++;
                if (depth == 1) {
                  try {
                    s.replaceProject(target);
                  } catch (e) {
                    nestedError = e;
                  }
                  outerCharge = budget.reservedBytes;
                  if (!s.isDisposed) admitted = s.bundle;
                } else {
                  if (dispose) s.dispose();
                  nestedCharge = budget.reservedBytes;
                }
              },
            );
            s = EditorSession.fromBundle(base, budget: budget);
            addTearDown(s.dispose);
            target = kind == AssetKind.photo
                ? s.project.withPhoto(orphan.ref)
                : s.project.withLogo(orphan.ref);
            armed = true;
            expect(() => s.replaceProject(target), throwsStateError);
            expect(depth, 2);
            expect(work, [3, 3, 3]);
            expect(nestedCharge, 6);
            expect(outerCharge, 6);
            if (dispose) {
              expect(nestedError, isA<StateError>());
              expect(s.isDisposed, isTrue);
              expect(budget.reservedBytes, 0);
            } else {
              expect(nestedError, isNull);
              expect(s.bundle, same(admitted));
              expect(s.project.photo?.id ?? s.project.logo?.id, 'orphan');
              expect(s.generation, 1);
              expect(s.undoCount, 1);
              expect(
                s.bundle.resources['orphan'],
                same(base.resources['orphan']),
              );
              expect(budget.reservedBytes, 6);
              s.dispose();
              expect(budget.reservedBytes, 0);
            }
          },
        );
      }
      test(
        '$kind replacement nests entry preparation with actual distinct buffer headroom',
        () {
          final old = entry(1, kind: kind, id: 'old');
          final orphan = entry(20, kind: kind, id: 'orphan');
          final innerEntry = entry(30, kind: kind, id: 'inner');
          final budget = WorkBudgetController(capacityBytes: 9);
          late EditorSession s;
          var armed = false;
          ProjectBundle? admitted;
          int? during;
          final base = ProjectBundle(
            kind == AssetKind.photo
                ? Project.blank(id: 'entry').withPhoto(old.ref)
                : Project.blank(id: 'entry').withLogo(old.ref),
            {'old': old.bytes, 'orphan': orphan.bytes},
            onResourceDigest: (_) {
              if (!armed) return;
              armed = false;
              s.attachResource(innerEntry);
              admitted = s.bundle;
              during = budget.reservedBytes;
            },
          );
          s = EditorSession.fromBundle(base, budget: budget);
          addTearDown(s.dispose);
          final target = kind == AssetKind.photo
              ? s.project.withPhoto(orphan.ref)
              : s.project.withLogo(orphan.ref);
          armed = true;
          expect(() => s.replaceProject(target), throwsStateError);
          expect(s.bundle, same(admitted));
          expect(s.bundle.resources['inner'], same(innerEntry.bytes));
          expect(during, 9);
          expect(budget.reservedBytes, 9);
          expect(s.generation, 1);
          s.dispose();
          expect(budget.reservedBytes, 0);
        },
      );
      test(
        '$kind composed nested identity leaves source charged even after all capture/history removal',
        () {
          final old = entry(1, kind: kind, id: 'old');
          final orphan = entry(20, kind: kind, id: 'orphan');
          final budget = WorkBudgetController(capacityBytes: 6);
          late EditorSession s;
          var armed = false;
          bool? completed;
          int? during;
          final base = ProjectBundle(
            kind == AssetKind.photo
                ? Project.blank(id: 'identity').withPhoto(old.ref)
                : Project.blank(id: 'identity').withLogo(old.ref),
            {'old': old.bytes, 'orphan': orphan.bytes},
            onResourceDigest: (_) {
              if (!armed) return;
              armed = false;
              final attempt = s.beginLeaveAttempt()!;
              completed = attempt.complete(
                discard: true,
                saved: false,
                transition: () => s.replaceBundle(
                  ProjectBundle(Project.blank(id: 'new-identity'), const {}),
                ),
              );
              attempt.end();
              during = budget.reservedBytes;
            },
          );
          s = EditorSession.fromBundle(base, budget: budget);
          addTearDown(s.dispose);
          final target = kind == AssetKind.photo
              ? s.project.withPhoto(orphan.ref)
              : s.project.withLogo(orphan.ref);
          armed = true;
          expect(() => s.replaceProject(target), throwsStateError);
          expect(completed, isTrue);
          expect(
            during,
            6,
            reason: 'only outer preparation now owns old readonly buffers',
          );
          expect(s.project.id, 'new-identity');
          expect(s.generation, 1);
          expect(s.undoCount, 0);
          expect(s.hasConfirmedProjectSave, isFalse);
          expect(budget.reservedBytes, 0);
        },
      );
      test(
        '$kind missing and digest-mismatching replacement refs genuinely refuse atomically',
        () {
          final old = entry(1, kind: kind, id: 'old');
          final orphan = entry(20, kind: kind, id: 'orphan');
          final budget = WorkBudgetController(capacityBytes: 6);
          final work = <int>[];
          final base = ProjectBundle(
            kind == AssetKind.photo
                ? Project.blank(id: 'atomic').withPhoto(old.ref)
                : Project.blank(id: 'atomic').withLogo(old.ref),
            {'old': old.bytes, 'orphan': orphan.bytes},
            onResourceDigest: work.add,
          );
          final s = EditorSession.fromBundle(base, budget: budget);
          addTearDown(s.dispose);
          final h = s.captureSnapshot();
          addTearDown(h.release);
          acknowledge(s, h);
          for (final ref in [
            entry(20, kind: kind, id: 'missing').ref,
            entry(30, kind: kind, id: 'orphan').ref,
          ]) {
            final next = kind == AssetKind.photo
                ? s.project.withPhoto(ref)
                : s.project.withLogo(ref);
            expect(() => s.replaceProject(next), throwsArgumentError);
            expect(s.bundle, same(base));
            expect(s.generation, 0);
            expect(s.undoCount, 0);
            expect(s.hasUnsavedChanges, isFalse);
            expect(s.isSnapshotCurrent(h), isTrue);
            acknowledge(s, h);
            expect(budget.reservedBytes, 6);
          }
          expect(work, [3, 3]); // initial old plus attempted orphan digest only
        },
      );
    }
    test('equal logo uses full metadata not digest-only; invalid colours/text still refuse', () {
      final logo = entry(10);
      final different = ResourceEntry(
        ref: AssetRef(
          id: 'logo',
          kind: AssetKind.logo,
          mediaType: MediaType.png,
          width: 2,
          height: 1,
          sha256: logo.ref.sha256,
        ),
        bytes: logo.bytes,
      );
      final budget = WorkBudgetController(capacityBytes: 3);
      final s = EditorSession(
        Project.blank(id: 'metadata').withLogo(logo.ref),
        resources: {'logo': logo.bytes},
        budget: budget,
      );
      addTearDown(s.dispose);
      final before = s.bundle;
      expect(
        () => s.applyProfile(CompanyProfile(logo: different), []),
        throwsA(isA<CapacityExceeded>()),
      );
      expect(
        () => s.applyProfile(
          CompanyProfile(logo: logo, colours: {'ink': -1}),
          [],
        ),
        throwsArgumentError,
      );
      expect(
        () => s.applyProfile(
          CompanyProfile(logo: logo, contacts: {'tel': 'x' * 16001}),
          [],
        ),
        throwsA(isA<CapacityExceeded>()),
      );
      expect(s.bundle, same(before));
      expect(s.generation, 0);
      expect(budget.reservedBytes, 3);
    });
    test('equal logo manual style/contact never hashes already validated photo or logo', () {
      final photo = entry(1, kind: AssetKind.photo);
      final logo = entry(10);
      final work = <int>[];
      final base = ProjectBundle(
        Project.blank(id: 'work').withPhoto(photo.ref).withLogo(logo.ref),
        {'photo': photo.bytes, 'logo': logo.bytes},
        onResourceDigest: work.add,
      );
      final budget = WorkBudgetController(capacityBytes: 6);
      final s = EditorSession.fromBundle(base, budget: budget);
      addTearDown(s.dispose);
      s.applyProfile(
        CompanyProfile(
          logo: entry(10),
          contacts: {'tel': 'manual'},
          colours: {'accent': 9},
        ),
        [AppLocale.ptPT],
      );
      expect(s.bundle.resources['photo'], same(base.resources['photo']));
      expect(s.bundle.resources['logo'], same(base.resources['logo']));
      expect(s.generation, 1);
      expect(s.undoCount, 1);
      expect(work, [3, 3]);
      s.undo();
      final h = s.captureSnapshot();
      addTearDown(h.release);
      acknowledge(s, h);
      final before = s.bundle;
      final generation = s.generation;
      final revision = s.project.revision;
      s.replaceProject(s.project);
      s.replaceBundle(s.bundle);
      expect(s.bundle, same(before));
      expect(s.generation, generation);
      expect(s.project.revision, revision);
      expect(s.isSnapshotCurrent(h), isTrue);
      acknowledge(s, h);
      expect(work, [3, 3]);
      expect(budget.reservedBytes, 6);
    });
  });
  group('replacement orphan activation', () {
    for (final kind in [AssetKind.photo, AssetKind.logo]) {
      for (final nested in [
        'text',
        'text plus throw',
        'undo',
        'replacement',
        'resource activation',
      ]) {
        test('$kind preserves exact admitted $nested and explicitly aborts outer', () {
          final old = entry(1, kind: kind, id: 'old');
          final orphan = entry(20, kind: kind, id: 'orphan');
          final budget = WorkBudgetController(capacityBytes: 6);
          late EditorSession s;
          late ProjectBundle resourceCandidate;
          var armed = false;
          var callbacks = 0;
          ProjectBundle? inner;
          CapturedSnapshot? innerCapture;
          String? admittedText;
          int? innerGeneration;
          int? innerHistory;
          int? during;
          bool? acknowledged;
          final initial = ProjectBundle(
            kind == AssetKind.photo
                ? Project.blank(id: 'orphan').withPhoto(old.ref)
                : Project.blank(id: 'orphan').withLogo(old.ref),
            {'old': old.bytes, 'orphan': orphan.bytes},
            onResourceDigest: (_) {
              if (!armed) return;
              armed = false;
              callbacks++;
              switch (nested) {
                case 'text':
                case 'text plus throw':
                  s.setName('accepted-inner');
                  admittedText = s.project.name;
                case 'undo':
                  s.undo();
                case 'replacement':
                  s.replaceProject(s.project.withName('accepted-replacement'));
                case 'resource activation':
                  s.replaceBundle(resourceCandidate);
              }
              inner = s.bundle;
              innerGeneration = s.generation;
              innerHistory = s.undoCount;
              innerCapture = s.captureSnapshot();
              acknowledged = s.acknowledgeProjectSave(
                innerCapture!,
                projectId: innerCapture!.projectId,
                revision: innerCapture!.revision,
                sessionGeneration: innerCapture!.sessionGeneration,
                succeeded: true,
              );
              during = budget.reservedBytes;
              if (nested == 'text plus throw') {
                throw StateError('diagnostic after admission');
              }
            },
          );
          s = EditorSession.fromBundle(initial, budget: budget);
          addTearDown(s.dispose);
          // Prepare an independently validated same-storage resource candidate
          // before arming; direct replaceBundle's internal prune is cache-safe.
          resourceCandidate = initial.withProject(
            kind == AssetKind.photo
                ? initial.project.withPhoto(orphan.ref)
                : initial.project.withLogo(orphan.ref),
          );
          final h = s.captureSnapshot();
          addTearDown(h.release);
          acknowledge(s, h);
          if (nested == 'undo') s.setName('before undo');
          final target = kind == AssetKind.photo
              ? s.project.withPhoto(orphan.ref)
              : s.project.withLogo(orphan.ref);
          armed = true;
          expect(() => s.replaceProject(target), throwsStateError);
          expect(callbacks, 1);
          expect(s.bundle, same(inner));
          expect(s.generation, innerGeneration);
          expect(s.undoCount, innerHistory);
          expect(s.generation, nested == 'undo' ? 2 : 1);
          expect(s.undoCount, nested == 'undo' ? 0 : 1);
          if (admittedText != null) expect(s.project.name, admittedText);
          expect(acknowledged, isTrue);
          expect(s.hasConfirmedProjectSave, isTrue);
          expect(s.hasUnsavedChanges, isFalse);
          expect(s.isSnapshotCurrent(innerCapture!), isTrue);
          expect(innerCapture!.bundle, same(inner));
          expect(during, 6);
          expect(budget.reservedBytes, 6);
          expect(h.bundle, same(initial));
          expect(h.bundle.resources['old'], [1, 2, 3]);
          expect(h.bundle.resources['orphan'], [20, 21, 22]);
          expect(
            () => h.bundle.resources['orphan']![0] = 0,
            throwsUnsupportedError,
          );
          innerCapture!.release();
          s.dispose();
          expect(budget.reservedBytes, 6);
          h.release();
          expect(budget.reservedBytes, 0);
        });
      }
      for (final capture in [false, true]) {
        test(
          '$kind disposal capture=$capture holds source charge until replacement finally',
          () {
            final old = entry(1, kind: kind, id: 'old');
            final orphan = entry(20, kind: kind, id: 'orphan');
            final budget = WorkBudgetController(capacityBytes: 6);
            late EditorSession s;
            CapturedSnapshot? h;
            var armed = false;
            int? during;
            final b = ProjectBundle(
              kind == AssetKind.photo
                  ? Project.blank(id: 'dispose').withPhoto(old.ref)
                  : Project.blank(id: 'dispose').withLogo(old.ref),
              {'old': old.bytes, 'orphan': orphan.bytes},
              onResourceDigest: (_) {
                if (!armed) return;
                armed = false;
                s.dispose();
                h?.release();
                during = budget.reservedBytes;
              },
            );
            s = EditorSession.fromBundle(b, budget: budget);
            addTearDown(s.dispose);
            if (capture) {
              h = s.captureSnapshot();
              addTearDown(h.release);
            }
            final target = kind == AssetKind.photo
                ? s.project.withPhoto(orphan.ref)
                : s.project.withLogo(orphan.ref);
            armed = true;
            expect(() => s.replaceProject(target), throwsStateError);
            expect(
              during,
              6,
              reason: 'hash callback still retains both source buffers; no early operation finish',
            );
            expect(s.isDisposed, isTrue);
            expect(budget.reservedBytes, 0);
            expect(b.resources['old'], [1, 2, 3]);
            expect(b.resources['orphan'], [20, 21, 22]);
          },
        );
      }
      for (final observer in [
        'null',
        'passive',
        'throw only',
        'same-content no-op',
        'ack only',
      ]) {
        test(
          '$kind $observer control activates once and cached snapshots do no digest work',
          () {
            final old = entry(1, kind: kind, id: 'old');
            final orphan = entry(20, kind: kind, id: 'orphan');
            final budget = WorkBudgetController(capacityBytes: 6);
            late EditorSession s;
            late CapturedSnapshot h;
            var armed = false;
            var acknowledgments = 0;
            final work = <int>[];
            final b = ProjectBundle(
              kind == AssetKind.photo
                  ? Project.blank(id: 'controls').withPhoto(old.ref)
                  : Project.blank(id: 'controls').withLogo(old.ref),
              {'old': old.bytes, 'orphan': orphan.bytes},
              onResourceDigest: observer == 'null'
                  ? null
                  : (n) {
                      work.add(n);
                      if (!armed) return;
                      if (observer == 'throw only') {
                        throw StateError('diagnostic only');
                      }
                      if (observer == 'same-content no-op') {
                        s.replaceProject(s.project);
                        s.replaceBundle(s.bundle);
                        s.setName(s.project.name);
                      }
                      if (observer == 'ack only') {
                        if (s.acknowledgeProjectSave(
                          h,
                          projectId: h.projectId,
                          revision: h.revision,
                          sessionGeneration: h.sessionGeneration,
                          succeeded: true,
                        )) {
                          acknowledgments++;
                        }
                      }
                    },
            );
            s = EditorSession.fromBundle(b, budget: budget);
            addTearDown(s.dispose);
            h = s.captureSnapshot();
            addTearDown(h.release);
            final target = kind == AssetKind.photo
                ? s.project.withPhoto(orphan.ref)
                : s.project.withLogo(orphan.ref);
            armed = true;
            s.replaceProject(target);
            expect(s.generation, 1);
            expect(s.undoCount, 1);
            expect(s.bundle.resources['orphan'], same(b.resources['orphan']));
            expect(work, observer == 'null' ? isEmpty : [3, 3]);
            if (observer == 'ack only') expect(acknowledgments, 1);
            s.setName('cached text');
            s.undo();
            s.undo();
            expect(s.bundle.resources['old'], same(b.resources['old']));
            expect(work, observer == 'null' ? isEmpty : [3, 3]);
            expect(budget.reservedBytes, 6);
            s.dispose();
            h.release();
            expect(budget.reservedBytes, 0);
          },
        );
      }
    }
  });
  group('equal profile occupied budget', () {
    for (final input in ['original', 'separate equal']) {
      test(
        '$input logo true no-op preserves claims impact and exact ownership',
        () {
          final logo = entry(10);
          final equal = input == 'original' ? logo : entry(10);
          final budget = WorkBudgetController(capacityBytes: 3);
          final s = EditorSession(
            Project.blank(id: 'equal').withLogo(logo.ref).withSections([
              Section(
                id: 's',
                items: [SectionItem(id: 'i')],
              ),
            ]),
            resources: {'logo': logo.bytes},
            budget: budget,
          );
          addTearDown(s.dispose);
          final before = s.bundle;
          final owned = before.resources['logo'];
          expect(owned, isNot(same(equal.bytes)));
          final h = s.captureSnapshot();
          addTearDown(h.release);
          acknowledge(s, h);
          final impact = s.requestRemoveItem('s', 'i');
          final revision = s.project.revision;
          expect(
            () => s.applyProfile(CompanyProfile(logo: equal), []),
            returnsNormally,
          );
          expect(s.bundle, same(before));
          expect(s.bundle.resources['logo'], same(owned));
          expect(s.project.revision, revision);
          expect(s.generation, 0);
          expect(s.undoCount, 0);
          expect(s.hasUnsavedChanges, isFalse);
          expect(s.hasConfirmedProjectSave, isTrue);
          expect(s.isSnapshotCurrent(h), isTrue);
          acknowledge(s, h);
          expect(budget.reservedBytes, 3);
          // The no-op must not invalidate the already issued removal permit.
          s.confirmRemoveItem('s', 'i', impact: impact);
          expect(s.generation, 1);
          expect(s.undoCount, 1);
          s.dispose();
          expect(budget.reservedBytes, 3);
          h.release();
          expect(budget.reservedBytes, 0);
        },
      );
    }
    test('equal logo applies only manually selected contacts and style with one undo', () {
      final logo = entry(10);
      final budget = WorkBudgetController(capacityBytes: 3);
      final s = EditorSession(
        Project.blank(id: 'selected')
            .withLocale(AppLocale.en)
            .withLogo(logo.ref)
            .withContact(AppLocale.en, 'tel', 'unchanged-English'),
        resources: {'logo': logo.bytes},
        budget: budget,
      );
      addTearDown(s.dispose);
      final before = s.bundle;
      final h = s.captureSnapshot();
      addTearDown(h.release);
      acknowledge(s, h);
      expect(
        () => s.applyProfile(
          CompanyProfile(
            logo: entry(10),
            contacts: {'tel': 'manual-PT', 'web': 'manual-web'},
            colours: {'ink': 7},
          ),
          [AppLocale.ptPT],
        ),
        returnsNormally,
      );
      expect(s.bundle.resources['logo'], same(before.resources['logo']));
      expect(s.project.edition(AppLocale.ptPT).contacts, {
        'tel': 'manual-PT',
        'web': 'manual-web',
      });
      expect(s.project.edition(AppLocale.en).contacts, {
        'tel': 'unchanged-English',
        'web': '',
      });
      expect(s.project.style.ink, 7);
      expect(s.generation, 1);
      expect(s.undoCount, 1);
      expect(s.hasUnsavedChanges, isTrue);
      expect(budget.reservedBytes, 3);
      s.undo();
      expect(
        s.project.toManifest()..remove('revision'),
        before.project.toManifest()..remove('revision'),
      );
      expect(s.bundle.resources['logo'], same(before.resources['logo']));
      expect(s.hasUnsavedChanges, isFalse);
      expect(budget.reservedBytes, 3);
    });
    test('headroom equal-logo and equal attachment controls', () {
      final logo = entry(10);
      final budget = WorkBudgetController(capacityBytes: 6);
      final s = EditorSession(
        Project.blank(id: 'headroom').withLogo(logo.ref),
        resources: {'logo': logo.bytes},
        budget: budget,
      );
      addTearDown(s.dispose);
      final before = s.bundle;
      s.applyProfile(CompanyProfile(logo: entry(10)), []);
      s.attachResource(entry(10));
      expect(s.bundle, same(before));
      expect(budget.reservedBytes, 3);
    });
    test(
      'absent-logo contact control and genuinely changed logo atomic refusal',
      () {
        final logo = entry(10);
        final budget = WorkBudgetController(capacityBytes: 3);
        final s = EditorSession(
          Project.blank(id: 'changed').withLogo(logo.ref),
          resources: {'logo': logo.bytes},
          budget: budget,
        );
        addTearDown(s.dispose);
        s.applyProfile(CompanyProfile(contacts: {'tel': 'admitted'}), [
          AppLocale.ptPT,
        ]);
        final before = s.bundle;
        expect(
          () => s.applyProfile(CompanyProfile(logo: entry(20)), []),
          throwsA(isA<CapacityExceeded>()),
        );
        expect(s.bundle, same(before));
        expect(s.project.edition(AppLocale.ptPT).contacts['tel'], 'admitted');
        expect(s.generation, 1);
        expect(budget.reservedBytes, 3);
      },
    );
    test('equal-logo still validates unknown duplicate locales and contact cardinality', () {
      final logo = entry(10);
      final budget = WorkBudgetController(capacityBytes: 3);
      final s = EditorSession(
        Project.blank(id: 'invalid').withLogo(logo.ref),
        resources: {'logo': logo.bytes},
        budget: budget,
      );
      addTearDown(s.dispose);
      final before = s.bundle;
      expect(
        () => s.applyProfile(CompanyProfile(logo: logo), [AppLocale.en]),
        throwsArgumentError,
      );
      expect(
        () => s.applyProfile(CompanyProfile(logo: logo), [
          AppLocale.ptPT,
          AppLocale.ptPT,
        ]),
        throwsArgumentError,
      );
      s.setContact(AppLocale.ptPT, 'existing', '');
      final fullBefore = s.bundle;
      expect(
        () => s.applyProfile(
          CompanyProfile(
            logo: logo,
            contacts: {for (var i = 0; i < 8; i++) 'c$i': 'v'},
          ),
          [],
        ),
        throwsA(isA<CapacityExceeded>()),
      );
      expect(s.bundle, same(fullBefore));
      expect(before.resources['logo'], same(s.bundle.resources['logo']));
      expect(budget.reservedBytes, 3);
    });
  });
}
