// Source-only regression specification. Execution requires successor approval.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/features/editor/editor_session.dart';
import 'package:recruitment_studio/features/editor/languages_step.dart';
import 'package:recruitment_studio/features/projects/project.dart';
import 'package:recruitment_studio/shared/admission_budget.dart';
import 'package:recruitment_studio/shared/work_limits.dart';

Widget host(EditorSession session) => MaterialApp(
  home: Scaffold(body: LanguagesStep(
    key: const ValueKey('bounded-language-controls'), session: session,
  )),
);
TextEditingController field(WidgetTester tester, String key) =>
    tester.widget<TextField>(find.byKey(ValueKey(key))).controller!;

void main() {
  testWidgets('same-session contact churn retires removed controllers and undo reconstructs', (tester) async {
    final session = EditorSession(Project.blank(id: 'controller-churn')
      .withContactIds(['c0']).withContact(AppLocale.ptPT, 'c0', 'zero'));
    addTearDown(session.dispose);
    await tester.pumpWidget(host(session));
    final headline = field(tester, 'headline-pt-PT');
    for (var i = 1; i <= 24; i++) {
      final removed = field(tester, 'contact-pt-PT-c${i - 1}');
      session.replaceProject(session.project.withContactIds(['c$i'])
        .withContact(AppLocale.ptPT, 'c$i', 'value-$i'));
      await tester.pumpWidget(host(session));
      await tester.pump();
      expect(field(tester, 'headline-pt-PT'), same(headline));
      expect(field(tester, 'contact-pt-PT-c$i').text, 'value-$i');
      expect(() => removed.addListener(() {}), throwsFlutterError);
    }
    final removed = field(tester, 'contact-pt-PT-c24');
    expect(session.canUndo, isTrue);
    session.undo();
    await tester.pumpWidget(host(session));
    await tester.pump();
    expect(field(tester, 'contact-pt-PT-c23').text, 'value-23');
    expect(field(tester, 'headline-pt-PT'), same(headline));
    expect(() => removed.addListener(() {}), throwsFlutterError);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('hidden enabled locales retire removed contact keys without replacing live fields', (tester) async {
    final session = EditorSession(Project.blank(id: 'hidden-controller-churn')
      .withContactIds(['a']).withContact(AppLocale.ptPT, 'a', 'manual-pt'));
    addTearDown(session.dispose);
    session.addLocale(AppLocale.en);
    session.setHeadline(AppLocale.en, 'manual-en');
    await tester.pumpWidget(host(session));
    final removed = field(tester, 'contact-pt-PT-a');
    final ptHeadline = field(tester, 'headline-pt-PT');
    final selectEn = find.byKey(const ValueKey('select-en'));
    await tester.ensureVisible(selectEn);
    await tester.tap(selectEn);
    await tester.pumpAndSettle();
    final enHeadline = field(tester, 'headline-en');
    session.replaceProject(session.project.withContactIds(['b']));
    await tester.pumpWidget(host(session));
    await tester.pump();
    expect(() => removed.addListener(() {}), throwsFlutterError);
    expect(field(tester, 'headline-en'), same(enHeadline));
    expect(enHeadline.text, 'manual-en');
    final selectPt = find.byKey(const ValueKey('select-pt-PT'));
    await tester.ensureVisible(selectPt);
    await tester.tap(selectPt);
    await tester.pumpAndSettle();
    expect(field(tester, 'headline-pt-PT'), same(ptHeadline));
    expect(field(tester, 'contact-pt-PT-b').text, '');
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('UTF16 controller text limit includes surrogate pairs and preserves manual content', (tester) async {
    final session = EditorSession(Project.blank(id: 'controller-text-limit')
      .withHeadline(AppLocale.ptPT, 'accepted'));
    addTearDown(session.dispose);
    await tester.pumpWidget(host(session));
    final headline = find.byKey(const ValueKey('headline-pt-PT'));
    await tester.ensureVisible(headline);
    final oversized = String.fromCharCodes(
      List.filled(WorkLimits.fieldUtf16Units ~/ 2 + 1, 0x1f600),
    );
    expect(oversized.length, greaterThan(WorkLimits.fieldUtf16Units));
    await tester.enterText(headline, oversized);
    await tester.pumpAndSettle();
    expect(field(tester, 'headline-pt-PT').text, 'accepted');
    expect(session.project.edition(AppLocale.ptPT).headline, 'accepted');
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('controller admission refuses without mutation and recovers after released pressure', (tester) async {
    final session = EditorSession(Project.blank(id: 'controller-admission'));
    addTearDown(session.dispose);
    final project = session.project;
    final admission = AdmissionBudget.shared;
    AdmissionTicket? blocker = admission.reserve(
      admission.capacityBytes - admission.reservedBytes,
    );
    try {
      await tester.pumpWidget(host(session));
      expect(find.byType(TextField), findsNothing);
      expect(find.textContaining('Capacidade'), findsOneWidget);
      expect(session.project, same(project));
      expect(tester.takeException(), isNull);
      blocker.release();
      blocker = null;
      final beforeControls = admission.reservedBytes;
      await tester.pumpWidget(host(session));
      final expected = 4096 + (2 + WorkLimits.contacts) *
          (8192 + 8 * WorkLimits.fieldUtf16Units + 4 * 136);
      expect(admission.reservedBytes, beforeControls + expected);
      expect(find.byType(TextField), findsNWidgets(2));
      expect(session.project, same(project));
      await tester.pumpWidget(const SizedBox());
      expect(admission.reservedBytes, lessThanOrEqualTo(beforeControls));
    } finally {
      blocker?.release();
      await tester.pumpWidget(const SizedBox());
    }
  });
}
