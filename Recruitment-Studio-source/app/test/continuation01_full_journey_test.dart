import 'dart:io';

import 'package:archive/archive.dart';
import 'package:image/image.dart' as img;
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
    'C14 one real production journey creates manual media profile locales images editable save and reopened ownership',
    (tester) async {
      final root = (await tester.runAsync(
        () => Directory.systemTemp.createTemp('c14-composed-'),
      ))!;
      final picker = HostPicker(
        File('test/fixtures/assets/photo.jpg').absolute.path,
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
        final runtime = tester
            .state<ProductApplicationState>(find.byType(ProductApplication))
            .runtime!;
        final session = runtime.session!, id = session.project.id;
        await tester.enterText(
          find.byKey(const Key('project-name')),
          'Manual hiring',
        );
        await tester.tap(find.byKey(const Key('step-content')));
        await tester.pump();
        await tester.tap(find.byKey(const Key('choose-photo')));
        await tester.pump();
        await waitFor(tester, find.text('Substituir fotografia'));
        await tester.enterText(
          find.byKey(const Key('content-headline-pt-PT')),
          'Manual role',
        );
        await tester.ensureVisible(find.byKey(const Key('product-profile')));
        await tester.tap(find.byKey(const Key('product-profile')));
        await tester.pump();
        await tester.enterText(
          find.byKey(const Key('profile-contact-id')),
          'typed-contact',
        );
        await tester.enterText(
          find.byKey(const Key('profile-contact-value')),
          'typed@example.invalid',
        );
        await tester.tap(find.byKey(const Key('profile-contact-apply')));
        await tester.pump();
        await tester.scrollUntilVisible(
          find.byKey(const Key('profile-save')),
          300,
          scrollable: find.byType(Scrollable).first,
        );
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
          'profile-select-contact-typed-contact',
        ]) {
          await tester.tap(find.byKey(Key(key)));
          await tester.pump();
        }
        await tester.tap(find.byKey(const Key('profile-copy-confirm')));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 350));
        for (var i = 0; i < 100 && runtime.host!.mediaBusy; i++) {
          await tester.runAsync(
            () => Future<void>.delayed(const Duration(milliseconds: 20)),
          );
          await tester.pump(const Duration(milliseconds: 20));
        }
        expect(
          session.project.edition(AppLocale.ptPT).contacts['typed-contact'],
          'typed@example.invalid',
        );
        await tester.tap(find.byKey(const Key('step-languages')));
        await tester.pump();
        await tester.ensureVisible(find.byKey(const Key('enable-en')));
        await tester.tap(find.byKey(const Key('enable-en')));
        await tester.pump();
        expect(session.project.edition(AppLocale.en).headline, '');
        await tester.tap(find.byKey(const Key('step-review')));
        await tester.pump();
        expect(
          tester
              .widget<CheckboxListTile>(
                find.byKey(const Key('export-locale-en')),
              )
              .value,
          isFalse,
        );
        picker.path = '${root.path}/selected.zip';
        await tester.tap(find.byKey(const Key('review-export')));
        await tester.pump();
        await waitFor(tester, find.byKey(const Key('export-options-confirm')));
        await tester.tap(find.byKey(const Key('export-options-confirm')));
        await tester.pump();
        await waitFor(tester, find.byKey(const Key('export-content-confirm')));
        await tester.tap(find.byKey(const Key('export-content-confirm')));
        await tester.pump();
        await waitFor(
          tester,
          find.byKey(const Key('export-destination-confirm')),
        );
        await tester.tap(find.byKey(const Key('export-destination-confirm')));
        await tester.pump();
        await waitFor(tester, find.textContaining('Exportação confirmada'));
        final zip = ZipDecoder().decodeBytes(
          (await tester.runAsync(() => File(picker.path!).readAsBytes()))!,
          verify: true,
        );
        expect(zip.files.length, 3);
        for (final file in zip.files) {
          expect(file.name, startsWith('pt-PT/'));
          expect(file.name, endsWith('.png'));
          final image = img.decodePng(file.content)!;
          expect(image.width, 1080);
          expect(
            image.height,
            file.name.contains('1920')
                ? 1920
                : file.name.contains('1350')
                ? 1350
                : 1080,
          );
        }
        for (var i = 0; i < 100 && runtime.busy; i++) {
          await tester.runAsync(
            () => Future<void>.delayed(const Duration(milliseconds: 20)),
          );
          await tester.pump(const Duration(milliseconds: 20));
        }
        picker.path = '${root.path}/editable.recruitproj';
        await tester.ensureVisible(find.byKey(const Key('product-save')));
        await tester.tap(find.byKey(const Key('product-save')));
        await tester.pump();
        await waitFor(
          tester,
          find.textContaining('Projeto editável confirmado'),
        );
        final evidence = Platform.environment['CONTINUATION_EVIDENCE'];
        if (evidence != null) {
          await tester.runAsync(() async {
            final dir = await Directory('$evidence/composed')
                .create(recursive: true);
            await File('${root.path}/selected.zip')
                .copy('${dir.path}/selected.zip');
            await File(picker.path!).copy('${dir.path}/editable.recruitproj');
          });
        }
        for (var i = 0; i < 100 && runtime.busy; i++) {
          await tester.runAsync(
            () => Future<void>.delayed(const Duration(milliseconds: 20)),
          );
          await tester.pump(const Duration(milliseconds: 20));
        }
        await tester.ensureVisible(find.byKey(const Key('product-library')));
        await tester.tap(find.byKey(const Key('product-library')));
        await tester.pump();
        await waitFor(tester, find.byKey(const Key('library-open')));
        await tester.tap(find.byKey(const Key('library-open')));
        await tester.pump();
        await waitFor(tester, find.byType(EditorShell));
        final reopened = tester
            .widget<EditorShell>(find.byType(EditorShell))
            .session;
        expect(reopened.project.id, id);
        expect(reopened.project.name, 'Manual hiring');
        expect(reopened.project.photo, isNotNull);
        expect(
          reopened.bundle.resources[reopened.project.photo!.id],
          isNotEmpty,
        );
        expect(
          reopened.project.edition(AppLocale.ptPT).contacts['typed-contact'],
          'typed@example.invalid',
        );
        expect(reopened.project.edition(AppLocale.en).headline, '');
        expect(reopened.hasUnsavedChanges, isFalse);
      } finally {
        await disposeProduct(tester);
        await tester.runAsync(() => root.delete(recursive: true));
      }
    },
  );
}
