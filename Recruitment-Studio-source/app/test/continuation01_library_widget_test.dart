import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/product_application.dart';
import 'package:recruitment_studio/features/documents/document_gateway.dart';
import 'package:recruitment_studio/features/editor/editor_shell.dart';

import 'features/documents/windows_document_gateway_test.dart'
    show HostIo, HostPicker;
import 'continuation01_product_journey_test.dart' show waitFor, disposeProduct;

void main() {
  testWidgets(
    'C06 library duplicate uses new identity and leave-save plus confirmed own removal preserve external files',
    (tester) async {
      final root = (await tester.runAsync(
        () => Directory.systemTemp.createTemp('c06-library-'),
      ))!;
      final external = File('${root.path}/external.recruitproj');
      final picker = HostPicker(external.path);
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
        await tester.enterText(
          find.byKey(const Key('project-name')),
          'Owned manual draft',
        );
        await tester.pump();
        final original = tester
            .widget<EditorShell>(find.byType(EditorShell))
            .session
            .project
            .id;
        await tester.tap(find.byKey(const Key('product-draft')));
        await tester.pump();
        await waitFor(tester, find.text('Rascunho confirmado'));
        await tester.tap(find.byKey(const Key('product-library')));
        await tester.pump();
        await waitFor(tester, find.byKey(const Key('leave-discard')));
        await tester.tap(find.byKey(const Key('leave-discard')));
        await tester.pump();
        await waitFor(tester, find.byKey(ValueKey('duplicate-$original')));
        await tester.tap(find.byKey(ValueKey('duplicate-$original')));
        await tester.pump();
        await waitFor(tester, find.byType(EditorShell));
        final copy = tester
            .widget<EditorShell>(find.byType(EditorShell))
            .session;
        expect(copy.project.id, isNot(original));
        expect(copy.project.name, 'Owned manual draft');
        await tester.enterText(
          find.byKey(const Key('project-name')),
          'Explicit copy',
        );
        await tester.pump();
        await tester.tap(find.byKey(const Key('product-library')));
        await tester.pump();
        await waitFor(tester, find.byKey(const Key('leave-save')));
        await tester.tap(find.byKey(const Key('leave-save')));
        await tester.pump();
        await waitFor(tester, find.byKey(ValueKey('remove-$original')));
        expect(
          (await tester.runAsync(() => external.readAsBytes()))!,
          isNotEmpty,
        );
        final prior = (await tester.runAsync(() => external.readAsBytes()))!;
        await tester.tap(find.byKey(ValueKey('remove-$original')));
        await tester.pump();
        await waitFor(tester, find.byKey(const Key('remove-cancel')));
        await tester.tap(find.byKey(const Key('remove-cancel')));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 350));
        expect(find.byKey(ValueKey('recover-$original')), findsOneWidget);
        await tester.tap(find.byKey(ValueKey('remove-$original')));
        await tester.pump();
        await waitFor(tester, find.byKey(const Key('remove-confirm')));
        await tester.tap(find.byKey(const Key('remove-confirm')));
        await tester.pump();
        for (
          var i = 0;
          i < 100 &&
              find.byKey(ValueKey('recover-$original')).evaluate().isNotEmpty;
          i++
        ) {
          await tester.runAsync(
            () => Future<void>.delayed(const Duration(milliseconds: 20)),
          );
          await tester.pump(const Duration(milliseconds: 20));
        }
        expect(find.byKey(ValueKey('recover-$original')), findsNothing);
        expect((await tester.runAsync(() => external.readAsBytes()))!, prior);
      } finally {
        await disposeProduct(tester);
        await tester.runAsync(() => root.delete(recursive: true));
      }
    },
  );
}
