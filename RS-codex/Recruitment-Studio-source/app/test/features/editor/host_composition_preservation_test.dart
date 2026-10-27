// Inert specification-first successor controls: no execution during authorship.
import 'dart:async';
import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/features/composition/export_format.dart';
import 'package:recruitment_studio/features/composition/font_catalog.dart';
import 'package:recruitment_studio/features/editor/editor_session.dart';
import 'package:recruitment_studio/features/editor/preview_owner.dart';
import 'package:recruitment_studio/features/projects/project.dart';
import 'package:recruitment_studio/shared/admission_budget.dart';
import 'package:recruitment_studio/shared/problem.dart';
import 'preview_owner_test.dart' show PreviewRig, bounded;
import 'admission_preview_registration_test.dart' show availableOperationSlots;

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(FontCatalog.load);
  test('concrete no-op dirty queries create no escaping graph payments', () {
    final s = EditorSession(Project.blank(id: 'no_graph'));
    try {
      final initial = s.project;
      final before = AdmissionBudget.shared.reservedBytes;
      final tickets = AdmissionBudget.shared.ticketCount;
      for (var i = 0; i < 40; i++) {
        s.setName('');
        expect(s.hasUnsavedChanges, isFalse);
      }
      expect(s.project, same(initial));
      expect(s.generation, 0);
      expect(s.undoCount, 0);
      expect(AdmissionBudget.shared.reservedBytes, before);
      expect(AdmissionBudget.shared.ticketCount, tickets);
    } finally { s.dispose(); }
  });
  test('twenty history promises use finite private revision preflights', () {
    final s = EditorSession(Project.blank(id: 'history'));
    final before = AdmissionBudget.shared.reservedBytes;
    try {
      for (var i = 1; i <= 20; i++) {
        s.setName('name-$i');
        expect(s.project.revision, i);
        expect(s.generation, i);
        expect(s.hasUnsavedChanges, isTrue);
      }
      expect(s.undoCount, 20);
      // Positive source-derived allowance for final models/maps only, not
      // twenty discarded DTO/manifest graphs per retained history position.
      expect(AdmissionBudget.shared.reservedBytes - before, lessThan(2 * 1024 * 1024));
      for (var i = 0; i < 20; i++) {
        s.undo();
        expect(s.project.revision, 21 + i);
      }
      expect(s.project.name, '');
      expect(s.hasUnsavedChanges, isFalse);
    } finally { s.dispose(); }
  });
  test('typed editor revision preserves seven manuals hidden order crop style', () {
    final p = ImmutableProject(id: 'manuals', contactIds: ['second', 'first'],
      localeOrder: AppLocale.values.reversed.toList(),
      editions: {for (final l in AppLocale.values) l: Edition(
        headline: '${l.code} 😀', location: '', contacts: {'second': '', 'first': l.code})},
      sections: [Section(id: 'hidden', visible: false,
        titleByLocale: {for (final l in AppLocale.values) l: l.code},
        items: [SectionItem(id: 'b', textByLocale: {AppLocale.fr: 'manual'}), SectionItem(id: 'a')])],
      cropByFormat: {ExportFormat.square: NormalizedRect(left: .1, top: .2, width: .7, height: .6)},
      style: ProjectStyle(logoScale: 1.5));
    final s = EditorSession(p);
    try {
      s.setName('changed');
      s.undo();
      expect((s.project as ImmutableProject).sameContent(p), isTrue);
      expect(s.project.localeOrder, AppLocale.values.reversed.toList());
      expect(s.project.sections.single.visible, isFalse);
      expect(s.project.sections.single.items.map((i) => i.id), ['b', 'a']);
      expect(s.project.edition(AppLocale.fr).contacts.keys, ['second', 'first']);
      expect(s.project.cropByFormat[ExportFormat.square]!.top, .2);
      expect(s.project.style.logoScale, 1.5);
    } finally { s.dispose(); }
  });
  test('old domain aliases and capture survive revision save fences', () {
    final s = EditorSession(Project.blank(id: 'capture').withContact(AppLocale.ptPT, 'c', 'old'));
    final h = s.captureSnapshot();
    final contacts = h.bundle.project.edition(AppLocale.ptPT).contacts;
    try {
      s.setContact(AppLocale.ptPT, 'c', 'new');
      expect(contacts['c'], 'old');
      expect(s.isSnapshotCurrent(h), isFalse);
      expect(s.acknowledgeProjectSave(h, projectId: h.projectId, revision: h.revision,
        sessionGeneration: h.sessionGeneration, succeeded: true), isTrue);
      expect(s.hasUnsavedChanges, isTrue);
      s.dispose();
      expect(h.bundle.project.edition(AppLocale.ptPT).contacts, same(contacts));
      final paid = AdmissionBudget.shared.reservedBytes;
      h.release();
      expect(contacts['c'], 'old');
      // Only explicit session/capture controls retire; public domain groups do not.
      expect(AdmissionBudget.shared.reservedBytes, greaterThanOrEqualTo(paid - 2 * 1024 * 1024 - 8192));
    } finally { h.release(); s.dispose(); }
  });
  testWidgets('fresh fake-zone owner activates inspection before first asynchronous barrier', (tester) async {
    var registrations = 0;
    final rig = PreviewRig(hooks: PreviewTestHooks(beforeRegistration: (phase) {
      if (phase == PreviewPhase.beforeInspection) { registrations++; }
    }));
    try {
      await tester.runAsync(() async {
        expect(await availableOperationSlots(), greaterThan(0));
        rig.request();
        expect(registrations, 1);
        await bounded(rig.owner.idle);
      });
      expect(rig.owner.status, PreviewStatus.ready);
      expect(tester.takeException(), isNull);
    } finally { await tester.runAsync(rig.finish); }
  });
  testWidgets('actual retiring frame blocks replacement pump until retirement completes', (tester) async {
    late final Completer<void> entered, release;
    await tester.runAsync(() async {
      entered = Completer<void>();
      release = Completer<void>();
    });
    var registrations = 0;
    final rig = PreviewRig(hooks: PreviewTestHooks(
      beforeRegistration: (phase) {
        if (phase == PreviewPhase.beforeInspection) { registrations++; }
      },
      beforePhase: (phase) async {
        if (phase == PreviewPhase.beforeRetire && !entered.isCompleted) {
          entered.complete();
          await release.future;
        }
      }));
    try {
      await tester.runAsync(() async {
        rig.request(); await bounded(rig.owner.idle);
        final old = rig.owner.current!;
        rig.request(AppLocale.en); await bounded(rig.owner.idle);
        await bounded(entered.future);
        expect(old.isRetiring, isTrue);
        expect(registrations, 2);
        rig.request(AppLocale.fr);
        await Future<void>.delayed(Duration.zero);
        expect(registrations, 2);
        release.complete();
        await bounded(rig.owner.idle);
        expect(registrations, 3);
        expect(rig.owner.current!.locale, AppLocale.fr);
      });
    } finally {
      if (!release.isCompleted) { release.complete(); }
      await tester.runAsync(rig.finish);
    }
  });
  testWidgets('fresh same-real-zone beforeInspection refusal refunds pending and recovers', (tester) async {
    final admission = AdmissionBudget.shared;
    AdmissionTicket? pressure;
    var reached = 0, finished = 0;
    await tester.runAsync(() async {
      final rig = PreviewRig(hooks: PreviewTestHooks(
        beforeRegistration: (phase) {
          if (phase != PreviewPhase.beforeInspection || reached != 0) { return; }
          reached++;
          final free = admission.capacityBytes - admission.reservedBytes;
          expect(free, greaterThan(1024));
          pressure = admission.reserve(free - 512);
          expect(admission.capacityBytes - admission.reservedBytes, 512);
        },
        onEvent: (event, phase, token, images, bytes) {
          if (event == PreviewEvent.stageSettled && phase == PreviewPhase.afterInspection) { finished++; }
        }));
      final initial = rig.session.project;
      try {
        final slots = await availableOperationSlots();
        expect(slots, greaterThan(0));
        rig.request(); await bounded(rig.owner.idle);
        expect(reached, 1); expect(finished, 1);
        expect(rig.owner.problems.map((p) => p.code), contains(ProblemCode.capacityExceeded));
        expect(rig.session.project, same(initial));
        expect(rig.session.generation, 0);
        pressure!.release(); pressure = null;
        expect(await availableOperationSlots(), slots);
        rig.request(); await bounded(rig.owner.idle);
        expect(rig.owner.status, PreviewStatus.ready);
      } finally { pressure?.release(); pressure = null; await rig.finish(); }
    });
    expect(tester.takeException(), isNull);
  });
  testWidgets('fresh same-real-zone beforeDecode refusal refunds pending and recovers', (tester) async {
    final admission = AdmissionBudget.shared;
    AdmissionTicket? pressure;
    var reached = 0, finished = 0;
    await tester.runAsync(() async {
      final rig = PreviewRig(hooks: PreviewTestHooks(
        beforeRegistration: (phase) {
          if (phase != PreviewPhase.beforeDecode || reached != 0) { return; }
          reached++;
          final free = admission.capacityBytes - admission.reservedBytes;
          expect(free, greaterThan(1024));
          pressure = admission.reserve(free - 512);
          expect(admission.capacityBytes - admission.reservedBytes, 512);
        },
        onEvent: (event, phase, token, images, bytes) {
          if (event == PreviewEvent.stageSettled && phase == PreviewPhase.afterDecode) { finished++; }
        }));
      final initial = rig.session.project;
      try {
        final slots = await availableOperationSlots();
        expect(slots, greaterThan(0));
        rig.request(); await bounded(rig.owner.idle);
        expect(reached, 1); expect(finished, 1);
        expect(rig.owner.problems.map((p) => p.code), contains(ProblemCode.capacityExceeded));
        expect(rig.session.project, same(initial));
        expect(rig.session.generation, 0);
        pressure!.release(); pressure = null;
        expect(await availableOperationSlots(), slots);
        rig.request(); await bounded(rig.owner.idle);
        expect(rig.owner.status, PreviewStatus.ready);
      } finally { pressure?.release(); pressure = null; await rig.finish(); }
    });
    expect(tester.takeException(), isNull);
  });
}
