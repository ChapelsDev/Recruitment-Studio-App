import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/features/composition/font_catalog.dart';
import 'package:recruitment_studio/features/editor/review_step.dart';
import 'package:recruitment_studio/shared/problem.dart';

import 'package:recruitment_studio/features/projects/project.dart';
import 'package:recruitment_studio/features/composition/export_format.dart';

import '../../support/project_fixtures.dart';
import 'guided_ui_test_support.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(FontCatalog.load);

  testWidgets(
    'review exposes real variant errors as navigable field problems',
    (tester) async {
      final rig = GuidedRig();
      Problem? correction;
      await tester.runAsync(() async {
        rig.host.refresh();
        await rig.host.idle.timeout(const Duration(seconds: 20));
      });
      await tester.pumpWidget(
        rig.wrap(
          ReviewStep(
            controller: rig.host,
            onProblem: (problem) => correction = problem,
          ),
        ),
      );
      expect(find.textContaining('Erros nesta variante'), findsOneWidget);
      await tapGuided(tester, 'problem-missingHeadline-headline');
      expect(correction!.code, ProblemCode.missingHeadline);
      expect(correction!.field, 'headline');
      expect(correction!.locale, rig.host.locale);
      expect(correction!.format, rig.host.format);
      expect(rig.session.project.edition(rig.host.locale).headline, '');
      expect(find.textContaining('rascunho incompleto'), findsOneWidget);
      await rig.close(tester);
    },
  );
  testWidgets(
    'warning-only Portuguese remains valid while export choice and review language are independent',
    (tester) async {
      late GuidedRig rig;
      await tester.runAsync(() async {
        final bundle = await fixtureBundle();
        rig = GuidedRig(
          bundle: bundle.withProject(bundle.project.withLocale(AppLocale.en)),
        );
        rig.host.refresh();
        await rig.host.idle.timeout(const Duration(seconds: 20));
      });
      AppLocale? selected;
      ExportFormat? selectedFormat;
      await tester.pumpWidget(
        rig.wrap(
          ReviewStep(
            controller: rig.host,
            onProblem: (_) {},
            onExportLocaleChanged: (locale, value) {
              if (value) selected = locale;
            },
            onExportFormatChanged: (format, value) {
              if (!value) selectedFormat = format;
            },
          ),
        ),
      );
      expect(find.text('Sem erros nesta variante.'), findsOneWidget);
      expect(find.textContaining('Aviso'), findsWidgets);
      final en = find.byKey(const Key('export-locale-en'));
      expect(tester.widget<CheckboxListTile>(en).value, isFalse);
      await tapGuided(tester, 'export-locale-en');
      expect(selected, AppLocale.en);
      expect(rig.host.locale, AppLocale.ptPT);
      await tapGuided(tester, 'export-format-story');
      expect(selectedFormat, ExportFormat.story);
      await tester.runAsync(() async {
        await tester.ensureVisible(find.byKey(const Key('review-locale-en')));
        await tester.tap(find.byKey(const Key('review-locale-en')));
        await rig.host.idle.timeout(const Duration(seconds: 20));
      });
      await tester.pump();
      expect(find.textContaining('Erros nesta variante'), findsOneWidget);
      expect(tester.widget<CheckboxListTile>(en).value, isTrue);
      expect(rig.session.project.edition(AppLocale.en).headline, '');
      expect(
        rig.session.project.edition(AppLocale.ptPT).headline,
        'Vaga de teste',
      );
      await rig.close(tester);
    },
  );
}
