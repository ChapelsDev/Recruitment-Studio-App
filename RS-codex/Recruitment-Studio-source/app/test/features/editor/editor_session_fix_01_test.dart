import 'dart:convert';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/features/composition/export_format.dart';
import 'package:recruitment_studio/features/editor/editor_session.dart';
import 'package:recruitment_studio/features/projects/project.dart';
import 'package:recruitment_studio/features/projects/project_bundle.dart';
import 'package:recruitment_studio/shared/problem.dart';
import 'package:recruitment_studio/shared/work_budget.dart';
import 'package:recruitment_studio/shared/work_limits.dart';

ResourceEntry resource(int value, {AssetKind kind = AssetKind.photo}) {
  final bytes = Uint8List.fromList([value, value, value]);
  return ResourceEntry(
    ref: AssetRef(
      id: kind.name,
      kind: kind,
      mediaType: MediaType.png,
      width: 1,
      height: 1,
      sha256: sha256.convert(bytes).toString(),
    ),
    bytes: bytes,
  );
}

int manifestBytes(Project p) => utf8.encode(p.toManifestJson()).length;

Project boundary(
  int revision, {
  int slack = 0,
  AssetRef? photo,
  AssetRef? logo,
  bool crop = false,
}) {
  final p = ImmutableProject(
    id: 'boundary',
    revision: revision,
    photo: photo,
    logo: logo,
    cropByFormat: {
      if (crop)
        ExportFormat.square: NormalizedRect(
          left: 0,
          top: 0,
          width: 1,
          height: 1,
        ),
    },
    contactIds: ['tel'],
    editions: {
      AppLocale.ptPT: Edition(
        headline: 'h',
        location: 'l',
        contacts: {'tel': ''},
      ),
    },
    sections: List.generate(
      4,
      (s) => Section(
        id: 's$s',
        items: List.generate(
          8,
          (i) => SectionItem(
            id: 'i$i',
            textByLocale: {AppLocale.ptPT: 'x' * WorkLimits.fieldUtf16Units},
          ),
        ),
      ),
    ),
  );
  final gap = WorkLimits.manifestUtf8Bytes - manifestBytes(p) - slack;
  final m = p.toManifest()
    ..['name'] = '${'é' * (gap ~/ 2)}${gap.isOdd ? 'x' : ''}';
  final exact = Project.fromManifest(m);
  expect(manifestBytes(exact), WorkLimits.manifestUtf8Bytes - slack);
  return exact;
}

