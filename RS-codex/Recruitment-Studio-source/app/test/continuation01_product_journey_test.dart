import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/app_bootstrap.dart';
import 'package:recruitment_studio/product_application.dart';
import 'package:recruitment_studio/features/documents/document_gateway.dart';

import 'features/documents/windows_document_gateway_test.dart'
    show HostIo, HostPicker;

Future<void> waitFor(WidgetTester tester, Finder finder) async {
  for (var i = 0; i < 100; i++) {
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 20)),
    );
    await tester.pump(const Duration(milliseconds: 20));
    if (finder.evaluate().isNotEmpty) return;
  }
  expect(finder, findsWidgets);
}

Future<void> disposeProduct(WidgetTester tester) async {
  final runtime = tester
      .state<ProductApplicationState>(find.byType(ProductApplication))
      .runtime;
  final closing = runtime?.close();
  var done = closing == null;
  Object? failure;
  closing?.then(
    (_) => done = true,
    onError: (Object e) {
      failure = e;
      done = true;
    },
  );
  await tester.pumpWidget(const SizedBox());
  for (var i = 0; i < 200 && !done; i++) {
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 20)),
    );
    await tester.pump(const Duration(milliseconds: 20));
  }
  expect(
    done,
    isTrue,
    reason: 'Join actual product drain before deleting private fixture files',
  );
  expect(failure, isNull);
  await closing;
  await tester.pump();
  expect(
    runtime?.budget.reservedBytes ?? 0,
    0,
    reason: 'Actual production budget domain has no retained owned buffers after drain',
  );
}

void main() {
  setUpAll(loadBundledFonts);
  testWidgets(
    'C01 production library Create reaches manual editor and real draft recovery',
    (tester) async {
      final root = (await tester.runAsync(
        () => Directory.systemTemp.createTemp('c01-widget-'),
      ))!;
      final picker = HostPicker(null);
      Widget app() => buildFunctionalApplication(
        privateDirectory: root,
        gatewayFactory: (stage, budget) => WindowsDocumentGateway(
          picker: picker,
          io: HostIo(),
          stagingDirectory: stage,
          budget: budget,
        ),
      );
      try {
        await tester.pumpWidget(app());
        await waitFor(tester, find.byKey(const Key('library-create')));
        final button = tester.widget<FilledButton>(
          find.widgetWithText(FilledButton, 'Criar projeto'),
        );
        expect(
          button.onPressed,
          isNotNull,
          reason: 'Production library must enable Create, not legacy shell',
        );
        await tester.tap(find.text('Criar projeto'));
        await tester.pump();
        await waitFor(tester, find.byKey(const Key('project-name')));
        await tester.enterText(
          find.byKey(const Key('project-name')),
          'Manual only',
        );
        await tester.pump();
        await tester.tap(find.byKey(const Key('product-draft')));
        await tester.pump();
        await waitFor(tester, find.text('Rascunho confirmado'));
        await tester.tap(find.byKey(const Key('product-library')));
        await tester.pump();
        await waitFor(tester, find.text('Continuar edição'));
        await tester.tap(find.text('Continuar edição'));
        await tester.pump();
        await waitFor(tester, find.byKey(const Key('project-name')));
        expect(
          tester
              .widget<TextField>(find.byKey(const Key('project-name')))
              .controller!
              .text,
          'Manual only',
        );
        await tester.tap(find.byKey(const Key('product-library')));
        await tester.pump();
        await waitFor(tester, find.byKey(const Key('leave-discard')));
        await tester.tap(find.byKey(const Key('leave-discard')));
        await tester.pump();
        await waitFor(tester, find.text('Recuperar'));
        expect(find.text('Manual only'), findsOneWidget);
        await tester.tap(find.text('Recuperar'));
        await tester.pump();
        await waitFor(tester, find.byKey(const Key('project-name')));
        expect(
          tester
              .widget<TextField>(find.byKey(const Key('project-name')))
              .controller!
              .text,
          'Manual only',
        );
      } finally {
        await disposeProduct(tester);
        await tester.runAsync(() => root.delete(recursive: true));
      }
    },
  );
}
