import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/features/composition/font_catalog.dart';
import 'package:recruitment_studio/features/editor/editor_shell.dart';
import 'package:recruitment_studio/features/projects/project.dart';

import 'guided_ui_test_support.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(FontCatalog.load);

  testWidgets(
    'removing and reactivating a filled language does not resurrect an export choice',
    (tester) async {
      final rig = GuidedRig(
        project: Project.blank(id: 'languages').withLocale(AppLocale.fr),
      );
      rig.session.setHeadline(AppLocale.ptPT, 'Português manual');
      rig.session.addSection('s1');
      rig.session.setSectionTitle(AppLocale.fr, 's1', 'Titre manuel');
      await tester.pumpWidget(
        rig.wrap(EditorShell(session: rig.session, controller: rig.host)),
      );
      await tapGuided(tester, 'step-review');
      await tapGuided(tester, 'export-locale-fr');
      await tapGuided(tester, 'step-languages');
      await tapGuided(tester, 'enable-fr');
      expect(find.byKey(const Key('confirm-remove-locale')), findsOneWidget);
      await tapGuided(tester, 'cancel-remove-locale');
      await tester.pumpAndSettle();
      expect(
        rig.session.project.sections.single.title(AppLocale.fr),
        'Titre manuel',
      );
      await tapGuided(tester, 'enable-fr');
      await tapGuided(tester, 'confirm-remove-locale');
      await tester.pumpAndSettle();
      expect(rig.session.project.localeOrder, [AppLocale.ptPT]);
      expect(
        rig.session.project.edition(AppLocale.ptPT).headline,
        'Português manual',
      );
      await tapGuided(tester, 'enable-fr');
      await tapGuided(tester, 'step-review');
      expect(rig.session.project.edition(AppLocale.fr).headline, '');
      expect(rig.session.project.sections.single.title(AppLocale.fr), '');
      expect(
        tester
            .widget<CheckboxListTile>(find.byKey(const Key('export-locale-fr')))
            .value,
        isFalse,
      );
      await rig.close(tester);
    },
  );
}