void confirm(EditorSession s, CapturedSnapshot h) {
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
  group('supplemental cleanup controls', () {
    for (final kind in [AssetKind.photo, AssetKind.logo]) {
      test(
        '$kind manifest refusal releases provisional bytes and keeps capture confirmation impact',
        () {
          final old = resource(1, kind: kind);
          final next = resource(2, kind: kind);
          final p = kind == AssetKind.photo
              ? boundary(8, photo: old.ref)
              : boundary(8, logo: old.ref);
          final budget = WorkBudgetController(capacityBytes: 30);
          final s = EditorSession(
            p,
            resources: {kind.name: old.bytes},
            budget: budget,
          );
          addTearDown(s.dispose);
          final before = s.bundle;
          final h = s.captureSnapshot();
          addTearDown(h.release);
          confirm(s, h);
          final impact = s.requestRemoveItem('s0', 'i0');
          final action = kind == AssetKind.photo
              ? () => s.attachResource(next)
              : () => s.applyProfile(CompanyProfile(logo: next), []);
          expect(action, throwsA(isA<CapacityExceeded>()));
          expect(s.bundle, same(before));
          expect(s.generation, 0);
          expect(s.undoCount, 0);
          expect(s.isSnapshotCurrent(h), isTrue);
          expect(s.hasUnsavedChanges, isFalse);
          expect(budget.reservedBytes, 3);
          expect(
            () => s.confirmRemoveItem('s0', 'i0', impact: impact),
            throwsA(isA<CapacityExceeded>()),
          );
          expect(s.bundle, same(before));
        },
      );
    }
    test('last capture release plus disposal during preparation retains only provisional until abort', () {
      final old = resource(1);
      final next = resource(2);
      final budget = WorkBudgetController(capacityBytes: 6);
      late EditorSession s;
      late CapturedSnapshot h;
      var armed = false;
      int? inside;
      final b = ProjectBundle(
        Project.blank(id: 'dispose').withPhoto(old.ref),
        {'photo': old.bytes},
        onResourceDigest: (_) {
          if (!armed) return;
          armed = false;
          h.release();
          s.dispose();
          inside = budget.reservedBytes;
        },
      );
      s = EditorSession.fromBundle(b, budget: budget);
      addTearDown(s.dispose);
      h = s.captureSnapshot();
      addTearDown(h.release);
      armed = true;
      expect(() => s.attachResource(next), throwsStateError);
      expect(inside, 3);
      expect(s.isDisposed, isTrue);
      expect(budget.reservedBytes, 0);
      expect(b.resources['photo'], [1, 1, 1]);
    });
    test('nested budget refusal cannot borrow preparing bytes and later retry recovers', () {
      final old = resource(1);
      final next = resource(2);
      final third = resource(3);
      final budget = WorkBudgetController(capacityBytes: 6);
      late EditorSession s;
      var armed = false;
      Object? nestedError;
      int? inside;
      final b = ProjectBundle(
        Project.blank(id: 'budget').withPhoto(old.ref),
        {'photo': old.bytes},
        onResourceDigest: (_) {
          if (!armed) return;
          armed = false;
          s.setName('retained-inner');
          try {
            s.attachResource(third);
          } catch (e) {
            nestedError = e;
          }
          inside = budget.reservedBytes;
        },
      );
      s = EditorSession.fromBundle(b, budget: budget);
      addTearDown(s.dispose);
      armed = true;
      expect(() => s.attachResource(next), throwsStateError);
      expect(nestedError, isA<CapacityExceeded>());
      expect(inside, 6);
      expect(s.project.name, 'retained-inner');
      expect(s.generation, 1);
      expect(budget.reservedBytes, 3);
      s.attachResource(next);
      expect(s.project.name, 'retained-inner');
      expect(s.bundle.resources['photo'], same(next.bytes));
      expect(budget.reservedBytes, 6);
    });
  });
  group('observer preparation fence', () {
    for (final kind in [AssetKind.photo, AssetKind.logo]) {
      for (final nested in [
        'text',
        'text then observer throws',
        'undo',
        'replacement',
        'dispose',
        'resource',
      ]) {
        test(
          '$kind preparation preserves admitted nested $nested and refuses stale outer',
          () {
            final oldEntry = resource(1, kind: kind);
            final nextEntry = resource(2, kind: kind);
            final innerEntry = resource(3, kind: kind);
            final budget = WorkBudgetController(capacityBytes: 30);
            late EditorSession s;
            var armed = false;
            ProjectBundle? inner;
            String? returnedText;
            int? observedReservation;
            CapturedSnapshot? innerCapture;
            final baseProject = ImmutableProject(
              id: 'observer',
              photo: kind == AssetKind.photo ? oldEntry.ref : null,
              logo: kind == AssetKind.logo ? oldEntry.ref : null,
            );
            final base = ProjectBundle(
              baseProject,
              {kind.name: oldEntry.bytes},
              onResourceDigest: (_) {
                if (!armed) return;
                armed = false;
                switch (nested) {
                  case 'text':
                  case 'text then observer throws':
                    s.setName('entered-during-hash');
                    returnedText = s.project.name;
                  case 'undo':
                    s.undo();
                  case 'replacement':
                    s.replaceProject(s.project.withName('nested-replacement'));
                  case 'dispose':
                    s.dispose();
                  case 'resource':
                    s.attachResource(innerEntry);
                }
                observedReservation = budget.reservedBytes;
                if (!s.isDisposed) {
                  inner = s.bundle;
                  innerCapture = s.captureSnapshot();
                  confirm(s, innerCapture!);
                }
                if (nested == 'text then observer throws') {
                  throw StateError('observer diagnostic');
                }
              },
            );
            s = EditorSession.fromBundle(base, budget: budget);
            addTearDown(s.dispose);
            final capture = s.captureSnapshot();
            addTearDown(capture.release);
            confirm(s, capture);
            if (nested == 'undo') s.setName('before-undo');
            final generation = s.generation;
            armed = true;
            final attempt = kind == AssetKind.photo
                ? () => s.attachResource(nextEntry)
                : () => s.applyProfile(
                    CompanyProfile(
                      logo: nextEntry,
                      contacts: {'tel': 'outer-only'},
                      colours: {'ink': 1},
                    ),
                    [AppLocale.ptPT],
                  );
            expect(attempt, throwsStateError);
            expect(armed, isFalse);
            expect(s.generation, generation + 1);
            expect(
              observedReservation,
              nested == 'resource' ? 9 : 6,
              reason: 'outer provisional buffer stays charged throughout nested publication/disposal',
            );
            expect(capture.bundle, same(base));
            expect(capture.bundle.resources[kind.name], [1, 1, 1]);
            if (s.isDisposed) {
              expect(budget.reservedBytes, 3);
            } else {
              expect(s.bundle, same(inner));
              expect(s.project.contactIds, isEmpty);
              expect(s.project.style.ink, base.project.style.ink);
              expect(s.hasConfirmedProjectSave, isTrue);
              expect(s.hasUnsavedChanges, isFalse);
              if (returnedText != null) expect(s.project.name, returnedText);
              expect(
                s.bundle.resources[kind.name],
                nested == 'resource'
                    ? same(innerEntry.bytes)
                    : same(base.resources[kind.name]),
              );
              expect(budget.reservedBytes, nested == 'resource' ? 6 : 3);
              innerCapture!.release();
            }
            s.dispose();
            expect(budget.reservedBytes, 3);
            capture.release();
            expect(budget.reservedBytes, 0);
          },
        );
      }
      for (final observer in ['null', 'passive', 'throws', 'no-op']) {
        test(
          '$kind $observer observer admits exactly one action and cached text does no hash work',
          () {
            final old = resource(1, kind: kind);
            final next = resource(2, kind: kind);
            late EditorSession s;
            var armed = false;
            final work = <int>[];
            final b = ProjectBundle(
              ImmutableProject(
                id: 'control',
                photo: kind == AssetKind.photo ? old.ref : null,
                logo: kind == AssetKind.logo ? old.ref : null,
              ),
              {kind.name: old.bytes},
              onResourceDigest: observer == 'null'
                  ? null
                  : (n) {
                      work.add(n);
                      if (!armed) return;
                      if (observer == 'throws') {
                        throw StateError('diagnostic only');
                      }
                      if (observer == 'no-op') s.setName('');
                    },
            );
            final budget = WorkBudgetController(capacityBytes: 30);
            s = EditorSession.fromBundle(b, budget: budget);
            addTearDown(s.dispose);
            armed = true;
            if (kind == AssetKind.photo) {
              s.attachResource(next);
            } else {
              s.applyProfile(CompanyProfile(logo: next), []);
            }
            expect(s.generation, 1);
            expect(s.undoCount, 1);
            expect(s.bundle.resources[kind.name], same(next.bytes));
            expect(budget.reservedBytes, 6);
            s.setName('text-only');
            expect(work, observer == 'null' ? isEmpty : [3, 3]);
            s.undo();
            s.undo();
            expect(s.bundle.resources[kind.name], same(b.resources[kind.name]));
            expect(budget.reservedBytes, 3);
            s.dispose();
            expect(budget.reservedBytes, 0);
          },
        );
      }
    }
  });
  group('boundary no-ops', () {
    for (final revision in [9, 99]) {
      for (final action in [
        'name',
        'headline',
        'location',
        'contact',
        'title',
        'item',
        'section move',
        'item move',
        'visibility',
        'locale',
        'scale',
        'crop',
        'resource',
        'profile',
        'replacement',
      ]) {
        test('revision $revision redundant $action preserves all state', () {
          final photo = resource(1);
          final logo = resource(2, kind: AssetKind.logo);
          final budget = WorkBudgetController(capacityBytes: 30);
          final initial = boundary(
            revision,
            photo: photo.ref,
            logo: logo.ref,
            crop: true,
          );
          final s = EditorSession(
            initial,
            resources: {'photo': photo.bytes, 'logo': logo.bytes},
            budget: budget,
          );
          addTearDown(s.dispose);
          final before = s.bundle;
          final h = s.captureSnapshot();
          addTearDown(h.release);
          confirm(s, h);
          final actions = <String, void Function()>{
            'name': () => s.setName(initial.name),
            'headline': () => s.setHeadline(AppLocale.ptPT, 'h'),
            'location': () => s.setLocation(AppLocale.ptPT, 'l'),
            'contact': () => s.setContact(AppLocale.ptPT, 'tel', ''),
            'title': () => s.setSectionTitle(AppLocale.ptPT, 's0', ''),
            'item': () => s.setItemText(
              AppLocale.ptPT,
              's0',
              'i0',
              'x' * WorkLimits.fieldUtf16Units,
            ),
            'section move': () => s.moveSection('s0', 0),
            'item move': () => s.moveItem('s0', 'i0', 0),
            'visibility': () => s.setSectionVisible('s0', true),
            'locale': () => s.addLocale(AppLocale.ptPT),
            'scale': () => s.setLogoScale(1),
            'crop': () => s.setCrop(
              ExportFormat.square,
              NormalizedRect(left: 0, top: 0, width: 1, height: 1),
            ),
            'resource': () => s.attachResource(photo),
            'profile': () => s.applyProfile(
              CompanyProfile(
                logo: logo,
                contacts: {'tel': ''},
                colours: {'ink': initial.style.ink},
              ),
              [AppLocale.ptPT],
            ),
            'replacement': () => s.replaceBundle(before),
          };
          actions[action]!();
          expect(s.bundle, same(before));
          expect(s.project.revision, revision);
          expect(s.generation, 0);
          expect(s.undoCount, 0);
          expect(s.hasUnsavedChanges, isFalse);
          expect(s.hasConfirmedProjectSave, isTrue);
          expect(s.isSnapshotCurrent(h), isTrue);
          confirm(s, h); // even epoch/confirmation claims remain usable
          expect(budget.reservedBytes, 6);
        });
      }
    }
    test('no-op guards still validate targets locales indices scale and structural empty contacts', () {
      final s = EditorSession(boundary(9));
      addTearDown(s.dispose);
      final before = s.bundle;
      for (final action in <void Function()>[
        () => s.setHeadline(AppLocale.en, ''),
        () => s.setLocation(AppLocale.en, ''),
        () => s.setContact(AppLocale.en, 'tel', ''),
        () => s.setContact(AppLocale.ptPT, '../invalid', ''),
        () => s.setSectionTitle(AppLocale.en, 's0', ''),
        () => s.setSectionTitle(AppLocale.ptPT, 'missing', ''),
        () => s.setItemText(AppLocale.ptPT, 's0', 'missing', ''),
        () => s.moveSection('s0', -1),
        () => s.moveItem('s0', 'i0', 8),
        () => s.setSectionVisible('missing', true),
        () => s.setLogoScale(double.nan),
        () => s.applyProfile(CompanyProfile(), [AppLocale.en]),
      ]) {
        expect(action, throwsArgumentError);
        expect(s.bundle, same(before));
      }
      expect(
        () => s.setContact(AppLocale.ptPT, 'new', ''),
        throwsA(isA<CapacityExceeded>()),
      );
      expect(s.bundle, same(before));
      final small = EditorSession(Project.blank(id: 'small'));
      addTearDown(small.dispose);
      small.setContact(AppLocale.ptPT, 'new', '');
      expect(small.project.contactIds, ['new']);
      expect(small.generation, 1);
      expect(small.undoCount, 1);
    });
  });
  group('reversal admission', () {
    for (final revision in [8, 9, 98, 99]) {
      test(
        'exact UTF8 revision $revision atomically refuses unusable reversal',
        () {
          final photo = resource(1);
          final budget = WorkBudgetController(capacityBytes: 30);
          final initial = boundary(revision, photo: photo.ref);
          final s = EditorSession(
            initial,
            resources: {'photo': photo.bytes},
            budget: budget,
          );
          addTearDown(s.dispose);
          final old = s.bundle;
          final capture = s.captureSnapshot();
          addTearDown(capture.release);
          confirm(s, capture);
          final impact = s.requestRemoveSection('s0');
          expect(() => s.setName('small'), throwsA(isA<CapacityExceeded>()));
          expect(s.bundle, same(old));
          expect(s.project.revision, revision);
          expect(s.generation, 0);
          expect(s.undoCount, 0);
          expect(s.hasUnsavedChanges, isFalse);
          expect(s.hasConfirmedProjectSave, isTrue);
          expect(s.isSnapshotCurrent(capture), isTrue);
          expect(capture.bundle, same(old));
          expect(budget.reservedBytes, 3);
          // A refused action must not consume the previously issued impact.
          expect(
            () => s.confirmRemoveSection('s0', impact: impact),
            throwsA(isA<CapacityExceeded>()),
          );
          expect(s.bundle, same(old));
          expect(s.generation, 0);
        },
      );
    }
    for (final revision in [7, 10, 100]) {
      test(
        'same width revision $revision admits exact reversal without resource work',
        () {
          final initial = boundary(revision);
          final s = EditorSession(initial);
          addTearDown(s.dispose);
          s.setName('small');
          expect(s.project.revision, revision + 1);
          expect(s.canUndo, isTrue);
          s.undo();
          expect(s.project.name, initial.name);
          expect(s.project.revision, revision + 2);
          expect(manifestBytes(s.project), WorkLimits.manifestUtf8Bytes);
          expect(s.hasUnsavedChanges, isFalse);
          expect(s.canUndo, isFalse);
        },
      );
    }
    test('older retained reversal shifts on another edit and forces atomic refusal', () {
      final initial = boundary(7);
      final s = EditorSession(initial);
      addTearDown(s.dispose);
      s.setName('first');
      final before = s.bundle;
      expect(() => s.setName('second'), throwsA(isA<CapacityExceeded>()));
      expect(s.bundle, same(before));
      expect(s.generation, 1);
      expect(s.undoCount, 1);
      s.undo();
      expect(s.project.name, initial.name);
      expect(s.project.revision, 9);
    });
    for (final revision in [7, 97]) {
      test(
        'one byte headroom supports repeated reversals crossing $revision digits',
        () {
          final initial = boundary(revision, slack: 1);
          final s = EditorSession(initial);
          addTearDown(s.dispose);
          s.setName('first');
          s.setName('second');
          s.setName('third');
          for (final name in ['second', 'first', initial.name]) {
            final previous = s.project.revision;
            s.undo();
            expect(s.project.name, name);
            expect(s.project.revision, previous + 1);
            expect(
              manifestBytes(s.project),
              lessThanOrEqualTo(WorkLimits.manifestUtf8Bytes),
            );
          }
          expect(s.hasUnsavedChanges, isFalse);
          expect(s.canUndo, isFalse);
        },
      );
    }
  });
}
