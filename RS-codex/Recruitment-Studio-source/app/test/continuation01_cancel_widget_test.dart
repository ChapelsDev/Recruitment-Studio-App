import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/product_application.dart';
import 'package:recruitment_studio/features/documents/document_gateway.dart';
import 'package:recruitment_studio/features/editor/editor_shell.dart';

import 'continuation01_runtime_drain_test.dart' show GatedPicker;
import 'features/documents/windows_document_gateway_test.dart' show HostIo;
import 'continuation01_product_journey_test.dart' show waitFor, disposeProduct;

void main() {
  testWidgets(
    'C17 reachable Cancel stops an actual native save without retiring the manual draft',
    (tester) async {
      final root = (await tester.runAsync(
        () => Directory.systemTemp.createTemp('c17-cancel-ui-'),
      ))!;
      final picker = GatedPicker('${root.path}/chosen.recruitproj');
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
          'Manual cancellation draft',
        );
        await tester.pump();
        final session = tester
                .widget<EditorShell>(find.byType(EditorShell))
                .session,
            generation = tester
                .widget<EditorShell>(find.byType(EditorShell))
                .session
                .generation;
        await tester.ensureVisible(find.byKey(const Key('product-save')));
        await tester.tap(find.byKey(const Key('product-save')));
        await tester.pump();
        await tester.runAsync(() => picker.entered.future);
        await waitFor(tester, find.byKey(const Key('product-cancel')));
        await tester.tap(find.byKey(const Key('product-cancel')));
        await tester.pump();
        picker.release.complete();
        await waitFor(tester, find.textContaining('Operação cancelada'));
        expect(session.project.name, 'Manual cancellation draft');
        expect(session.generation, generation);
        expect(session.hasUnsavedChanges, isTrue);
        expect(
          (await tester.runAsync(() => File(picker.path).exists()))!,
          isFalse,
        );
      } finally {
        if (!picker.release.isCompleted) picker.release.complete();
        await disposeProduct(tester);
        await tester.runAsync(() => root.delete(recursive: true));
      }
    },
  );
}
