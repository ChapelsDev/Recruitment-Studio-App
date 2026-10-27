// Inert locale-qualified feedback regressions; no runtime proof before approval.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/features/editor/editor_session.dart';
import 'package:recruitment_studio/features/projects/project.dart';
import 'package:recruitment_studio/shared/work_limits.dart';
import 'admission_controller_registry_test.dart' show host, field;
import 'admission_text_refusal_message_test.dart' show refusal;

Future<void> selectEdition(WidgetTester tester, String code) async {
  final chip = find.byKey(ValueKey('select-$code'));
  await tester.ensureVisible(chip);
  await tester.tap(chip);
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('overflow marker belongs to its locale for all three field kinds', (tester) async {
    final session = EditorSession(Project.blank(id: 'locale-feedback')
      .withHeadline(AppLocale.ptPT, 'pt-title')
      .withLocation(AppLocale.ptPT, 'pt-place')
      .withContactIds(['c']).withContact(AppLocale.ptPT, 'c', 'pt-contact'));
    addTearDown(session.dispose);
    session.addLocale(AppLocale.en);
    session.setHeadline(AppLocale.en, 'en-title');
    session.setLocation(AppLocale.en, 'en-place');
    session.setContact(AppLocale.en, 'c', 'en-contact');
    await tester.pumpWidget(host(session));
    final oversized = String.fromCharCodes(
      List.filled(WorkLimits.fieldUtf16Units ~/ 2 + 1, 0x1f600),
    );
    for (final pair in [
      ['headline-pt-PT', 'headline-en'],
      ['location-pt-PT', 'location-en'],
      ['contact-pt-PT-c', 'contact-en-c'],
    ]) {
      await selectEdition(tester, 'pt-PT');
      final pt = find.byKey(ValueKey(pair[0]));
      await tester.ensureVisible(pt);
      final oldPt = field(tester, pair[0]).text;
      final beforeRefusal = session.project;
      final beforeGeneration = session.generation;
      await tester.enterText(pt, oversized);
      await tester.pumpAndSettle();
      expect(field(tester, pair[0]).text, oldPt);
      expect(session.project, same(beforeRefusal));
      expect(session.generation, beforeGeneration);
      expect(tester.widget<TextField>(pt).decoration!.errorText, refusal);
      await selectEdition(tester, 'en');
      final en = find.byKey(ValueKey(pair[1]));
      await tester.ensureVisible(en);
      expect(tester.widget<TextField>(en).decoration!.errorText, isNull);
      expect(find.text(refusal), findsNothing);
      final oldEn = field(tester, pair[1]).text;
      await tester.enterText(en, '$oldEn-corrected');
      await tester.pumpAndSettle();
      expect(field(tester, pair[1]).text, '$oldEn-corrected');
      await selectEdition(tester, 'pt-PT');
      await tester.ensureVisible(pt);
      expect(field(tester, pair[0]).text, oldPt);
      expect(tester.widget<TextField>(pt).decoration!.errorText, refusal);
      expect(find.text(refusal), findsOneWidget);
      await tester.enterText(pt, '$oldPt-corrected');
      await tester.pumpAndSettle();
      expect(tester.widget<TextField>(pt).decoration!.errorText, isNull);
      expect(tester.takeException(), isNull);
    }
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('removing the originating locale retires feedback before a replacement edition', (tester) async {
    final session = EditorSession(Project.blank(id: 'retired-locale-feedback')
      .withHeadline(AppLocale.ptPT, 'pt-kept'));
    addTearDown(session.dispose);
    session.addLocale(AppLocale.en);
    session.setHeadline(AppLocale.en, 'en-kept');
    await tester.pumpWidget(host(session));
    final pt = find.byKey(const ValueKey('headline-pt-PT'));
    await tester.ensureVisible(pt);
    final oversized = String.fromCharCodes(
      List.filled(WorkLimits.fieldUtf16Units ~/ 2 + 1, 0x1f600),
    );
    await tester.enterText(pt, oversized);
    await tester.pumpAndSettle();
    expect(tester.widget<TextField>(pt).decoration!.errorText, refusal);
    final disablePt = find.byKey(const ValueKey('enable-pt-PT'));
    await tester.ensureVisible(disablePt);
    await tester.tap(disablePt);
    await tester.pumpAndSettle();
    expect(find.byType(AlertDialog), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('confirm-remove-locale')));
    await tester.pumpAndSettle();
    expect(session.project.localeOrder, [AppLocale.en]);
    final en = find.byKey(const ValueKey('headline-en'));
    await tester.ensureVisible(en);
    expect(field(tester, 'headline-en').text, 'en-kept');
    expect(tester.widget<TextField>(en).decoration!.errorText, isNull);
    expect(find.text(refusal), findsNothing);
    await tester.ensureVisible(disablePt);
    await tester.tap(disablePt);
    await tester.pumpAndSettle();
    await selectEdition(tester, 'pt-PT');
    await tester.ensureVisible(pt);
    expect(field(tester, 'headline-pt-PT').text, '');
    expect(tester.widget<TextField>(pt).decoration!.errorText, isNull);
    expect(find.text(refusal), findsNothing);
    expect(session.project.edition(AppLocale.en).headline, 'en-kept');
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
  });
}
