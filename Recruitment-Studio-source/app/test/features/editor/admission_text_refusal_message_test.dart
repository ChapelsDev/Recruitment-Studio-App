// Inert feedback-contract regression; SDK execution requires exact-source approval.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/features/editor/editor_session.dart';
import 'package:recruitment_studio/features/projects/project.dart';
import 'package:recruitment_studio/shared/work_limits.dart';
import 'admission_controller_registry_test.dart' show host, field;

const refusal = 'Limite de 16 000 unidades UTF-16 por campo excedido. '
    'O valor anterior foi mantido; reduza o texto e tente novamente.';

void main() {
  testWidgets('all language fields explain overflow, retain old value and accept correction', (tester) async {
    final session = EditorSession(Project.blank(id: 'field-overflow-feedback')
      .withHeadline(AppLocale.ptPT, 'title')
      .withLocation(AppLocale.ptPT, 'place')
      .withContactIds(['c']).withContact(AppLocale.ptPT, 'c', 'contact'));
    addTearDown(session.dispose);
    await tester.pumpWidget(host(session));
    final oversized = String.fromCharCodes(
      List.filled(WorkLimits.fieldUtf16Units ~/ 2 + 1, 0x1f600),
    );
    expect(oversized.length, WorkLimits.fieldUtf16Units + 2);
    final controls = {'headline-pt-PT': 'title', 'location-pt-PT': 'place',
      'contact-pt-PT-c': 'contact'};
    for (final entry in controls.entries) {
      final selector = find.byKey(ValueKey(entry.key));
      await tester.ensureVisible(selector);
      final before = session.project;
      final generation = session.generation;
      for (var attempt = 0; attempt < 3; attempt++) {
        await tester.enterText(selector, oversized);
        await tester.pumpAndSettle();
        expect(field(tester, entry.key).text, entry.value);
        expect(session.project, same(before));
        expect(session.generation, generation);
        expect(find.text(refusal), findsOneWidget);
        expect(find.byType(SnackBar), findsNothing);
        expect(tester.widget<TextField>(selector).decoration!.errorText, refusal);
        for (final other in controls.keys.where((key) => key != entry.key)) {
          expect(tester.widget<TextField>(find.byKey(ValueKey(other)))
              .decoration!.errorText, isNull);
        }
        expect(tester.takeException(), isNull);
      }
      await tester.enterText(selector, '${entry.value}-corrected');
      await tester.pumpAndSettle();
      expect(field(tester, entry.key).text, '${entry.value}-corrected');
      expect(find.text(refusal), findsNothing);
      expect(tester.widget<TextField>(selector).decoration!.errorText, isNull);
    }
    expect(session.project.edition(AppLocale.ptPT).headline, 'title-corrected');
    expect(session.project.edition(AppLocale.ptPT).location, 'place-corrected');
    expect(session.project.edition(AppLocale.ptPT).contacts['c'], 'contact-corrected');
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('inclusive UTF16 boundary accepts surrogate-pair text without refusal', (tester) async {
    final session = EditorSession(Project.blank(id: 'field-overflow-boundary'));
    addTearDown(session.dispose);
    await tester.pumpWidget(host(session));
    final selector = find.byKey(const ValueKey('headline-pt-PT'));
    await tester.ensureVisible(selector);
    final atLimit = String.fromCharCodes(
      List.filled(WorkLimits.fieldUtf16Units ~/ 2, 0x1f600),
    );
    expect(atLimit.length, WorkLimits.fieldUtf16Units);
    await tester.enterText(selector, atLimit);
    await tester.pumpAndSettle();
    expect(field(tester, 'headline-pt-PT').text, atLimit);
    expect(session.project.edition(AppLocale.ptPT).headline, atLimit);
    expect(find.text(refusal), findsNothing);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
  });
}
