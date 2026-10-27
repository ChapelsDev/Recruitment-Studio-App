import 'dart:convert';
import 'dart:typed_data';

import 'package:recruitment_studio/features/composition/export_format.dart';

import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/features/editor/editor_session.dart';
import 'package:recruitment_studio/features/projects/project.dart';
import 'package:recruitment_studio/features/projects/project_bundle.dart';

import 'package:recruitment_studio/shared/work_budget.dart';
import 'package:recruitment_studio/shared/operation.dart';
import 'package:recruitment_studio/shared/problem.dart';
import 'package:recruitment_studio/shared/work_limits.dart';

ResourceEntry entry(
  int value, {
  String id = 'photo',
  AssetKind kind = AssetKind.photo,
  int size = 3,
}) {
  final bytes = Uint8List.fromList(List.filled(size, value));
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

final class _ManifestProject implements Project {
  _ManifestProject(this.manifest);
  final Map<String, Object?> manifest;
  @override
  Map<String, Object?> toManifest() => manifest;
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  test('fromBundle partial reservation and malformed constructor rollback preserve source and input', () {
    final budget = WorkBudgetController(capacityBytes: 5);
    final photo = entry(1);
    final source = ProjectBundle(Project.blank(id: 'p').withPhoto(photo.ref), {
      'photo': photo.bytes,
      'extra': Uint8List(3),
    });
    expect(
      () => EditorSession.fromBundle(source, budget: budget),
      throwsA(isA<CapacityExceeded>()),
    );
    expect(budget.reservedBytes, 0);
    expect(source.resources['photo'], [1, 1, 1]);
    final input = Uint8List.fromList([2, 3]);
    final malformed = Project.blank(id: 'p').toManifest()
      ..['revision'] = 'wrong';
    expect(
      () => EditorSession(
        _ManifestProject(malformed),
        resources: {'extra': input},
        budget: budget,
      ),
      throwsFormatException,
    );
    expect(budget.reservedBytes, 0);
    expect(input, [2, 3]);
    final empty = EditorSession(Project.blank(id: 'p'), budget: budget);
    empty.dispose();
    expect(empty.isDisposed, isTrue);
  });
  test('all partial colours are explicit and profile resource budget refusal is atomic', () {
    final budget = WorkBudgetController(capacityBytes: 5);
    final s = EditorSession(Project.blank(id: 'p'), budget: budget);
    addTearDown(s.dispose);
    s.attachResource(entry(1));
    final before = s.bundle;
    final gen = s.generation;
    expect(
      () => s.applyProfile(
        CompanyProfile(
          logo: entry(2, id: 'logo', kind: AssetKind.logo),
          colours: {'ink': 1, 'paper': 2},
          contacts: {'tel': 'Literal'},
        ),
        [AppLocale.ptPT],
      ),
      throwsA(isA<CapacityExceeded>()),
    );
    expect(s.bundle, same(before));
    expect(s.generation, gen);
    expect(budget.reservedBytes, 3);
    s.applyProfile(CompanyProfile(colours: {'ink': 1, 'paper': 2}), []);
    expect(s.project.style.ink, 1);
    expect(s.project.style.paper, 2);
    expect(s.project.style.accent, before.project.style.accent);
    s.undo();
    expect(s.project.style.ink, before.project.style.ink);
  });
  test('disposed sessions expose no managed bundle and reject removal requests while handles retain only declared bytes', () {
    final budget = WorkBudgetController(capacityBytes: 30);
    final s = EditorSession(Project.blank(id: 'p'), budget: budget);
    s.addSection('s');
    s.addItem('s', 'i');
    s.attachResource(entry(1));
    final h = s.captureSnapshot();
    s.dispose();
    expect(() => s.bundle, throwsStateError);
    expect(() => s.project, throwsStateError);
    expect(() => s.requestRemoveSection('s'), throwsStateError);
    expect(() => s.requestRemoveItem('s', 'i'), throwsStateError);
    expect(() => s.requestRemoveLocale(AppLocale.ptPT), throwsStateError);
    expect(budget.reservedBytes, 3);
    h.release();
    expect(budget.reservedBytes, 0);
  });
  test('map-only attach prunes sixteen admitted keys without package entry overflow and preserves old snapshot', () {
    final photo = entry(1);
    final budget = WorkBudgetController(capacityBytes: 100);
    final b = ProjectBundle(Project.blank(id: 'p').withPhoto(photo.ref), {
      'photo': photo.bytes,
      for (var i = 0; i < 15; i++) 'extra$i': Uint8List.fromList([i]),
    });
    final s = EditorSession.fromBundle(b, budget: budget);
    s.attachResource(entry(2, id: 'new'));
    expect(s.bundle.resources.keys, ['new']);
    expect(b.resources.length, 16);
    s.undo();
    expect(s.bundle.resources['photo'], same(b.resources['photo']));
    expect(s.bundle.resources.length, 16);
    s.dispose();
    expect(budget.reservedBytes, 0);
  });
  test('trusted project-save acknowledgement is actual snapshot bound while drafts never clear dirty', () {
    final s = EditorSession(Project.blank(id: 'p'));
    addTearDown(s.dispose);
    expect(s.hasConfirmedProjectSave, isFalse);
    s.setName('A');
    final a = s.captureSnapshot();
    expect(
      s.acknowledgeDraft(
        a,
        projectId: a.projectId,
        revision: a.revision,
        sessionGeneration: a.sessionGeneration,
        succeeded: true,
      ),
      isTrue,
    );
    expect(s.hasUnsavedChanges, isTrue);
    expect(s.hasConfirmedProjectSave, isFalse);
    for (final claims in [
      ('foreign', a.revision, a.sessionGeneration),
      (a.projectId, a.revision + 1, a.sessionGeneration),
      (a.projectId, a.revision, a.sessionGeneration + 1),
    ]) {
      expect(
        s.acknowledgeProjectSave(
          a,
          projectId: claims.$1,
          revision: claims.$2,
          sessionGeneration: claims.$3,
          succeeded: true,
        ),
        isFalse,
      );
    }
    expect(
      s.acknowledgeProjectSave(
        a,
        projectId: a.projectId,
        revision: a.revision,
        sessionGeneration: a.sessionGeneration,
        succeeded: false,
      ),
      isFalse,
    );
    s.setName('B');
    expect(
      s.acknowledgeProjectSave(
        a,
        projectId: a.projectId,
        revision: a.revision,
        sessionGeneration: a.sessionGeneration,
        succeeded: true,
      ),
      isTrue,
    );
    expect(s.hasUnsavedChanges, isTrue);
    expect(s.hasConfirmedProjectSave, isTrue);
    s.undo();
    expect(s.project.name, 'A');
    expect(s.hasUnsavedChanges, isFalse);
    final now = s.captureSnapshot();
    expect(
      s.acknowledgeProjectSave(
        now,
        projectId: now.projectId,
        revision: now.revision,
        sessionGeneration: now.sessionGeneration,
        succeeded: true,
      ),
      isTrue,
    );
    expect(
      s.acknowledgeProjectSave(
        a,
        projectId: a.projectId,
        revision: a.revision,
        sessionGeneration: a.sessionGeneration,
        succeeded: true,
      ),
      isFalse,
    );
    a.release();
    now.release();
    s.dispose();
  });
  test('foreign released replacement and undo snapshot claims cannot forge confirmed saves', () {
    final s = EditorSession(Project.blank(id: 'p'));
    addTearDown(s.dispose);
    final other = EditorSession(Project.blank(id: 'p'));
    s.setName('original');
    other.setName('other');
    final foreign = other.captureSnapshot();
    expect(
      s.acknowledgeProjectSave(
        foreign,
        projectId: foreign.projectId,
        revision: foreign.revision,
        sessionGeneration: foreign.sessionGeneration,
        succeeded: true,
      ),
      isFalse,
    );
    final old = s.captureSnapshot();
    s.addSection('s');
    final removal = s.requestRemoveSection('s');
    s.replaceProject(s.project.withName('replacement'));
    expect(s.project.name, 'replacement');
    expect(s.hasUnsavedChanges, isTrue);
    expect(
      () => s.confirmRemoveSection('s', impact: removal),
      throwsStateError,
    );
    expect(
      s.acknowledgeProjectSave(
        old,
        projectId: old.projectId,
        revision: old.revision,
        sessionGeneration: old.sessionGeneration,
        succeeded: true,
      ),
      isFalse,
    );
    s.undo();
    expect(s.project.name, 'original');
    expect(
      s.acknowledgeProjectSave(
        old,
        projectId: old.projectId,
        revision: old.revision,
        sessionGeneration: old.sessionGeneration,
        succeeded: true,
      ),
      isFalse,
    );
    final released = s.captureSnapshot();
    released.release();
    expect(
      s.acknowledgeDraft(
        released,
        projectId: released.projectId,
        revision: released.revision,
        sessionGeneration: released.sessionGeneration,
        succeeded: true,
      ),
      isFalse,
    );
    expect(
      () => s.replaceProject(Project.blank(id: 'different')),
      throwsStateError,
    );
    old.release();
    foreign.release();
    other.dispose();
    s.dispose();
  });
  test('replacement validates complete bundle preserves inputs on failure and budgets confirmed baseline', () {
    final budget = WorkBudgetController(capacityBytes: 20);
    final s = EditorSession(
      Project.blank(id: 'p'),
      budget: budget,
      historyLimit: 1,
    );
    s.attachResource(entry(1));
    final saved = s.captureSnapshot();
    expect(
      s.acknowledgeProjectSave(
        saved,
        projectId: saved.projectId,
        revision: saved.revision,
        sessionGeneration: saved.sessionGeneration,
        succeeded: true,
      ),
      isTrue,
    );
    saved.release();
    s.attachResource(entry(2));
    s.attachResource(entry(3));
    expect(budget.reservedBytes, 9);
    final before = s.bundle;
    expect(
      () => s.replaceProject(
        Project.blank(id: 'p').withPhoto(entry(4, id: 'missing').ref),
      ),
      throwsArgumentError,
    );
    expect(s.bundle, same(before));
    expect(budget.reservedBytes, 9);
    final replacement = ProjectBundle(
      Project.blank(id: 'p').withPhoto(entry(4).ref),
      {'photo': entry(4).bytes},
    );
    s.replaceBundle(replacement);
    expect(s.bundle.resources['photo'], same(replacement.resources['photo']));
    expect(s.hasUnsavedChanges, isTrue);
    expect(budget.reservedBytes, 9);
    s.undo();
    expect(s.bundle.resources['photo'], [3, 3, 3]);
    expect(budget.reservedBytes, 6);
    s.dispose();
    expect(budget.reservedBytes, 0);
  });
  test('profile explicit selected contacts and global partial style logo form one immutable undo action', () {
    final budget = WorkBudgetController(capacityBytes: 30);
    final s = EditorSession(
      Project.blank(id: 'p').withLocale(AppLocale.fr),
      budget: budget,
    );
    s.setHeadline(AppLocale.ptPT, 'Preserved');
    s.setLocation(AppLocale.fr, 'Location');
    s.setContact(AppLocale.ptPT, 'old', 'Old');
    final before = s.bundle;
    final revision = s.project.revision;
    final contacts = {'tel': '  Test contact  '};
    final colours = {'accent': 0xffaabbcc};
    final logo = entry(9, id: 'logo', kind: AssetKind.logo);
    final profile = CompanyProfile(
      logo: logo,
      contacts: contacts,
      colours: colours,
    );
    s.applyProfile(profile, [AppLocale.fr]);
    expect(s.project.revision, revision + 1);
    expect(s.project.contactIds, ['old', 'tel']);
    expect(s.project.edition(AppLocale.fr).contacts, {
      'old': '',
      'tel': '  Test contact  ',
    });
    expect(s.project.edition(AppLocale.ptPT).contacts, {
      'old': 'Old',
      'tel': '',
    });
    expect(s.project.edition(AppLocale.ptPT).headline, 'Preserved');
    expect(s.project.edition(AppLocale.fr).location, 'Location');
    expect(s.project.style.ink, before.project.style.ink);
    expect(s.project.style.paper, before.project.style.paper);
    expect(s.project.style.accent, 0xffaabbcc);
    expect(s.project.logo!.sha256, logo.ref.sha256);
    expect(s.bundle.resources['logo'], same(logo.bytes));
    contacts.clear();
    colours.clear();
    expect(s.project.edition(AppLocale.fr).contacts['tel'], '  Test contact  ');
    s.applyProfile(CompanyProfile(), []);
    expect(s.project.logo, isNotNull);
    expect(s.project.revision, revision + 1);
    s.undo();
    expect(
      s.project.toManifest()..remove('revision'),
      before.project.toManifest()..remove('revision'),
    );
    s.dispose();
    expect(budget.reservedBytes, 0);
  });
  test('invalid profile selections union limits collisions and aggregate budget preserve everything', () {
    final budget = WorkBudgetController(capacityBytes: 30);
    final e = entry(1);
    final s = EditorSession(
      Project.blank(id: 'p').withPhoto(e.ref),
      resources: {'photo': e.bytes},
      budget: budget,
    );
    final profile = CompanyProfile(contacts: {'tel': 'test'});
    final before = s.bundle;
    expect(() => s.applyProfile(profile, [AppLocale.en]), throwsArgumentError);
    expect(
      () => s.applyProfile(profile, [AppLocale.ptPT, AppLocale.ptPT]),
      throwsArgumentError,
    );
    expect(
      () => s.applyProfile(
        CompanyProfile(logo: entry(2, kind: AssetKind.logo)),
        [],
      ),
      throwsArgumentError,
    );
    expect(s.bundle, same(before));
    expect(budget.reservedBytes, 3);
    for (var i = 0; i < 8; i++) {
      s.setContact(AppLocale.ptPT, 'c$i', '');
    }
    final full = s.bundle;
    expect(
      () => s.applyProfile(profile, [AppLocale.ptPT]),
      throwsA(isA<CapacityExceeded>()),
    );
    expect(s.bundle, same(full));
    s.dispose();
  });
  test('absolute style scale and format crop values do not drift and each undo restores others', () {
    final s = EditorSession(Project.blank(id: 'p'));
    addTearDown(s.dispose);
    final original = s.bundle;
    s.setLogoScale(0.1);
    s.setLogoScale(4);
    s.setLogoScale(1.25);
    s.setCrop(
      ExportFormat.square,
      NormalizedRect(left: 0.1, top: 0.2, width: 0.5, height: 0.4),
    );
    s.setCrop(
      ExportFormat.story,
      NormalizedRect(left: 0, top: 0, width: 1, height: 1),
    );
    expect(s.project.style.logoScale, 1.25);
    expect(s.project.cropByFormat[ExportFormat.square]!.left, 0.1);
    final before = s.bundle;
    s.setLogoScale(1.25);
    s.setCrop(
      ExportFormat.square,
      NormalizedRect(left: 0.1, top: 0.2, width: 0.5, height: 0.4),
    );
    expect(s.bundle, same(before));
    for (final scale in [0.099, 4.001, double.nan, double.infinity]) {
      expect(() => s.setLogoScale(scale), throwsArgumentError);
      expect(s.bundle, same(before));
    }
    for (var i = 0; i < 5; i++) {
      s.undo();
    }
    expect(s.hasUnsavedChanges, isFalse);
    expect(s.project.style.logoScale, original.project.style.logoScale);
    s.dispose();
  });
  test('session refuses independent field structure and contact limits without truncation', () {
    final s = EditorSession(Project.blank(id: 'p'));
    addTearDown(s.dispose);
    for (var i = 0; i < 12; i++) {
      s.addSection('s$i');
    }
    expect(s.project.sections.length, 12);
    final blocks = s.bundle;
    expect(() => s.addSection('extra'), throwsA(isA<CapacityExceeded>()));
    expect(s.bundle, same(blocks));
    for (var i = 0; i < 8; i++) {
      s.addItem('s0', 'i$i');
      s.setContact(AppLocale.ptPT, 'c$i', '');
    }
    final full = s.bundle;
    expect(() => s.addItem('s0', 'extra'), throwsA(isA<CapacityExceeded>()));
    expect(
      () => s.setContact(AppLocale.ptPT, 'extra', ''),
      throwsA(isA<CapacityExceeded>()),
    );
    expect(s.bundle, same(full));
    final exact = '😀' * 8000;
    s.setHeadline(AppLocale.ptPT, exact);
    expect(s.project.edition(AppLocale.ptPT).headline.length, 16000);
    final before = s.bundle;
    final over = '${exact}x';
    for (final action in <void Function()>[
      () => s.setHeadline(AppLocale.ptPT, over),
      () => s.setLocation(AppLocale.ptPT, over),
      () => s.setName(over),
      () => s.setContact(AppLocale.ptPT, 'c0', over),
      () => s.setSectionTitle(AppLocale.ptPT, 's0', over),
      () => s.setItemText(AppLocale.ptPT, 's0', 'i0', over),
    ]) {
      expect(action, throwsA(isA<CapacityExceeded>()));
      expect(s.bundle, same(before));
    }
    expect(over, '${exact}x');
    s.dispose();
  });
  test('session validates exact 512KiB UTF8 manifest and first byte multibyte overflow before publishing', () {
    final p = Project.blank(id: 'exact').withSections(
      List.generate(
        4,
        (s) => Section(
          id: 's$s',
          items: List.generate(
            8,
            (i) => SectionItem(
              id: 'i$i',
              textByLocale: {AppLocale.ptPT: 'x' * 16000},
            ),
          ),
        ),
      ),
    );
    final s = EditorSession(p);
    final size = utf8.encode(s.project.toManifestJson()).length;
    final gap = WorkLimits.manifestUtf8Bytes - size;
    final exact = '${'é' * (gap ~/ 2)}${gap.isOdd ? 'x' : ''}';
    s.setName(exact);
    expect(
      utf8.encode(s.project.toManifestJson()).length,
      WorkLimits.manifestUtf8Bytes,
    );
    final before = s.bundle;
    final revision = s.project.revision;
    expect(() => s.setName('${exact}x'), throwsA(isA<CapacityExceeded>()));
    expect(() => s.setName('$exacté'), throwsA(isA<CapacityExceeded>()));
    expect(s.bundle, same(before));
    expect(s.project.revision, revision);
    expect(s.project.name, exact);
    // A lone surrogate is retained literally by the domain; JSON escaping has a byte cost.
    final small = EditorSession(Project.blank(id: 'surrogate'));
    final unpaired = String.fromCharCode(0xd800);
    small.setName(unpaired);
    expect(small.project.name.codeUnits, [0xd800]);
    small.dispose();
    s.dispose();
  });
  test(
    'history count stays at twenty exact and lower injected bounds cannot grow',
    () {
      final s = EditorSession(Project.blank(id: 'count'));
      for (var i = 1; i <= 21; i++) {
        s.setName('$i');
      }
      expect(s.undoCount, WorkLimits.undoSnapshots);
      for (var i = 0; i < 20; i++) {
        s.undo();
      }
      expect(s.project.name, '1');
      expect(s.canUndo, isFalse);
      for (final pair in [
        (0, 6),
        (21, 6),
        (1, -1),
        (1, WorkLimits.undoBytes + 1),
      ]) {
        expect(
          () => EditorSession(
            Project.blank(id: 'bad'),
            historyLimit: pair.$1,
            historyBytes: pair.$2,
          ),
          throwsArgumentError,
        );
      }
      s.dispose();
    },
  );
  test('resource attach is atomic pruned and undo retains ref bytes with cached digest reuse', () {
    final a = entry(1);
    final work = <int>[];
    final b = ProjectBundle(Project.blank(id: 'p').withPhoto(a.ref), {
      'photo': a.bytes,
    }, onResourceDigest: work.add);
    final budget = WorkBudgetController(capacityBytes: 30);
    final s = EditorSession.fromBundle(
      b,
      budget: budget,
      historyLimit: 2,
      historyBytes: 9,
    );
    final old = s.bundle;
    expect(budget.reservedBytes, 3);
    s.setName('x');
    s.setLocation(AppLocale.ptPT, 'y');
    expect(work, [3]);
    expect(budget.reservedBytes, 3);
    final replacement = entry(2);
    s.attachResource(replacement);
    expect(s.project.photo!.sha256, replacement.ref.sha256);
    expect(s.bundle.resources['photo'], same(replacement.bytes));
    expect(budget.reservedBytes, 6);
    expect(work, [3, 3]);
    s.undo();
    expect(s.bundle.resources['photo'], same(old.resources['photo']));
    expect(s.project.photo!.sha256, a.ref.sha256);
    expect(budget.reservedBytes, 3);
    expect(work, [3, 3]);
    for (var i = 0; i < 25; i++) {
      s.attachResource(entry(i + 3, id: 'p$i'));
      expect(s.bundle.resources.length, 1);
    }
    expect(s.undoCount, lessThanOrEqualTo(2));
    expect(s.historyResourceBytes, lessThanOrEqualTo(9));
    expect(old.resources['photo'], [1, 1, 1]);
    final before = s.bundle;
    expect(
      () => s.attachResource(entry(1, kind: AssetKind.thumbnail)),
      throwsArgumentError,
    );
    expect(s.bundle, same(before));
    s.dispose();
    expect(budget.reservedBytes, 0);
  });
  test('actual storage history boundary refuses unshareable latest reversal atomically', () {
    final budget = WorkBudgetController(capacityBytes: 30);
    final s = EditorSession(
      Project.blank(id: 'p'),
      budget: budget,
      historyBytes: 6,
    );
    s.attachResource(entry(1));
    s.attachResource(entry(2));
    expect(s.historyResourceBytes, 6);
    s.attachResource(entry(3));
    expect(s.historyResourceBytes, 6);
    expect(s.undoCount, 1);
    final before = s.bundle;
    final generation = s.generation;
    expect(
      () => s.attachResource(entry(4, size: 4)),
      throwsA(isA<CapacityExceeded>()),
    );
    expect(s.bundle, same(before));
    expect(s.generation, generation);
    expect(budget.reservedBytes, 6);
    s.undo();
    expect(s.bundle.resources['photo'], [2, 2, 2]);
    s.dispose();
    expect(budget.reservedBytes, 0);
    // Equal hash in a separate allocation isn't free storage, even though content is equal.
    final equalEntry = entry(7);
    final first = ProjectBundle(
      Project.blank(id: 'q').withPhoto(equalEntry.ref),
      {'photo': equalEntry.bytes},
    );
    final q = EditorSession.fromBundle(first, budget: budget, historyBytes: 5);
    expect(
      () => q.attachResource(entry(7, id: 'different-id')),
      throwsA(isA<CapacityExceeded>()),
    );
    expect(q.bundle, same(first));
    q.dispose();
  });
  test(
    'constructor and mutation failures rollback all provisional reservations',
    () {
      final budget = WorkBudgetController(capacityBytes: 5);
      final e = entry(1);
      final p = Project.blank(id: 'p').withPhoto(e.ref);
      expect(() => EditorSession(p, budget: budget), throwsArgumentError);
      expect(budget.reservedBytes, 0);
      expect(
        () => EditorSession(
          p,
          resources: {
            'photo': Uint8List.fromList([9, 9, 9]),
          },
          budget: budget,
        ),
        throwsArgumentError,
      );
      expect(budget.reservedBytes, 0);
      expect(
        () => EditorSession(
          Project.blank(id: 'q'),
          resources: {'a': Uint8List(3), 'b': Uint8List(3)},
          budget: budget,
        ),
        throwsA(isA<CapacityExceeded>()),
      );
      expect(budget.reservedBytes, 0);
      final source = ProjectBundle(p, {'photo': e.bytes});
      expect(
        () => EditorSession.fromBundle(source, budget: budget, historyBytes: 2),
        throwsA(isA<CapacityExceeded>()),
      );
      expect(budget.reservedBytes, 0);
      final s = EditorSession.fromBundle(source, budget: budget);
      final before = s.bundle;
      expect(
        () => s.attachResource(entry(2)),
        throwsA(isA<CapacityExceeded>()),
      );
      expect(s.bundle, same(before));
      expect(budget.reservedBytes, 3);
      s.dispose();
      expect(budget.reservedBytes, 0);
      expect(() => s.setName('after dispose'), throwsStateError);
      expect(() => s.captureSnapshot(), throwsStateError);
    },
  );
  test('captured resource handles remain budgeted through eviction and disposal until idempotent release', () {
    final budget = WorkBudgetController(capacityBytes: 30);
    final s = EditorSession(
      Project.blank(id: 'p'),
      budget: budget,
      historyLimit: 1,
    );
    s.attachResource(entry(1));
    final captured = s.captureSnapshot();
    final second = s.captureSnapshot();
    expect(budget.reservedBytes, 3);
    s.attachResource(entry(2));
    s.attachResource(entry(3));
    expect(budget.reservedBytes, 9);
    s.dispose();
    s.dispose();
    expect(budget.reservedBytes, 3);
    expect(captured.bundle.resources['photo'], [1, 1, 1]);
    captured.release();
    captured.release();
    expect(budget.reservedBytes, 3);
    second.release();
    expect(budget.reservedBytes, 0);
    expect(() => second.bundle, throwsStateError);
  });
  test('owned resource reservations contend with heavy operations and recover after refusal', () async {
    final budget = WorkBudgetController(capacityBytes: 8);
    final op = Operation.create();
    final lease = await budget.acquire(op, 6);
    final s = EditorSession(Project.blank(id: 'p'), budget: budget);
    expect(() => s.attachResource(entry(1)), throwsA(isA<CapacityExceeded>()));
    expect(s.project.photo, isNull);
    expect(budget.reservedBytes, 6);
    lease.release();
    await op.finish();
    s.attachResource(entry(1));
    final other = Operation.create();
    await expectLater(
      budget.acquire(other, 6),
      throwsA(isA<CapacityExceeded>()),
    );
    await other.finish();
    s.dispose();
    expect(budget.reservedBytes, 0);
  });
  test('shared blank structure moves preserve all seven languages and hidden content', () {
    final s = EditorSession(Project.blank(id: 'structure'));
    addTearDown(s.dispose);
    for (final l in AppLocale.values) {
      s.addLocale(l);
    }
    s.addSection('s1');
    s.addSection('s2');
    s.addSection('s3');
    s.addItem('s1', 'i1');
    s.addItem('s1', 'i2');
    s.addItem('s2', 'i1');
    for (final l in AppLocale.values) {
      expect(s.project.sections.first.title(l), '');
      expect(s.project.sections.first.items.first.text(l), '');
      s.setSectionTitle(l, 's1', 'title ${l.code}');
      s.setItemText(l, 's1', 'i1', 'text ${l.code}');
    }
    s.moveSection('s1', 2);
    s.moveItem('s1', 'i1', 1);
    expect(s.project.sections.map((x) => x.id), ['s2', 's3', 's1']);
    expect(s.project.sections.last.items.map((x) => x.id), ['i2', 'i1']);
    s.setSectionVisible('s1', false);
    for (final l in AppLocale.values) {
      expect(s.project.sections.last.title(l), 'title ${l.code}');
      expect(s.project.sections.last.items.last.text(l), 'text ${l.code}');
    }
    final before = s.bundle;
    s.moveSection('s1', 2);
    s.moveItem('s1', 'i1', 1);
    s.setSectionVisible('s1', false);
    s.addLocale(AppLocale.fr);
    expect(s.bundle, same(before));
    for (final action in <void Function()>[
      () => s.addSection('s1'),
      () => s.addSection('../bad'),
      () => s.addItem('s1', 'i1'),
      () => s.addItem('absent', 'x'),
      () => s.moveSection('s1', -1),
      () => s.moveSection('s1', 3),
      () => s.moveItem('s1', 'i1', 2),
      () => s.moveItem('s1', 'absent', 0),
      () => s.setSectionTitle(AppLocale.en, 'absent', 'x'),
      () => s.setItemText(AppLocale.fr, 's1', 'absent', 'x'),
    ]) {
      expect(action, throwsArgumentError);
      expect(s.bundle, same(before));
    }
  });
  test('non-destructive removal exposes hidden multilingual coordinates and undo restores', () {
    final s = EditorSession(Project.blank(id: 'p').withLocale(AppLocale.fr));
    addTearDown(s.dispose);
    s.addSection('s1');
    s.addItem('s1', 'i1');
    s.setSectionTitle(AppLocale.ptPT, 's1', ' ');
    s.setItemText(AppLocale.fr, 's1', 'i1', 'Texte de test');
    s.setSectionVisible('s1', false);
    final before = s.bundle;
    final gen = s.generation;
    final impact = s.requestRemoveSection('s1');
    expect(impact.requiresConfirmation, isTrue);
    expect(impact.affectedLocales, [AppLocale.ptPT, AppLocale.fr]);
    expect(impact.affectedFields, contains('fr/sections/s1/items/i1/text'));
    expect(impact.affectedFields.join(), isNot(contains('Texte de test')));
    expect(() => impact.affectedLocales.clear(), throwsUnsupportedError);
    expect(() => impact.affectedFields.clear(), throwsUnsupportedError);
    expect(s.bundle, same(before));
    expect(s.generation, gen);
    s.confirmRemoveSection('s1');
    expect(s.project.sections, isEmpty);
    s.undo();
    expect(s.project.sections.single.visible, isFalse);
    expect(
      s.project.sections.single.items.single.text(AppLocale.fr),
      'Texte de test',
    );
    final itemImpact = s.requestRemoveItem('s1', 'i1');
    expect(itemImpact.affectedLocales, [AppLocale.fr]);
    s.confirmRemoveItem('s1', 'i1');
    s.undo();
    expect(
      s.project.sections.single.items.single.text(AppLocale.fr),
      'Texte de test',
    );
  });
  test('removal confirmations reject wrong target session stale edit and undo approvals', () {
    final s = EditorSession(Project.blank(id: 'p'));
    addTearDown(s.dispose);
    s.addSection('s1');
    s.addItem('s1', 'i1');
    s.addItem('s1', 'i2');
    final empty = s.requestRemoveItem('s1', 'i1');
    expect(empty.requiresConfirmation, isFalse);
    expect(
      () => s.confirmRemoveItem('s1', 'i2', impact: empty),
      throwsStateError,
    );
    final other = EditorSession(s.project);
    addTearDown(other.dispose);
    expect(
      () => other.confirmRemoveItem('s1', 'i1', impact: empty),
      throwsStateError,
    );
    s.setName('new');
    final changed = s.bundle;
    expect(() => s.confirmRemoveItem('s1', 'i1'), throwsStateError);
    expect(
      () => s.confirmRemoveItem('s1', 'i1', impact: empty),
      throwsStateError,
    );
    expect(s.bundle, same(changed));
    s.undo();
    expect(
      () => s.confirmRemoveItem('s1', 'i1', impact: empty),
      throwsStateError,
    );
    s.requestRemoveItem('s1', 'i1');
    s.setName(''); // genuine no-op does not invalidate
    s.confirmRemoveItem('s1', 'i1');
    expect(s.project.sections.single.items.single.id, 'i2');
    expect(() => s.requestRemoveSection('absent'), throwsArgumentError);
  });
  test('new locale is blank and locale removal always confirms including empty and refuses last', () {
    final s = EditorSession(Project.blank(id: 'p'));
    addTearDown(s.dispose);
    s.setHeadline(AppLocale.ptPT, 'Português');
    s.addSection('s');
    s.addItem('s', 'i');
    s.setItemText(AppLocale.ptPT, 's', 'i', 'Original');
    s.addLocale(AppLocale.fr);
    expect(s.project.edition(AppLocale.fr).headline, '');
    expect(s.project.sections.single.items.single.text(AppLocale.fr), '');
    final before = s.bundle;
    expect(s.requestRemoveLocale(AppLocale.fr).requiresConfirmation, isTrue);
    expect(s.bundle, same(before));
    s.confirmRemoveLocale(AppLocale.fr);
    s.undo();
    s.setLocation(AppLocale.fr, ' Paris ');
    s.setContact(AppLocale.fr, 'tel', '  ');
    final impact = s.requestRemoveLocale(AppLocale.fr);
    expect(impact.affectedFields, contains('fr/location'));
    expect(impact.affectedFields, contains('fr/contacts/tel'));
    s.confirmRemoveLocale(AppLocale.fr);
    expect(s.project.edition(AppLocale.ptPT).headline, 'Português');
    expect(() => s.requestRemoveLocale(AppLocale.ptPT), throwsArgumentError);
    expect(() => s.confirmRemoveLocale(AppLocale.ptPT), throwsArgumentError);
  });
  test('session admits blank content without pretending disk save', () {
    final s = EditorSession(Project.blank(id: 'p'));
    addTearDown(s.dispose);
    expect(s.project.id, 'p');
    expect(s.bundle.resources, isEmpty);
    expect(s.hasUnsavedChanges, isFalse);
    expect(s.canUndo, isFalse);
    expect(s.project.edition(AppLocale.ptPT).headline, '');
  });
  test('independent literal edits each publish one revision and undo restores clean with fresh revision', () {
    final initial = Project.blank(id: 'p').withLocale(AppLocale.fr);
    final s = EditorSession(initial);
    addTearDown(s.dispose);
    final old = s.bundle;
    s.setHeadline(AppLocale.fr, '  Texte\nß😀  ');
    expect(s.project.revision, initial.revision + 1);
    expect(s.project.edition(AppLocale.ptPT).headline, '');
    expect(s.project.edition(AppLocale.fr).headline, '  Texte\nß😀  ');
    s.setLocation(AppLocale.ptPT, ' Local ');
    s.setName(' Internal ');
    s.setContact(AppLocale.fr, 'contact-1', '+00 Test');
    expect(s.project.revision, initial.revision + 4);
    expect(s.project.edition(AppLocale.ptPT).contacts['contact-1'], '');
    expect(s.hasUnsavedChanges, isTrue);
    expect(old.project.toManifest(), initial.toManifest());
    for (var i = 0; i < 4; i++) {
      s.undo();
    }
    expect(s.hasUnsavedChanges, isFalse);
    expect(s.project.revision, initial.revision + 8);
    expect(s.canUndo, isFalse);
    expect(() => s.undo(), throwsStateError);
  });
  test(
    'no-op edits preserve exact snapshot history generation and clean state',
    () {
      final s = EditorSession(Project.blank(id: 'p'));
      addTearDown(s.dispose);
      final before = s.bundle;
      s.setName('');
      s.setHeadline(AppLocale.ptPT, '');
      s.setLocation(AppLocale.ptPT, '');
      expect(s.bundle, same(before));
      expect(s.canUndo, isFalse);
      expect(s.hasUnsavedChanges, isFalse);
      expect(() => s.setHeadline(AppLocale.en, 'missing'), throwsArgumentError);
      expect(s.bundle, same(before));
    },
  );
  test('resource bearing constructor requires bytes and fromBundle reuses readonly storage', () {
    final e = entry(1);
    final p = Project.blank(id: 'p').withPhoto(e.ref);
    expect(() => EditorSession(p), throwsArgumentError);
    final input = Uint8List.fromList(e.bytes);
    final s = EditorSession(p, resources: {'photo': input});
    addTearDown(s.dispose);
    input[0] = 9;
    expect(s.bundle.resources['photo'], [1, 1, 1]);
    final b = ProjectBundle(p, {'photo': e.bytes});
    final reuse = EditorSession.fromBundle(b);
    addTearDown(reuse.dispose);
    reuse.setName('x');
    expect(reuse.bundle.resources['photo'], same(b.resources['photo']));
  });
}
