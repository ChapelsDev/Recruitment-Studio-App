import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/product_application.dart';
import 'package:recruitment_studio/features/documents/document_gateway.dart';
import 'package:recruitment_studio/features/editor/editor_shell.dart';
import 'package:recruitment_studio/features/storage/project_codec.dart';
import 'package:recruitment_studio/features/projects/project.dart';
import 'package:recruitment_studio/shared/work_budget.dart';

import 'features/documents/windows_document_gateway_test.dart'
    show HostIo, HostPicker;
import 'continuation01_product_journey_test.dart' show waitFor, disposeProduct;

void main() {
  testWidgets(
    'C02 manual photo and content save a verified editable file and reopen through production UI',
    (tester) async {
      final root = (await tester.runAsync(
        () => Directory.systemTemp.createTemp('c02-save-'),
      ))!;
      final picker = HostPicker(
        File('test/fixtures/assets/photo.jpg').absolute.path,
      );
      final io = HostIo();
      final budget = WorkBudgetController();
      try {
        await tester.pumpWidget(
          buildFunctionalApplication(
            privateDirectory: root,
            gatewayFactory: (stage, domain) => WindowsDocumentGateway(
              picker: picker,
              io: io,
              stagingDirectory: stage,
              budget: domain,
            ),
          ),
        );
        await waitFor(tester, find.byKey(const Key('library-create')));
        await tester.tap(find.text('Criar projeto'));
        await tester.pump();
        await tester.enterText(
          find.byKey(const Key('project-name')),
          'Manual hiring',
        );
        await tester.tap(find.byKey(const Key('step-content')));
        await tester.pump();
        final photo = tester.widget<TextButton>(
          find.byKey(const Key('choose-photo')),
        );
        expect(
          photo.onPressed,
          isNotNull,
          reason: 'Photo acquisition must reach actual owned staging',
        );
        await tester.tap(find.byKey(const Key('choose-photo')));
        await tester.pump();
        await waitFor(tester, find.text('Substituir fotografia'));
        await tester.enterText(
          find.byKey(const Key('content-headline-pt-PT')),
          'Manual role',
        );
        await tester.ensureVisible(find.byKey(const Key('add-contact')));
        await tester.tap(find.byKey(const Key('add-contact')));
        await tester.pump();
        await tester.enterText(
          find.byKey(const Key('content-contact-c1-pt-PT')),
          'manual@example.invalid',
        );
        final before = tester
            .widget<EditorShell>(find.byType(EditorShell))
            .session;
        final id = before.project.id;
        picker.path = '${root.path}/chosen.recruitproj';
        await tester.tap(find.byKey(const Key('product-save')));
        await tester.pump();
        await waitFor(
          tester,
          find.textContaining('Projeto editável confirmado'),
        );
        expect(before.hasUnsavedChanges, isFalse);
        expect(before.hasConfirmedProjectSave, isTrue);
        final decoded = (await tester.runAsync(
          () =>
              ZipProjectCodec(budget: budget)
                  .decodeEditorSession(File(picker.path!)),
        ))!;
        expect(decoded.project.id, id);
        expect(decoded.project.edition(AppLocale.ptPT).headline, 'Manual role');
        expect(decoded.project.photo, isNotNull);
        decoded.dispose();
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
        expect(
          reopened.project.edition(AppLocale.ptPT).headline,
          'Manual role',
        );
        expect(reopened.bundle.resources.values.first, isNotEmpty);
        expect(reopened.hasUnsavedChanges, isFalse);
      } finally {
        await disposeProduct(tester);
        await tester.runAsync(() => root.delete(recursive: true));
      }
      expect(budget.reservedBytes, 0);
    },
  );
}
