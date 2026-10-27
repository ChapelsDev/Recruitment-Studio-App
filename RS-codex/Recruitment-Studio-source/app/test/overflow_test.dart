import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/app_bootstrap.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(loadBundledFonts);

  for (final scenario in [
    ('mobile', const Size(320, 568), 1.0),
    ('mobile large text', const Size(320, 568), 3.0),
    ('desktop', const Size(1440, 900), 1.0),
    ('desktop large text', const Size(1440, 900), 3.0),
    ('short viewport', const Size(320, 120), 3.0),
    ('narrow boundary', const Size(160, 100), 3.0),
  ]) {
    testWidgets('${scenario.$1}: empty B shell fits with real local fonts', (
      tester,
    ) async {
      tester.view.physicalSize = scenario.$2;
      tester.view.devicePixelRatio = 1;
      tester.platformDispatcher.textScaleFactorTestValue = scenario.$3;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
      await tester.pumpWidget(buildApplication());
      await tester.pumpAndSettle();
      expect(
        tester.takeException(),
        isNull,
        reason: 'layout must not overflow',
      );
      expect(find.text('Recrutamento'), findsOneWidget);
      expect(find.text('Criar projeto'), findsOneWidget);
      await tester.ensureVisible(find.byType(FilledButton));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      expect(
        tester.widget<FilledButton>(find.byType(FilledButton)).onPressed,
        isNull,
      );
      expect(
        tester.getSize(find.byType(FilledButton)).height,
        greaterThanOrEqualTo(48),
      );
      final titleSize = tester.getSize(find.text('Recrutamento'));
      expect(titleSize.width, lessThanOrEqualTo(scenario.$2.width));
    });
  }
}
