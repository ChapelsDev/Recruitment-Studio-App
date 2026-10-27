import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/product_application.dart';
import 'package:recruitment_studio/features/documents/document_gateway.dart';
import 'package:recruitment_studio/features/editor/editor_shell.dart';
import 'package:recruitment_studio/features/projects/project.dart';

import 'features/documents/windows_document_gateway_test.dart'
    show HostIo, HostPicker;
import 'continuation01_product_journey_test.dart' show waitFor, disposeProduct;

void main() {
  testWidgets(
    'C04 profile starts empty and copies only explicit typed elements and locale without invented translations',
    (tester) async {
      final root = (await tester.runAsync(
        () => Directory.systemTemp.createTemp('c04-profile-'),
      ))!;
      final picker = HostPicker(
        File('test/fixtures/assets/logo.png').absolute.path,
      );
      try {
        await tester.pumpWidget(
          buildFunctionalApplication(
            privateDirectory: root,
            gatewayFactory: (stage, budget) => WindowsDocumentGateway(
              picker: picker,
              io: HostIo(),
              stagingDirectory: stage,
              budget: budget,
            ),
          ),
        );
        await waitFor(tester, find.byKey(const Key('library-create')));
        await tester.tap(find.text('Criar projeto'));
        await tester.pump();
        final session = tester
            .widget<EditorShell>(find.byType(EditorShell))
            .session;
        await tester.tap(find.byKey(const Key('step-languages')));
        await tester.pump();
        await tester.ensureVisible(find.byKey(const Key('enable-de-DE')));
        await tester.tap(find.byKey(const Key('enable-de-DE')));
        await tester.pump();
        await waitFor(tester, find.byKey(const Key('product-profile')));
        await tester.ensureVisible(find.byKey(const Key('product-profile')));
        await tester.tap(find.byKey(const Key('product-profile')));
        await tester.pump();
        await waitFor(tester, find.byKey(const Key('profile-contact-id')));
        final runtime = tester
            .state<ProductApplicationState>(find.byType(ProductApplication))
            .runtime!;
        expect(runtime.profile.draft.contacts, isEmpty);
        expect(runtime.profile.draft.colours, isEmpty);
        expect(runtime.profile.draft.logo, isNull);
        await tester.enterText(
          find.byKey(const Key('profile-contact-id')),
          'manual-contact',
        );
        await tester.enterText(
          find.byKey(const Key('profile-contact-value')),
          'typed@example.invalid',
        );
        await tester.tap(find.byKey(const Key('profile-contact-apply')));
        await tester.pump();
        await tester.enterText(
          find.byKey(const Key('profile-colour-value')),
          'FF123456',
        );
        await tester.ensureVisible(
          find.byKey(const Key('profile-colour-apply')),
        );
        await tester.tap(find.byKey(const Key('profile-colour-apply')));
        await tester.pump();
        await tester.ensureVisible(find.byKey(const Key('profile-logo')));
        await tester.tap(find.byKey(const Key('profile-logo')));
        await tester.pump();
        await waitFor(tester, find.text('Logótipo manual disponível'));
        await tester.ensureVisible(find.byKey(const Key('profile-save')));
        for (var i = 0; i < 100 && runtime.busy; i++) {
          await tester.runAsync(
            () => Future<void>.delayed(const Duration(milliseconds: 20)),
          );
          await tester.pump(const Duration(milliseconds: 20));
        }
        expect(runtime.busy, isFalse);
        await tester.tap(find.byKey(const Key('profile-save')));
        await tester.pump();
        await waitFor(tester, find.text('Perfil confirmado'));
        await tester.tap(find.byKey(const Key('profile-back')));
        await tester.pump();
        await tester.ensureVisible(
          find.byKey(const Key('product-apply-profile')),
        );
        await tester.tap(find.byKey(const Key('product-apply-profile')));
        await tester.pump();
        await waitFor(tester, find.byKey(const Key('profile-select-pt-PT')));
        for (final key in [
          'profile-select-pt-PT',
          'profile-select-contact-manual-contact',
          'profile-select-colour-accent',
          'profile-select-logo',
        ]) {
          await tester.ensureVisible(find.byKey(Key(key)));
          await tester.tap(find.byKey(Key(key)));
          await tester.pump();
        }
        await tester.tap(find.byKey(const Key('profile-copy-confirm')));
        await tester.pump();
        for (var i = 0; i < 100 && session.project.logo == null; i++) {
          await tester.runAsync(
            () => Future<void>.delayed(const Duration(milliseconds: 20)),
          );
          await tester.pump(const Duration(milliseconds: 20));
        }
        expect(session.project.logo, isNotNull);
        expect(session.project.style.accent, 0xff123456);
        expect(
          session.project.edition(AppLocale.ptPT).contacts['manual-contact'],
          'typed@example.invalid',
        );
        expect(
          session.project.edition(AppLocale.deDE).contacts['manual-contact'],
          '',
        );
        expect(session.project.edition(AppLocale.deDE).headline, '');
        expect(session.project.edition(AppLocale.ptPT).headline, '');
        expect(session.bundle.resources[session.project.logo!.id], isNotEmpty);
      } finally {
        await disposeProduct(tester);
        await tester.runAsync(() => root.delete(recursive: true));
      }
    },
  );
}
