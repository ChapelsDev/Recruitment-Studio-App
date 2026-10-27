import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/app_bootstrap.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(loadBundledFonts);
  testWidgets(
    'novo arranque é vazio com criar projeto explicitamente desativado',
    (tester) async {
      await tester.pumpWidget(buildApplication());
      expect(find.text('Recrutamento'), findsOneWidget);
      expect(find.text('Criar projeto'), findsOneWidget);
      expect(find.text('Vaga de teste'), findsNothing);
      expect(find.byType(TextField), findsNothing);
      expect(find.byType(Image), findsNothing);
      expect(find.byType(FloatingActionButton), findsNothing);
      final button = tester.widget<FilledButton>(find.byType(FilledButton));
      expect(button.onPressed, isNull);
      expect(tester.widgetList<Text>(find.byType(Text)).map((t) => t.data), [
        'Recrutamento',
        'Criar projeto',
      ]);
      expect(
        tester.widget<MaterialApp>(find.byType(MaterialApp)).title,
        'Recrutamento',
      );
    },
  );
}
