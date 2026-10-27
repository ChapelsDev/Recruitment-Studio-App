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

Future<void> _edit(WidgetTester tester, String key, String value) async {
  final target = find.byKey(ValueKey(key));
  await tester.ensureVisible(target);
  await tester.enterText(target, value);
  await tester.pumpAndSettle();
}

void _emptyEdition(Project project, AppLocale locale) {
  final edition = project.edition(locale);
  expect(edition.headline, '');
  expect(edition.location, '');
  expect(edition.contacts.keys, unorderedEquals(project.contactIds));
  for (final value in edition.contacts.values) {
    expect(value, '');
  }
}

void main() {
  testWidgets('exactly seven labeled independent Material choices', (
    tester,
  ) async {
    final session = _session();
    addTearDown(session.dispose);
    await tester.pumpWidget(_host(session));
    expect(find.byType(CheckboxListTile), findsNWidgets(7));
    const labels = {
      AppLocale.ptPT: 'Português (Portugal)',
      AppLocale.en: 'English',
      AppLocale.fr: 'Français',
      AppLocale.it: 'Italiano',
      AppLocale.deDE: 'Deutsch (Deutschland)',
      AppLocale.deCH: 'Deutsch (Schweiz)',
      AppLocale.es: 'Español',
    };
    expect(labels.keys, unorderedEquals(AppLocale.values));
    for (final locale in AppLocale.values) {
      final finder = find.byKey(ValueKey('enable-${locale.code}'));
      expect(finder, findsOneWidget);
      final control = tester.widget<CheckboxListTile>(finder);
      expect(control.onChanged, isNotNull);
      expect(control.value, locale == AppLocale.ptPT);
      expect((control.title! as Text).data, labels[locale]);
    }
  });

  testWidgets(
    'English activation is empty and preserves complete PT manifest',
    (tester) async {
      final session = _session();
      addTearDown(session.dispose);
      final before = session.project.edition(AppLocale.ptPT);
      final beforeManifest = session.project.toManifest();
      var changed = 0;
      await tester.pumpWidget(
        _host(
          session,
          onChanged: () {
            changed++;
          },
        ),
      );
      await _tap(tester, 'enable-en');
      _emptyEdition(session.project, AppLocale.en);
      final after = session.project.edition(AppLocale.ptPT);
      expect(after.headline, before.headline);
      expect(after.location, before.location);
      expect(after.contacts, before.contacts);
      final expected = Project.fromManifest(beforeManifest)
          .withLocale(AppLocale.en);
      expect(session.project.toManifest(), expected.toManifest());
      expect(changed, 1);
      expect(session.project.localeOrder, [AppLocale.ptPT, AppLocale.en]);
    },
  );

  testWidgets(
    'French and Italian have independent blank editions without fallback',
    (tester) async {
      final session = _session();
      addTearDown(session.dispose);
      await tester.pumpWidget(_host(session));
      await _tap(tester, 'enable-fr');
      await _tap(tester, 'enable-it');
      _emptyEdition(session.project, AppLocale.fr);
      _emptyEdition(session.project, AppLocale.it);
      await _tap(tester, 'select-fr');
      expect(
        tester
            .widget<TextField>(find.byKey(const ValueKey('headline-fr')))
            .controller!
            .text,
        '',
      );
      await _edit(tester, 'headline-fr', 'Titre manuel');
      await _tap(tester, 'select-it');
      expect(
        tester
            .widget<TextField>(find.byKey(const ValueKey('headline-it')))
            .controller!
            .text,
        '',
      );
      _emptyEdition(session.project, AppLocale.it);
      expect(session.project.edition(AppLocale.fr).headline, 'Titre manuel');
      expect(
        session.project.edition(AppLocale.ptPT).headline,
        'Título manual PT',
      );
    },
  );

  testWidgets(
    'headline location and every contact edit preserve sibling editions',
    (tester) async {
      final session = _session();
      addTearDown(session.dispose);
      final pt = session.project.edition(AppLocale.ptPT);
      await tester.pumpWidget(_host(session));
      await _tap(tester, 'enable-en');
      await _tap(tester, 'enable-es');
      await _tap(tester, 'select-en');
      await _edit(tester, 'headline-en', 'Manual EN');
      await _edit(tester, 'location-en', 'Place EN');
      await _edit(tester, 'contact-en-email', 'Manual EN email');
      await _edit(tester, 'contact-en-phone', 'Manual EN phone');
      final en = session.project.edition(AppLocale.en);
      expect(en.headline, 'Manual EN');
      expect(en.location, 'Place EN');
      expect(en.contacts, {
        'email': 'Manual EN email',
        'phone': 'Manual EN phone',
      });
      _emptyEdition(session.project, AppLocale.es);
      expect(session.project.edition(AppLocale.ptPT).headline, pt.headline);
      expect(session.project.edition(AppLocale.ptPT).location, pt.location);
      expect(session.project.edition(AppLocale.ptPT).contacts, pt.contacts);
      await _tap(tester, 'select-es');
      await _edit(tester, 'headline-es', 'Manual ES');
      await _edit(tester, 'location-es', 'Lugar ES');
      await _edit(tester, 'contact-es-email', 'Manual ES email');
      expect(session.project.edition(AppLocale.en).contacts, en.contacts);
      expect(session.project.edition(AppLocale.en).headline, en.headline);
      expect(session.project.edition(AppLocale.en).location, en.location);
    },
  );

  testWidgets('filled removal is pending and cancellation changes nothing', (
    tester,
  ) async {
    final session = _session();
    addTearDown(session.dispose);
    session.addLocale(AppLocale.en);
    var changed = 0;
    await tester.pumpWidget(
      _host(
        session,
        onChanged: () {
          changed++;
        },
      ),
    );
    final before = session.project.toManifest();
    final generation = session.generation;
    await _tap(tester, 'enable-pt-PT');
    expect(find.byType(AlertDialog), findsOneWidget);
    expect(session.project.toManifest(), before);
    expect(session.generation, generation);
    expect(changed, 0);
    await _tap(tester, 'cancel-remove-locale');
    expect(session.project.toManifest(), before);
    expect(changed, 0);
  });

  testWidgets('filled removal confirmation removes only the selected edition', (
    tester,
  ) async {
    final session = _session();
    addTearDown(session.dispose);
    session.addLocale(AppLocale.en);
    session.setHeadline(AppLocale.en, 'Keep manual EN');
    var changed = 0;
    await tester.pumpWidget(
      _host(
        session,
        onChanged: () {
          changed++;
        },
      ),
    );
    final expected = session.project.withoutLocale(AppLocale.ptPT).toManifest();
    await _tap(tester, 'enable-pt-PT');
    await _tap(tester, 'confirm-remove-locale');
    expect(session.project.toManifest(), expected);
    expect(changed, 1);
    expect(find.byKey(const ValueKey('headline-en')), findsOneWidget);
  });

  testWidgets('empty removal requires no confirmation and no sibling changes', (
    tester,
  ) async {
    final session = _session();
    addTearDown(session.dispose);
    session.addLocale(AppLocale.en);
    final expected = session.project.withoutLocale(AppLocale.en).toManifest();
    var changed = 0;
    await tester.pumpWidget(
      _host(
        session,
        onChanged: () {
          changed++;
        },
      ),
    );
    await _tap(tester, 'enable-en');
    expect(find.byType(AlertDialog), findsNothing);
    expect(session.project.toManifest(), expected);
    expect(changed, 1);
  });

  testWidgets('last language refuses gracefully with no notification', (
    tester,
  ) async {
    final session = _session();
    addTearDown(session.dispose);
    var changed = 0;
    await tester.pumpWidget(
      _host(
        session,
        onChanged: () {
          changed++;
        },
      ),
    );
    final before = session.project.toManifest();
    await _tap(tester, 'enable-pt-PT');
    expect(
      find.text('É necessário manter pelo menos um idioma.'),
      findsOneWidget,
    );
    expect(session.project.toManifest(), before);
    expect(changed, 0);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'stale confirmation preserves intervening live edits and refuses',
    (tester) async {
      final session = _session();
      addTearDown(session.dispose);
      session.addLocale(AppLocale.en);
      var changed = 0;
      await tester.pumpWidget(
        _host(
          session,
          onChanged: () {
            changed++;
          },
        ),
      );
      await _tap(tester, 'enable-pt-PT');
      session.setHeadline(AppLocale.en, 'Live edit while pending');
      final live = session.project.toManifest();
      await _tap(tester, 'confirm-remove-locale');
      expect(session.project.toManifest(), live);
      expect(
        find.text('O projeto mudou. Reveja a remoção do idioma.'),
        findsOneWidget,
      );
      expect(changed, 0);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('caller session survives widget disposal and remains usable', (
    tester,
  ) async {
    final session = _session();
    addTearDown(session.dispose);
    await tester.pumpWidget(_host(session));
    await _tap(tester, 'enable-en');
    await tester.pumpWidget(const SizedBox.shrink());
    expect(session.isDisposed, isFalse);
    session.setHeadline(AppLocale.en, 'Caller still owns session');
    expect(
      session.project.edition(AppLocale.en).headline,
      'Caller still owns session',
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'controller switching and parent rebuilding retain blanks and values',
    (tester) async {
      final session = _session();
      addTearDown(session.dispose);
      await tester.pumpWidget(_host(session));
      await _tap(tester, 'enable-en');
      await _tap(tester, 'select-en');
      final controller = tester
          .widget<TextField>(find.byKey(const ValueKey('headline-en')))
          .controller;
      await _edit(tester, 'headline-en', 'Retain manual EN');
      await _edit(tester, 'location-en', '');
      await _tap(tester, 'select-pt-PT');
      await _tap(tester, 'select-en');
      await tester.pumpWidget(_host(session));
      final field = tester.widget<TextField>(
        find.byKey(const ValueKey('headline-en')),
      );
      expect(field.controller, same(controller));
      expect(field.controller!.text, 'Retain manual EN');
      expect(
        tester
            .widget<TextField>(find.byKey(const ValueKey('location-en')))
            .controller!
            .text,
        '',
      );
      session.setHeadline(AppLocale.en, 'External manual update');
      await tester.pumpWidget(_host(session));
      expect(field.controller!.text, 'External manual update');
      expect(
        session.project.edition(AppLocale.ptPT).headline,
        'Título manual PT',
      );
    },
  );

  testWidgets('onChanged is truthful for edits blanks and unchanged values', (
    tester,
  ) async {
    final session = _session();
    addTearDown(session.dispose);
    var changed = 0;
    await tester.pumpWidget(
      _host(
        session,
        onChanged: () {
          changed++;
        },
      ),
    );
    await _edit(tester, 'headline-pt-PT', 'Título manual PT');
    expect(changed, 0);
    await _edit(tester, 'headline-pt-PT', '');
    expect(changed, 1);
    await _edit(tester, 'headline-pt-PT', '');
    expect(changed, 1);
    await _edit(tester, 'location-pt-PT', 'Novo local');
    expect(changed, 2);
    await _edit(tester, 'contact-pt-PT-email', '');
    expect(changed, 3);
    expect(session.project.edition(AppLocale.ptPT).contacts['email'], '');
  });

  testWidgets('replaced caller session invalidates a pending removal', (
    tester,
  ) async {
    final old = _session();
    final replacement = _session();
    addTearDown(old.dispose);
    addTearDown(replacement.dispose);
    old.addLocale(AppLocale.en);
    var changed = 0;
    await tester.pumpWidget(
      _host(
        old,
        onChanged: () {
          changed++;
        },
      ),
    );
    await _tap(tester, 'enable-pt-PT');
    final before = replacement.project.toManifest();
    await tester.pumpWidget(
      _host(
        replacement,
        onChanged: () {
          changed++;
        },
      ),
    );
    await _tap(tester, 'confirm-remove-locale');
    expect(replacement.project.toManifest(), before);
    expect(old.project.localeOrder, contains(AppLocale.ptPT));
    expect(changed, 0);
    expect(old.isDisposed, isFalse);
    expect(replacement.isDisposed, isFalse);
  });
}
