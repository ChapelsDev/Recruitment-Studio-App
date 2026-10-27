import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/features/editor/editor_session.dart';
import 'package:recruitment_studio/features/projects/project.dart';
import 'package:recruitment_studio/features/projects/project_bundle.dart';
import 'package:recruitment_studio/shared/operation.dart';
import 'package:recruitment_studio/shared/problem.dart';
import 'package:recruitment_studio/shared/work_budget.dart';

ResourceEntry entry(String id, AssetKind kind, int value) {
  final bytes = Uint8List.fromList([value, value + 1, value + 2]);
  return ResourceEntry(
    ref: AssetRef(
      id: id,
      kind: kind,
      mediaType: MediaType.png,
      width: 1,
      height: 1,
      sha256: sha256.convert(bytes).toString(),
    ),
    bytes: bytes,
  );
}

typedef Headroom = ({
  int before,
  int withForeign,
  Object? fitError,
  Object? refusal,
  int after,
});

Object? errorOf(void Function() action) {
  try {
    action();
    return null;
  } catch (e) {
    return e;
  }
}

// Real immutable production objects, distinct controlled three-byte identities.
final class Scenario {
  Scenario(
    this.kind,
    int capacity, {
    bool sibling = true,
    bool orphan = false,
    bool observer = true,
  }) : budget = WorkBudgetController(capacityBytes: capacity) {
    final p = Project.blank(id: 'scenario');
    final project = sibling
        ? p.withPhoto(photo.ref).withLogo(logo.ref)
        : kind == AssetKind.photo
        ? p.withPhoto(photo.ref)
        : p.withLogo(logo.ref);
    base = ProjectBundle(
      project,
      {
        if (sibling || kind == AssetKind.photo) 'photo': photo.bytes,
        if (sibling || kind == AssetKind.logo) 'logo': logo.bytes,
        if (orphan) 'orphan': unused.bytes,
      },
      onResourceDigest: observer
          ? (_) {
              if (hook == null) return;
              callbacks++;
              hook!();
            }
          : null,
    );
    session = EditorSession.fromBundle(base, budget: budget);
    addTearDown(session.dispose);
    addTearDown(foreign.finish);
  }
  final AssetKind kind;
  final WorkBudgetController budget;
  final photo = entry('photo', AssetKind.photo, 1);
  final logo = entry('logo', AssetKind.logo, 10);
  late final unused = entry('orphan', kind, 20);
  late final incoming = entry(kind.name, kind, 30);
  final Operation foreign = Operation.create();
  late final ProjectBundle base;
  late final EditorSession session;
  void Function()? hook;
  int callbacks = 0;
  void submit(ResourceEntry e) {
    if (e.ref.kind == AssetKind.logo) {
      session.applyProfile(CompanyProfile(logo: e), []);
    } else {
      session.attachResource(e);
    }
  }

  Project get orphanTarget => kind == AssetKind.photo
      ? base.project.withPhoto(unused.ref)
      : base.project.withLogo(unused.ref);
  ({int before, int withForeign, Object? fitError, Object? refusal, int after})
  headroom(int fits, int tooLarge) {
    final before = budget.reservedBytes;
    WorkReservation? r;
    final fitError = errorOf(() => r = budget.reserve(foreign, fits));
    final withForeign = budget.reservedBytes;
    r?.release();
    r = null;
    final refusal = errorOf(() => r = budget.reserve(foreign, tooLarge));
    r?.release();
    return (
      before: before,
      withForeign: withForeign,
      fitError: fitError,
      refusal: refusal,
      after: budget.reservedBytes,
    );
  }
}

bool acknowledge(EditorSession s, CapturedSnapshot h) =>
    s.acknowledgeProjectSave(
      h,
      projectId: h.projectId,
      revision: h.revision,
      sessionGeneration: h.sessionGeneration,
      succeeded: true,
    );

