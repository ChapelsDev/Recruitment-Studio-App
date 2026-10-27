import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/app_bootstrap.dart';
import 'package:recruitment_studio/design/design_tokens.dart';
import 'package:recruitment_studio/design/editorial_theme.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(loadBundledFonts);
  test('Editorial B tokens exactly match the approved local palette', () {
    expect(DesignTokens.background, const Color(0xfff4f1e9));
    expect(DesignTokens.surface, const Color(0xfffffdf7));
    expect(DesignTokens.ink, const Color(0xff173e38));
    expect(DesignTokens.muted, const Color(0xff626b63));
    expect(DesignTokens.accent, const Color(0xff205b50));
    expect(DesignTokens.onAccent, const Color(0xffffffff));
    expect(DesignTokens.border, const Color(0xffd8ddd4));
    expect(DesignTokens.fontBody, 'DM Sans');
    expect(DesignTokens.fontDisplay, 'DM Serif Display');
    expect(DesignTokens.radius, 8);
  });

  test('B theme preserves functional colors, typography and 8px controls', () {
    final theme = editorialTheme();
    expect(theme.brightness, Brightness.light);
    expect(theme.scaffoldBackgroundColor, DesignTokens.background);
    expect(theme.colorScheme.surface, DesignTokens.surface);
    expect(theme.colorScheme.onSurface, DesignTokens.ink);
    expect(theme.colorScheme.onSurfaceVariant, DesignTokens.muted);
    expect(theme.colorScheme.primary, DesignTokens.accent);
    expect(theme.colorScheme.onPrimary, DesignTokens.onAccent);
    expect(theme.colorScheme.outline, DesignTokens.border);
    expect(theme.textTheme.bodyMedium!.fontFamily, DesignTokens.fontBody);
    expect(theme.textTheme.headlineLarge!.fontFamily, DesignTokens.fontDisplay);
    expect(theme.textTheme.headlineLarge!.fontWeight, FontWeight.w400);
    final style = theme.filledButtonTheme.style!;
    expect(
      style.shape!.resolve({}),
      const RoundedRectangleBorder(
        borderRadius: BorderRadius.all(Radius.circular(8)),
      ),
    );
    expect(style.backgroundColor!.resolve({}), DesignTokens.accent);
    expect(style.foregroundColor!.resolve({}), DesignTokens.onAccent);
    expect(style.minimumSize!.resolve({})!.height, greaterThanOrEqualTo(48));
  });

  testWidgets('bootstrap uses Editorial B rather than Flutter defaults', (
    tester,
  ) async {
    await tester.pumpWidget(buildApplication());
    final app = tester.widget<MaterialApp>(find.byType(MaterialApp));
    expect(app.theme!.scaffoldBackgroundColor, DesignTokens.background);
    expect(app.debugShowCheckedModeBanner, isFalse);
    final title = tester.widget<Text>(find.text('Recrutamento'));
    expect(title.style!.fontFamily, DesignTokens.fontDisplay);
  });
}
