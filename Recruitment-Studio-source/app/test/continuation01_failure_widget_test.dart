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
    'C09 failed external open and readback save keep the actual manual draft and captured generation',
    (tester) async {
      final root = (await tester.runAsync(
        () => Directory.systemTemp.createTemp('c09-failure-'),
      ))!;
      final broken = File('${root.path}/broken.recruitproj');
      await tester.runAsync(() => broken.writeAsBytes([1, 2, 3, 4]));
      final picker = HostPicker(broken.path), io = HostIo();
      try {
        await tester.pumpWidget(
          buildFunctionalApplication(
            privateDirectory: root,
            gatewayFactory: (stage, budget) => WindowsDocumentGateway(
              picker: picker,
              io: io,
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
          'Preserved manual draft',
        );
        await tester.pump();
        final session = tester
            .widget<EditorShell>(find.byType(EditorShell))
            .session;
        final generation = session.generation;
        await tester.tap(find.byKey(const Key('product-draft')));
        await tester.pump();
        await waitFor(tester, find.text('Rascunho confirmado'));
        await waitFor(tester, find.byKey(const Key('product-open')));
        await tester.ensureVisible(find.byKey(const Key('product-open')));
        await tester.tap(find.byKey(const Key('product-open')));
        await tester.pump();
        await waitFor(tester, find.byKey(const Key('leave-discard')));
        await tester.tap(find.byKey(const Key('leave-discard')));
        await tester.pump();
        await waitFor(tester, find.textContaining('Operação não confirmada'));
        expect(
          tester.widget<EditorShell>(find.byType(EditorShell)).session,
          same(session),
        );
        expect(session.project.name, 'Preserved manual draft');
        expect(session.generation, generation);
        expect(session.hasUnsavedChanges, isTrue);
        io.corrupt = true;
        picker.path = '${root.path}/corrupted.recruitproj';
        await tester.ensureVisible(find.byKey(const Key('product-save')));
        await tester.tap(find.byKey(const Key('product-save')));
        await tester.pump();
        await waitFor(
          tester,
          find.textContaining('Ficheiro residual possível'),
        );
        expect(session.project.name, 'Preserved manual draft');
        expect(session.generation, generation);
        expect(session.hasUnsavedChanges, isTrue);
        expect(session.hasConfirmedProjectSave, isFalse);
        final runtime = tester
            .state<ProductApplicationState>(find.byType(ProductApplication))
            .runtime!;
        final recovered = (await tester.runAsync(
          () => runtime.library.recover(session.project.id),
        ))!;
        expect(recovered.project.name, 'Preserved manual draft');
        recovered.dispose();
        expect(
          (await tester.runAsync(() => File(picker.path!).readAsBytes()))!,
          [4, 3, 2, 1],
        );
      } finally {
        await disposeProduct(tester);
        await tester.runAsync(() => root.delete(recursive: true));
      }
    },
  );
}