void main() {
  test(
    'photo dispose retains incoming and referenced sibling until own finally',
    () async {
      final photo = entry('photo', AssetKind.photo, 1);
      final logo = entry('logo', AssetKind.logo, 10);
      final incoming = entry('photo', AssetKind.photo, 20);
      final budget = WorkBudgetController(capacityBytes: 9);
      final foreign = Operation.create();
      late EditorSession s;
      var armed = false;
      var callbacks = 0;
      int? during;
      bool? fits;
      Object? refusal;
      final base = ProjectBundle(
        Project.blank(id: 'ownership').withPhoto(photo.ref).withLogo(logo.ref),
        {'photo': photo.bytes, 'logo': logo.bytes},
        onResourceDigest: (_) {
          if (!armed) return;
          armed = false;
          callbacks++;
          s.dispose();
          during = budget.reservedBytes;
          final small = budget.reserve(foreign, 3);
          fits = budget.reservedBytes == 9;
          small.release();
          try {
            final large = budget.reserve(foreign, 6);
            large.release();
          } catch (e) {
            refusal = e;
          }
        },
      );
      s = EditorSession.fromBundle(base, budget: budget);
      addTearDown(s.dispose);
      addTearDown(foreign.finish);
      armed = true;
      expect(() => s.attachResource(incoming), throwsStateError);
      // Observer exceptions are swallowed by production; assert only out here.
      expect(callbacks, 1);
      expect(
        during,
        6,
        reason: 'incoming3 + cached sibling3 are still consumed',
      );
      expect(fits, isTrue);
      expect(refusal, isA<CapacityExceeded>());
      expect(budget.reservedBytes, 0);
      await foreign.finish();
    },
  );

  for (final kind in [AssetKind.photo, AssetKind.logo]) {
    for (final mode in ['null', 'passive', 'throw-only']) {
      test('$kind $mode observer publishes one resource transition', () {
        final f = Scenario(kind, 9, observer: mode != 'null');
        int? charge;
        f.hook = () {
          charge = f.budget.reservedBytes;
          if (mode == 'throw-only') throw StateError('controlled observer');
        };
        f.submit(f.incoming);
        expect(f.callbacks, mode == 'null' ? 0 : 1);
        expect(charge, mode == 'null' ? isNull : 9);
        expect(f.session.generation, 1);
        expect(f.session.undoCount, 1);
        expect(f.session.bundle.resources[kind.name], same(f.incoming.bytes));
        expect(f.budget.reservedBytes, 9);
        f.session.dispose();
        expect(f.budget.reservedBytes, 0);
      });
    }
    for (final mode in ['dispose', 'dispose-last-capture', 'identity']) {
      test(
        '$kind $mode leaves exact frame6 and legitimate foreign3 headroom',
        () {
          final f = Scenario(kind, 9);
          final h = mode == 'dispose-last-capture'
              ? f.session.captureSnapshot()
              : null;
          addTearDown(() => h?.release());
          bool? completed;
          LeaveAttempt? leave;
          Object? hookError;
          Headroom? observation;
          f.hook = () {
            f.hook = null;
            hookError = errorOf(() {
              if (mode == 'identity') {
                leave = f.session.beginLeaveAttempt();
                completed = leave!.complete(
                  discard: true,
                  saved: false,
                  transition: () {
                    f.session.replaceBundle(
                      ProjectBundle(Project.blank(id: 'inner-id'), const {}),
                    );
                  },
                );
                leave!.end();
              } else {
                f.session.dispose();
                h?.release();
              }
              observation = f.headroom(3, 6);
            });
          };
          expect(errorOf(() => f.submit(f.incoming)), isA<StateError>());
          expect(f.callbacks, 1);
          expect(hookError, isNull);
          final o = observation!;
          expect((o.before, o.withForeign, o.after), (6, 9, 6));
          expect(o.fitError, isNull);
          expect(o.refusal, isA<CapacityExceeded>());
          expect(f.budget.reservedBytes, 0);
          if (mode == 'identity') {
            expect(completed, isTrue);
            expect(f.session.project.id, 'inner-id');
            expect(f.session.undoCount, 0);
            expect(f.session.hasConfirmedProjectSave, isFalse);
            expect(f.session.hasUnsavedChanges, isFalse);
            expect(leave!.complete(discard: true, saved: false), isFalse);
            // Empty but alive ownership must not finish the operation.
            f.hook = null;
            f.submit(f.incoming);
            expect(
              f.session.bundle.resources[kind.name],
              same(f.incoming.bytes),
            );
            expect(f.budget.reservedBytes, 3);
            f.session.dispose();
            expect(f.budget.reservedBytes, 0);
          } else {
            expect(f.session.isDisposed, isTrue);
          }
        },
      );
    }
    for (final releaseInside in [false, true]) {
      test(
        '$kind disposed retained capture releaseInside=$releaseInside has independent lifetime',
        () {
          final f = Scenario(kind, 9);
          final h = f.session.captureSnapshot();
          addTearDown(h.release);
          final phases = <int>[];
          f.hook = () {
            f.hook = null;
            f.session.dispose();
            phases.add(f.budget.reservedBytes);
            if (releaseInside) {
              h.release();
              phases.add(f.budget.reservedBytes);
              h.release();
              phases.add(f.budget.reservedBytes);
            }
          };
          expect(errorOf(() => f.submit(f.incoming)), isA<StateError>());
          expect(f.callbacks, 1);
          expect(phases, releaseInside ? [9, 6, 6] : [9]);
          expect(f.budget.reservedBytes, releaseInside ? 0 : 6);
          if (!releaseInside) {
            expect(h.bundle, same(f.base));
            expect(
              h.bundle.resources['photo'],
              same(f.base.resources['photo']),
            );
            expect(h.bundle.resources['logo'], same(f.base.resources['logo']));
          }
          h.release();
          expect(f.budget.reservedBytes, 0);
          h.release();
          f.session.dispose();
          expect(f.budget.reservedBytes, 0);
          expect(() => h.bundle, throwsStateError);
        },
      );
    }
    for (final order in [
      'entry-replacement',
      'replacement-entry',
      'replacement-replacement',
      'entry-entry',
    ]) {
      test(
        '$kind $order disposal preserves each caller claim and identity union',
        () {
          final duplicate = order == 'replacement-replacement';
          final f = Scenario(
            kind,
            duplicate ? 9 : 12,
            orphan: order != 'entry-entry',
          );
          final inner = entry('inner', kind, 40);
          int? duringInner;
          int? afterInner;
          Object? innerError;
          Headroom? observation;
          f.hook = () {
            if (f.callbacks == 1) {
              innerError = errorOf(() {
                if (order.endsWith('replacement')) {
                  f.session.replaceProject(f.orphanTarget);
                } else {
                  f.submit(inner);
                }
              });
              afterInner = f.budget.reservedBytes;
              if (order.startsWith('entry')) observation = f.headroom(6, 9);
            } else if (f.callbacks == 2) {
              f.hook = null;
              f.session.dispose();
              duringInner = f.budget.reservedBytes;
            }
          };
          final outerError = errorOf(() {
            if (order.startsWith('replacement')) {
              f.session.replaceProject(f.orphanTarget);
            } else {
              f.submit(f.incoming);
            }
          });
          expect(
            f.callbacks,
            2,
            reason: 'finite two-level real digest callbacks',
          );
          expect(innerError, isA<StateError>());
          expect(outerError, isA<StateError>());
          expect(duringInner, duplicate || order == 'entry-entry' ? 9 : 12);
          expect(afterInner, order.startsWith('entry') ? 6 : 9);
          if (observation != null) {
            final o = observation!;
            expect((o.before, o.withForeign, o.after), (6, 12, 6));
            expect(o.fitError, isNull);
            expect(o.refusal, isA<CapacityExceeded>());
          }
          expect(f.budget.reservedBytes, 0);
        },
      );
    }
    test(
      '$kind single-resource inverse retires obsolete source after inner finally',
      () {
        final f = Scenario(kind, 9, sibling: false, orphan: true);
        final phases = <int>[];
        Object? innerError;
        Headroom? observation;
        f.hook = () {
          if (f.callbacks == 1) {
            innerError = errorOf(
              () => f.session.replaceProject(f.orphanTarget),
            );
            phases.add(f.budget.reservedBytes);
            observation = f.headroom(6, 9);
          } else if (f.callbacks == 2) {
            f.hook = null;
            f.session.dispose();
            phases.add(f.budget.reservedBytes);
          }
        };
        expect(errorOf(() => f.submit(f.incoming)), isA<StateError>());
        expect(innerError, isA<StateError>());
        expect(f.callbacks, 2);
        expect(phases, [9, 3]);
        final o = observation!;
        expect((o.before, o.withForeign, o.after), (3, 9, 3));
        expect(o.fitError, isNull);
        expect(o.refusal, isA<CapacityExceeded>());
        expect(f.budget.reservedBytes, 0);
      },
    );

    for (final producer in ['entry', 'replacement']) {
      for (final action in [
        'text',
        'resource',
        'replacement',
        'undo',
        'saved-inner',
        'capture-release',
        'ack-only',
        'noop',
      ]) {
        for (final throwsAfter in [false, true]) {
          test(
            '$kind $producer observer $action throwsAfter=$throwsAfter preserves admitted state',
            () {
              final f = Scenario(kind, 15, orphan: true);
              if (action == 'undo') f.session.setName('before-undo');
              final beforeBundle = f.session.bundle;
              final beforeGeneration = f.session.generation;
              final beforeUndo = f.session.undoCount;
              final h = f.session.captureSnapshot();
              addTearDown(h.release);
              expect(acknowledge(f.session, h), isTrue);
              final inner = entry('inner', kind, 40);
              ProjectBundle? admitted;
              int? innerGeneration;
              int? innerUndo;
              int? charge;
              bool? saved;
              bool? draft;
              Object? hookError;
              CapturedSnapshot? innerCapture;
              addTearDown(() => innerCapture?.release());
              f.hook = () {
                f.hook = null;
                hookError = errorOf(() {
                  switch (action) {
                    case 'text':
                      f.session.setName('accepted-inner');
                    case 'resource':
                      f.submit(inner);
                    case 'replacement':
                      f.session.replaceProject(
                        f.orphanTarget.withName('accepted-inner'),
                      );
                    case 'undo':
                      f.session.undo();
                    case 'saved-inner':
                      f.session.setName('accepted-saved');
                      innerCapture = f.session.captureSnapshot();
                      saved = acknowledge(f.session, innerCapture!);
                    case 'capture-release':
                      innerCapture = f.session.captureSnapshot();
                      innerCapture!.release();
                    case 'ack-only':
                      saved = acknowledge(f.session, h);
                      draft = f.session.acknowledgeDraft(
                        h,
                        projectId: h.projectId,
                        revision: h.revision,
                        sessionGeneration: h.sessionGeneration,
                        succeeded: true,
                      );
                    case 'noop':
                      f.session.setName(f.session.project.name);
                  }
                  admitted = f.session.bundle;
                  innerGeneration = f.session.generation;
                  innerUndo = f.session.undoCount;
                  charge = f.budget.reservedBytes;
                });
                if (throwsAfter) {
                  throw StateError('controlled observer after action');
                }
              };
              final outerError = errorOf(() {
                if (producer == 'entry') {
                  f.submit(f.incoming);
                } else {
                  f.session.replaceProject(f.orphanTarget);
                }
              });
              final changed = ![
                'ack-only',
                'noop',
                'capture-release',
              ].contains(action);
              expect(hookError, isNull);
              expect(f.callbacks, 1);
              expect(innerGeneration, beforeGeneration + (changed ? 1 : 0));
              expect(
                charge,
                (producer == 'entry' ? 12 : 9) + (action == 'resource' ? 3 : 0),
              );
              expect(h.bundle, same(beforeBundle));
              expect(h.projectSaveAcknowledged, isTrue);
              if (changed) {
                expect(outerError, isA<StateError>());
                expect(f.session.bundle, same(admitted));
                expect(f.session.generation, innerGeneration);
                expect(f.session.undoCount, innerUndo);
                expect(
                  innerUndo,
                  action == 'undo' ? beforeUndo - 1 : beforeUndo + 1,
                );
                if (action == 'text' || action == 'replacement') {
                  expect(f.session.project.name, 'accepted-inner');
                }
                if (action == 'resource') {
                  expect(
                    f.session.bundle.resources['inner'],
                    same(inner.bytes),
                  );
                }
                if (action == 'undo') expect(f.session.project.name, '');
                if (action == 'saved-inner') {
                  expect(saved, isTrue);
                  expect(f.session.hasUnsavedChanges, isFalse);
                  expect(innerCapture!.projectSaveAcknowledged, isTrue);
                  expect(f.session.isSnapshotCurrent(innerCapture!), isTrue);
                  expect(f.session.project.name, 'accepted-saved');
                }
              } else {
                expect(outerError, isNull);
                expect(f.session.generation, beforeGeneration + 1);
                expect(f.session.undoCount, beforeUndo + 1);
                expect(f.session.isSnapshotCurrent(h), isFalse);
                if (action == 'ack-only') {
                  expect(saved, isTrue);
                  expect(draft, isTrue);
                }
                if (action == 'capture-release') {
                  expect(innerCapture!.isReleased, isTrue);
                }
              }
              f.session.dispose();
              expect(
                f.budget.reservedBytes,
                9,
                reason:
                    'original explicit capture keeps full map including orphan',
              );
              h.release();
              expect(f.budget.reservedBytes, action == 'saved-inner' ? 9 : 0);
              innerCapture?.release();
              expect(f.budget.reservedBytes, 0);
            },
          );
        }
      }
    }

    test(
      '$kind full capacity refuses changed input before callback and later retries',
      () {
        final f = Scenario(kind, 9);
        final h = f.session.captureSnapshot();
        addTearDown(h.release);
        expect(acknowledge(f.session, h), isTrue);
        final occupied = f.budget.reserve(f.foreign, 3);
        addTearDown(occupied.release);
        f.hook = () {};
        expect(errorOf(() => f.submit(f.incoming)), isA<CapacityExceeded>());
        expect(f.callbacks, 0);
        expect(f.session.bundle, same(f.base));
        expect(f.session.generation, 0);
        expect(f.session.undoCount, 0);
        expect(f.session.isSnapshotCurrent(h), isTrue);
        expect(f.session.hasUnsavedChanges, isFalse);
        expect(f.budget.reservedBytes, 9);
        occupied.release();
        expect(f.budget.reservedBytes, 6);
        f.submit(f.incoming);
        expect(f.callbacks, 1);
        expect(f.session.generation, 1);
        expect(f.session.undoCount, 1);
        expect(f.session.bundle.resources[kind.name], same(f.incoming.bytes));
        f.session.dispose();
        expect(f.budget.reservedBytes, 6);
        h.release();
        expect(f.budget.reservedBytes, 0);
      },
    );
    test(
      '$kind refused peer admission never releases caller claims or blocks valid retry',
      () {
        final f = Scenario(kind, 12);
        final h = f.session.captureSnapshot();
        addTearDown(h.release);
        expect(acknowledge(f.session, h), isTrue);
        final inner = entry('inner', kind, 40);
        Object? refusal;
        Object? innerError;
        int? duringRefusal;
        int? afterRetry;
        ProjectBundle? admitted;
        bool? captureCurrent;
        f.hook = () {
          f.hook = null;
          final blocker = f.budget.reserve(f.foreign, 3);
          refusal = errorOf(() => f.submit(inner));
          duringRefusal = f.budget.reservedBytes;
          captureCurrent = f.session.isSnapshotCurrent(h);
          blocker.release();
          innerError = errorOf(() => f.submit(inner));
          admitted = f.session.bundle;
          afterRetry = f.budget.reservedBytes;
        };
        expect(errorOf(() => f.submit(f.incoming)), isA<StateError>());
        expect(f.callbacks, 1);
        expect(refusal, isA<CapacityExceeded>());
        expect(duringRefusal, 12);
        expect(captureCurrent, isTrue);
        expect(innerError, isNull);
        expect(afterRetry, 12);
        expect(f.session.bundle, same(admitted));
        expect(f.session.bundle.resources['inner'], same(inner.bytes));
        expect(f.session.generation, 1);
        expect(f.session.undoCount, 1);
        expect(f.budget.reservedBytes, 9);
        f.session.dispose();
        expect(f.budget.reservedBytes, 6);
        h.release();
        expect(f.budget.reservedBytes, 0);
      },
    );

    test(
      '$kind full persistent owner union survives disposal and independent capture retirement',
      () {
        final f = Scenario(kind, 18, orphan: true);
        final oldCapture = f.session.captureSnapshot();
        addTearDown(oldCapture.release);
        expect(acknowledge(f.session, oldCapture), isTrue);
        final first = entry('first', kind, 40);
        f.submit(first);
        final newCapture = f.session.captureSnapshot();
        addTearDown(newCapture.release);
        expect(acknowledge(f.session, newCapture), isTrue);
        f.submit(entry('second', kind, 50));
        expect(f.session.undoCount, 2);
        expect(f.budget.reservedBytes, 15);
        final phases = <int>[];
        Headroom? observation;
        f.hook = () {
          f.hook = null;
          phases.add(f.budget.reservedBytes);
          f.session.dispose();
          phases.add(f.budget.reservedBytes);
          oldCapture.release();
          phases.add(f.budget.reservedBytes);
          newCapture.release();
          phases.add(f.budget.reservedBytes);
          observation = f.headroom(12, 15);
        };
        expect(errorOf(() => f.submit(f.incoming)), isA<StateError>());
        expect(f.callbacks, 1);
        // Before disposal: current/history/confirmed/captures + entry frame.
        expect(phases, [18, 15, 9, 6]);
        final o = observation!;
        expect((o.before, o.withForeign, o.after), (6, 18, 6));
        expect(o.fitError, isNull);
        expect(o.refusal, isA<CapacityExceeded>());
        expect(f.budget.reservedBytes, 0);
      },
    );
    for (final sharedContent in [false, true]) {
      test(
        '$kind nested entry independent identities sharedContent=$sharedContent',
        () {
          final f = Scenario(kind, 12);
          final inner = entry(
            'inner',
            sharedContent
                ? kind
                : kind == AssetKind.photo
                ? AssetKind.logo
                : AssetKind.photo,
            30,
          );
          final phases = <int>[];
          Object? innerError;
          f.hook = () {
            if (f.callbacks == 1) {
              innerError = errorOf(() => f.submit(inner));
              phases.add(f.budget.reservedBytes);
            } else if (f.callbacks == 2) {
              f.hook = null;
              f.session.dispose();
              phases.add(f.budget.reservedBytes);
            }
          };
          expect(errorOf(() => f.submit(f.incoming)), isA<StateError>());
          expect(innerError, isA<StateError>());
          expect(f.callbacks, 2);
          expect(phases, sharedContent ? [9, 6] : [12, 6]);
          if (sharedContent) {
            expect(inner.bytes, orderedEquals(f.incoming.bytes));
            expect(inner.bytes, isNot(same(f.incoming.bytes)));
            expect(inner.ref.sha256, f.incoming.ref.sha256);
          }
          expect(f.budget.reservedBytes, 0);
        },
      );
    }
  }

  for (final equal in [false, true]) {
    for (final edit in [false, true]) {
      test(
        'occupied3 profile equal=$equal manualEdit=$edit keeps seven locales and no unused charge',
        () {
          final logo = entry('logo', AssetKind.logo, 10);
          final separate = entry('logo', AssetKind.logo, 10);
          final budget = WorkBudgetController(capacityBytes: 3);
          var project = Project.blank(id: 'manual').withLogo(logo.ref);
          for (final locale in AppLocale.values) {
            if (!project.localeOrder.contains(locale)) {
              project = project.withLocale(locale);
            }
            project = project.withContact(
              locale,
              'tel',
              'original-${locale.code}',
            );
          }
          var hashes = 0;
          final base = ProjectBundle(project, {
            'logo': logo.bytes,
          }, onResourceDigest: (_) => hashes++);
          final s = EditorSession.fromBundle(base, budget: budget);
          addTearDown(s.dispose);
          final h = s.captureSnapshot();
          addTearDown(h.release);
          expect(acknowledge(s, h), isTrue);
          hashes = 0;
          final profile = CompanyProfile(
            logo: equal ? separate : null,
            contacts: edit
                ? {'tel': 'manual-controlled', 'web': 'manual-web'}
                : const {},
            colours: edit ? {'ink': 7} : const {},
          );
          final selected = [AppLocale.ptPT, AppLocale.en];
          s.applyProfile(profile, selected);
          expect(s.project.localeOrder, AppLocale.values);
          expect(s.bundle.resources['logo'], same(base.resources['logo']));
          expect(separate.bytes, isNot(same(base.resources['logo'])));
          expect(hashes, 0);
          expect(budget.reservedBytes, 3);
          expect(s.generation, edit ? 1 : 0);
          expect(s.undoCount, edit ? 1 : 0);
          expect(s.hasConfirmedProjectSave, isTrue);
          expect(s.hasUnsavedChanges, edit);
          if (edit) {
            for (final locale in AppLocale.values) {
              expect(
                s.project.edition(locale).contacts['tel'],
                selected.contains(locale)
                    ? 'manual-controlled'
                    : 'original-${locale.code}',
              );
              expect(
                s.project.edition(locale).contacts['web'],
                selected.contains(locale) ? 'manual-web' : '',
              );
            }
            expect(s.project.style.ink, 7);
            s.undo();
            expect(
              s.project.toManifest()..remove('revision'),
              base.project.toManifest()..remove('revision'),
            );
            expect(s.undoCount, 0);
          } else {
            expect(s.bundle, same(base));
            expect(s.isSnapshotCurrent(h), isTrue);
          }
          final beforeInvalid = s.bundle;
          final generation = s.generation;
          expect(
            () => s.applyProfile(profile, [AppLocale.en, AppLocale.en]),
            throwsArgumentError,
          );
          expect(s.bundle, same(beforeInvalid));
          expect(s.generation, generation);
          final changed = CompanyProfile(
            logo: entry('changed', AssetKind.logo, 30),
          );
          expect(
            () => s.applyProfile(changed, []),
            throwsA(isA<CapacityExceeded>()),
          );
          expect(s.bundle, same(beforeInvalid));
          expect(s.generation, generation);
          expect(hashes, 0);
          expect(budget.reservedBytes, 3);
          s.dispose();
          expect(budget.reservedBytes, 3);
          h.release();
          expect(budget.reservedBytes, 0);
        },
      );
    }
  }
}
