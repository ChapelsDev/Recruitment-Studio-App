import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/design/editorial_theme.dart';
import 'package:recruitment_studio/features/composition/font_catalog.dart';
import 'package:recruitment_studio/features/editor/editor_shell.dart';
import 'package:recruitment_studio/features/editor/editor_session.dart';
import 'package:recruitment_studio/features/projects/project.dart';
import 'package:recruitment_studio/features/composition/export_format.dart';

import 'guided_ui_test_support.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(FontCatalog.load);

  testWidgets('guided content adds an empty section without published labels', (
    tester,
  ) async {
    final session = EditorSession(Project.blank(id: 'guided_empty'));
    await tester.pumpWidget(
      MaterialApp(
        theme: editorialTheme(),
        home: EditorShell(session: session),
      ),
    );
    await tester.tap(find.byKey(const Key('step-content')));
    await tester.pump();
    await tester.ensureVisible(find.byKey(const Key('add-section')));
    await tester.tap(find.byKey(const Key('add-section')));
    await tester.pump();
    expect(session.project.sections.single.title(AppLocale.ptPT), '');
    expect(session.project.sections.single.items, isEmpty);
    expect(session.project.edition(AppLocale.ptPT).headline, '');
    await tester.pumpWidget(const SizedBox());
    await tester.pump();
    session.dispose();
    expect(tester.takeException(), isNull);
  });
  testWidgets(
    'five guided stages preserve manual content and use accepted language controls',
    (tester) async {
      final rig = GuidedRig();
      await tester.pumpWidget(
        rig.wrap(EditorShell(session: rig.session, controller: rig.host)),
      );
      await tapGuided(tester, 'step-content');
      await tester.enterText(
        find.byKey(const Key('content-headline-pt-PT')),
        'Manual português',
      );
      await tester.pump();
      expect(find.byKey(const Key('step-appearance')), findsOneWidget);
      await tapGuided(tester, 'step-appearance');
      expect(find.byKey(const Key('body-30')), findsOneWidget);
      await tapGuided(tester, 'step-languages');
      await tapGuided(tester, 'enable-en');
      expect(rig.session.project.edition(AppLocale.en).headline, '');
      expect(
        rig.session.project.edition(AppLocale.ptPT).headline,
        'Manual português',
      );
      await tapGuided(tester, 'step-review');
      expect(find.text('Rever'), findsWidgets);
      await tapGuided(tester, 'ui-locale-en');
      await tapGuided(tester, 'step-content');
      expect(
        tester
            .widget<TextField>(find.byKey(const Key('content-headline-en')))
            .controller!
            .text,
        '',
      );
      await tapGuided(tester, 'ui-locale-pt-PT');
      expect(
        tester
            .widget<TextField>(find.byKey(const Key('content-headline-pt-PT')))
            .controller!
            .text,
        'Manual português',
      );
      await tapGuided(tester, 'step-model');
      expect(
        rig.session.project.edition(AppLocale.ptPT).headline,
        'Manual português',
      );
      expect(rig.session.hasUnsavedChanges, isTrue);
      expect(find.text('Guardado'), findsNothing);
      await rig.close(tester);
    },
  );
  testWidgets(
    'desktop parallel preview becomes isolated compact preview with IME and enlarged text',
    (tester) async {
      await tester.binding.setSurfaceSize(const Size(1400, 900));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      final rig = GuidedRig();
      var compact = false;
      Widget app() => MaterialApp(
        theme: editorialTheme(),
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context).copyWith(
            textScaler: TextScaler.linear(compact ? 2 : 1),
            viewInsets: EdgeInsets.only(bottom: compact ? 240 : 0),
          ),
          child: child!,
        ),
        home: EditorShell(session: rig.session, controller: rig.host),
      );
      await tester.pumpWidget(app());
      expect(find.byKey(const Key('desktop-editor')), findsOneWidget);
      expect(find.byKey(const Key('preview-pane')), findsOneWidget);
      await tapGuided(tester, 'step-content');
      await tester.enterText(
        find.byKey(const Key('content-headline-pt-PT')),
        'Título manual longo',
      );
      await tester.pump();
      compact = true;
      await tester.binding.setSurfaceSize(const Size(380, 800));
      await tester.pumpWidget(app());
      expect(find.byKey(const Key('compact-editor')), findsOneWidget);
      expect(find.byKey(const Key('preview-pane')), findsNothing);
      await tester.ensureVisible(
        find.byKey(const Key('content-location-pt-PT')),
      );
      await tester.enterText(
        find.byKey(const Key('content-location-pt-PT')),
        'Localização manual',
      );
      await tester.pump();
      await tapGuided(tester, 'open-preview');
      expect(find.byKey(const Key('preview-pane')), findsOneWidget);
      expect(find.byKey(const Key('content-headline-pt-PT')), findsNothing);
      await tapGuided(tester, 'close-preview');
      expect(
        rig.session.project.edition(AppLocale.ptPT).headline,
        'Título manual longo',
      );
      expect(
        rig.session.project.edition(AppLocale.ptPT).location,
        'Localização manual',
      );
      expect(tester.takeException(), isNull);
      await rig.close(tester);
    },
  );
  testWidgets(
    'glyph correction navigates to the preserved manual field and gives it keyboard focus',
    (tester) async {
      final rig = GuidedRig(
        project: Project.blank(id: 'glyph').withHeadline(AppLocale.ptPT, '😀'),
      );
      await tester.runAsync(() async {
        rig.host.refresh();
        await rig.host.idle;
      });
      await tester.pumpWidget(
        rig.wrap(EditorShell(session: rig.session, controller: rig.host)),
      );
      await tester.pumpAndSettle();
      await tapGuided(tester, 'step-review');
      await tapGuided(tester, 'problem-unsupportedGlyph-headline');
      await tester.pump();
      await tester.pump();
      final input = tester.widget<TextField>(
        find.byKey(const Key('content-headline-pt-PT')),
      );
      expect(input.controller!.text, '😀');
      expect(input.focusNode?.hasFocus, isTrue);
      expect(rig.session.project.edition(AppLocale.ptPT).headline, '😀');
      await rig.close(tester);
    },
  );
  testWidgets(
    'explicit export choices survive correction navigation without following UI locale',
    (tester) async {
      final rig = GuidedRig(
        project: Project.blank(id: 'choices').withLocale(AppLocale.en),
      );
      await tester.pumpWidget(
        rig.wrap(EditorShell(session: rig.session, controller: rig.host)),
      );
      await tapGuided(tester, 'step-review');
      await tapGuided(tester, 'export-locale-en');
      await tapGuided(tester, 'export-format-story');
      await tapGuided(tester, 'step-content');
      await tapGuided(tester, 'ui-locale-en');
      await tapGuided(tester, 'step-review');
      expect(
        tester
            .widget<CheckboxListTile>(find.byKey(const Key('export-locale-en')))
            .value,
        isTrue,
      );
      expect(
        tester
            .widget<CheckboxListTile>(
              find.byKey(const Key('export-format-story')),
            )
            .value,
        isFalse,
      );
      expect(rig.session.project.edition(AppLocale.en).headline, '');
      await rig.close(tester);
    },
  );
  testWidgets(
    'contrast correction navigates to and focuses the bounded colour control',
    (tester) async {
      final rig = GuidedRig(
        project: Project.blank(id: 'contrast')
            .withStyle(ProjectStyle(ink: 0xfff4f1e9)),
      );
      await tester.runAsync(() async {
        rig.host.refresh();
        await rig.host.idle;
      });
      await tester.pumpWidget(
        rig.wrap(EditorShell(session: rig.session, controller: rig.host)),
      );
      await tester.pumpAndSettle();
      await tapGuided(tester, 'step-review');
      await tapGuided(tester, 'problem-lowContrast-ink');
      await tester.pump();
      await tester.pump();
      final input = tester.widget<TextField>(
        find.byKey(const Key('colour-ink')),
      );
      expect(input.focusNode?.hasFocus, isTrue);
      expect(rig.session.project.style.ink, 0xfff4f1e9);
      await rig.close(tester);
    },
  );
  testWidgets(
    'model selects preview format and keeps internal name separate from published title',
    (tester) async {
      final rig = GuidedRig();
      await tester.pumpWidget(
        rig.wrap(EditorShell(session: rig.session, controller: rig.host)),
      );
      expect(find.byKey(const Key('model-format-portrait')), findsOneWidget);
      await tapGuided(tester, 'model-format-portrait');
      expect(rig.host.format, ExportFormat.portrait);
      await tester.enterText(
        find.byKey(const Key('project-name')),
        'Nome interno manual',
      );
      await tester.pump();
      expect(rig.session.project.name, 'Nome interno manual');
      expect(rig.session.project.edition(AppLocale.ptPT).headline, '');
      await rig.close(tester);
    },
  );
  testWidgets(
    'guided toolbar undo reverses an appearance command without losing manual text',
    (tester) async {
      final rig = GuidedRig();
      rig.session.setHeadline(AppLocale.ptPT, 'Manual');
      await tester.pumpWidget(
        rig.wrap(EditorShell(session: rig.session, controller: rig.host)),
      );
      await tapGuided(tester, 'step-appearance');
      await tapGuided(tester, 'body-34');
      expect(rig.session.project.style.bodyPx, 34);
      expect(find.byKey(const Key('editor-undo')), findsOneWidget);
      await tapGuided(tester, 'editor-undo');
      expect(rig.session.project.style.bodyPx, 30);
      expect(rig.session.project.edition(AppLocale.ptPT).headline, 'Manual');
      await rig.close(tester);
    },
  );
}
