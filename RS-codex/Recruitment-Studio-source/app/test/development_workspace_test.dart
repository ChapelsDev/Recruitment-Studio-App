import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/development_main.dart';

void main() {
  testWidgets(
    'development workspace creates an empty real project and edits with undo',
    (tester) async {
      tester.view.physicalSize = const Size(1440, 1000);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await tester.pumpWidget(buildDevelopmentApplication());
      expect(find.text('Criar projeto'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('create-project')));
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.byKey(const ValueKey('headline-pt-PT')),
        200,
        scrollable: find
            .descendant(
              of: find.byKey(const ValueKey('content-scroll')),
              matching: find.byType(Scrollable),
            )
            .first,
      );
      final title = find.byKey(const ValueKey('headline-pt-PT'));
      expect(tester.widget<TextField>(title).controller!.text, isEmpty);
      await tester.enterText(title, 'Engenheiro de manutenção');
      await tester.pumpAndSettle();
      expect(
        tester.widget<TextField>(title).controller!.text,
        'Engenheiro de manutenção',
      );
      expect(find.textContaining('Alterações nesta sessão'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('undo')));
      await tester.pumpAndSettle();
      expect(tester.widget<TextField>(title).controller!.text, isEmpty);
      await tester.pumpWidget(const SizedBox());
    },
  );
}
