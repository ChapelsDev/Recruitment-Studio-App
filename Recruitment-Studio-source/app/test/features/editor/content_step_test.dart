import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/features/composition/font_catalog.dart';
import 'package:recruitment_studio/features/editor/content_step.dart';
import 'package:recruitment_studio/features/projects/project.dart';
import 'package:recruitment_studio/shared/work_limits.dart';
import 'package:recruitment_studio/shared/admission_budget.dart';

import 'guided_ui_test_support.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(FontCatalog.load);

  testWidgets('manual headline rejects first excess UTF16 without truncation', (
    tester,
  ) async {
    final rig = GuidedRig();
    await tester.pumpWidget(rig.wrap(ContentStep(controller: rig.host)));
    final input = find.byKey(const Key('content-headline-pt-PT'));
    expect(input, findsOneWidget);
    await tester.enterText(input, 'Texto manual ß');
    await tester.pump();
    expect(
      rig.session.project.edition(AppLocale.ptPT).headline,
      'Texto manual ß',
    );
    final before = rig.session.generation;
    await tester.enterText(input, 'x' * (WorkLimits.fieldUtf16Units + 1));
    await tester.pump();
    expect(rig.session.generation, before);
    expect(
      rig.session.project.edition(AppLocale.ptPT).headline,
      'Texto manual ß',
    );
    expect(tester.widget<TextField>(input).controller!.text, 'Texto manual ß');
    expect(find.textContaining('O valor anterior foi mantido'), findsOneWidget);
    await rig.close(tester);
  });
  testWidgets(
    'shared section editing confirms cross-locale loss and undo restores',
    (tester) async {
      final rig = GuidedRig(
        project: Project.blank(id: 'blocks').withLocale(AppLocale.fr),
      );
      await tester.pumpWidget(rig.wrap(ContentStep(controller: rig.host)));
      await tapGuided(tester, 'add-section');
      await tapGuided(tester, 'add-item-s1');
      await tester.ensureVisible(
        find.byKey(const Key('content-title-s1-pt-PT')),
      );
      await tester.enterText(
        find.byKey(const Key('content-title-s1-pt-PT')),
        'Título manual',
      );
      await tester.pump();
      rig.host.selectLocale(AppLocale.fr);
      await tester.pump();
      await tester.ensureVisible(
        find.byKey(const Key('content-item-s1-i1-fr')),
      );
      await tester.enterText(
        find.byKey(const Key('content-item-s1-i1-fr')),
        'Texte français',
      );
      await tester.pump();
      await tapGuided(tester, 'add-item-s1');
      await tapGuided(tester, 'move-item-up-s1-i2');
      expect(rig.session.project.sections.single.items.map((item) => item.id), [
        'i2',
        'i1',
      ]);
      await tapGuided(tester, 'add-section');
      await tapGuided(tester, 'move-section-up-s2');
      expect(rig.session.project.sections.map((section) => section.id), [
        's2',
        's1',
      ]);
      await tapGuided(tester, 'visible-s1');
      expect(rig.session.project.sections.last.visible, isFalse);
      await tapGuided(tester, 'remove-section-s1');
      expect(find.textContaining('pt-PT, fr'), findsOneWidget);
      await tapGuided(tester, 'cancel-remove-block');
      expect(rig.session.project.sections, hasLength(2));
      await tapGuided(tester, 'remove-section-s1');
      await tapGuided(tester, 'confirm-remove-block');
      expect(rig.session.project.sections.map((section) => section.id), ['s2']);
      await tapGuided(tester, 'content-undo');
      final restored = rig.session.project.sections.last;
      expect(restored.title(AppLocale.ptPT), 'Título manual');
      expect(restored.items.last.text(AppLocale.fr), 'Texte français');
      expect(restored.visible, isFalse);
      await rig.close(tester);
    },
  );
  testWidgets('location and contact are manual per-edition fields', (
    tester,
  ) async {
    final rig = GuidedRig(
      project: Project.blank(id: 'contacts').withLocale(AppLocale.en),
    );
    await tester.pumpWidget(rig.wrap(ContentStep(controller: rig.host)));
    final location = find.byKey(const Key('content-location-pt-PT'));
    expect(location, findsOneWidget);
    await tester.enterText(location, 'Local manual');
    await tester.pump();
    await tapGuided(tester, 'add-contact');
    await tester.ensureVisible(
      find.byKey(const Key('content-contact-c1-pt-PT')),
    );
    await tester.enterText(
      find.byKey(const Key('content-contact-c1-pt-PT')),
      '+00 123 / teste',
    );
    await tester.pump();
    rig.host.selectLocale(AppLocale.en);
    await tester.pump();
    expect(
      tester
          .widget<TextField>(find.byKey(const Key('content-contact-c1-en')))
          .controller!
          .text,
      '',
    );
    expect(rig.session.project.edition(AppLocale.en).location, '');
    expect(
      rig.session.project.edition(AppLocale.ptPT).contacts['c1'],
      '+00 123 / teste',
    );
    expect(
      rig.session.project.edition(AppLocale.ptPT).location,
      'Local manual',
    );
    await rig.close(tester);
  });
  testWidgets(
    'removal impact admission refusal is useful and leaves all locale text intact',
    (tester) async {
      final rig = GuidedRig();
      rig.session.addSection('s1');
      rig.session.setSectionTitle(AppLocale.ptPT, 's1', 'Manual');
      rig.host.preview.setPaused(true);
      await tester.pumpWidget(rig.wrap(ContentStep(controller: rig.host)));
      final budget = AdmissionBudget.shared;
      final pressure = budget.reserve(
        budget.capacityBytes - budget.reservedBytes,
      );
      try {
        await tapGuided(tester, 'remove-section-s1');
        expect(tester.takeException(), isNull);
        expect(find.textContaining('Limite de capacidade'), findsOneWidget);
        expect(
          rig.session.project.sections.single.title(AppLocale.ptPT),
          'Manual',
        );
        expect(find.byKey(const Key('confirm-remove-block')), findsNothing);
      } finally {
        pressure.release();
      }
      await rig.close(tester);
    },
  );
}
