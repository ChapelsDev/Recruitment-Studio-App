import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/main.dart' as app;
import 'package:recruitment_studio/app_bootstrap.dart';

import 'continuation01_product_journey_test.dart' show disposeProduct;

void main() {
  setUpAll(loadBundledFonts);
  testWidgets(
    'C18 actual production main on unsupported Linux refuses native persistence with finite retry rather than invented paths',
    (tester) async {
      app.main();
      await tester.pumpAndSettle();
      expect(find.text('Recrutamento'), findsOneWidget);
      expect(
        find.text('Armazenamento privado indisponível — tentar novamente'),
        findsOneWidget,
      );
      expect(
        tester
            .widget<FilledButton>(
              find.widgetWithText(FilledButton, 'Criar projeto'),
            )
            .onPressed,
        isNull,
      );
      expect(
        tester
            .widget<TextButton>(
              find.widgetWithText(TextButton, 'Tentar novamente'),
            )
            .onPressed,
        isNotNull,
      );
      await disposeProduct(tester);
    },
    skip: !Platform.isLinux,
  );
}
