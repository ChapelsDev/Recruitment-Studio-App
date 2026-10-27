import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/design/editorial_theme.dart';
import 'package:recruitment_studio/features/editor/editor_session.dart';
import 'package:recruitment_studio/features/editor/languages_step.dart';
import 'package:recruitment_studio/features/projects/project.dart';

EditorSession _session() => EditorSession(
  Project.blank(id: 'manual-languages-fixture')
      .withHeadline(AppLocale.ptPT, 'Título manual PT')
      .withLocation(AppLocale.ptPT, 'Local manual PT')
      .withContact(AppLocale.ptPT, 'email', 'contacto manual PT')
      .withContact(AppLocale.ptPT, 'phone', 'telefone manual PT'),
);

Widget _host(EditorSession session, {VoidCallback? onChanged}) => MaterialApp(
  theme: editorialTheme(),
  home: Scaffold(
    body: LanguagesStep(
      key: const ValueKey('languages-step'),
      session: session,
      onChanged: onChanged,
    ),
  ),
);

Future<void> _tap(WidgetTester tester, String key) async {
  final target = find.byKey(ValueKey(key));
  await tester.ensureVisible(target);
  await tester.tap(target);
  await tester.pumpAndSettle();
}

void main() {
  for (final content in [
    'hidden-title',
    'hidden-item',
    'contact',
    'whitespace',
  ]) {
    testWidgets(
      '$content requires confirmation and cancel preserves all content',
      (tester) async {
        final session = _session();
        addTearDown(session.dispose);
        session.addLocale(AppLocale.en);
        session.addSection('removal-control-section');
        session.addItem('removal-control-section', 'removal-control-item');
        final sectionId = session.project.sections.first.id;
        final itemId = session.project.sections.first.items.first.id;
        final contactId = session.project.contactIds.first;
        session.setSectionVisible(sectionId, false);
        switch (content) {
          case 'hidden-title':
            session.setSectionTitle(
              AppLocale.en,
              sectionId,
              'Manual hidden title',
            );
          case 'hidden-item':
            session.setItemText(
              AppLocale.en,
              sectionId,
              itemId,
              'Manual hidden body',
            );
          case 'contact':
            session.setContact(AppLocale.en, contactId, 'Manual contact');
          case 'whitespace':
            session.setContact(AppLocale.en, contactId, ' \t\n ');
        }
        expect(session.project.edition(AppLocale.en).headline, isEmpty);
        expect(session.project.edition(AppLocale.en).location, isEmpty);
        expect(session.project.sections.first.visible, isFalse);
        final before = session.project.toManifest();
        final generation = session.generation;
        var notifications = 0;
        await tester.pumpWidget(
          _host(session, onChanged: () => notifications++),
        );
        await _tap(tester, 'enable-en');
        expect(tester.takeException(), isNull);
        expect(find.byType(AlertDialog), findsOneWidget);
        expect(session.project.toManifest(), before);
        expect(session.generation, generation);
        expect(notifications, 0);
        await _tap(tester, 'cancel-remove-locale');
        expect(find.byType(AlertDialog), findsNothing);
        expect(tester.takeException(), isNull);
        expect(session.project.toManifest(), before);
        expect(session.generation, generation);
        expect(notifications, 0);
        await tester.pumpWidget(const SizedBox.shrink());
      },
    );
  }
}
