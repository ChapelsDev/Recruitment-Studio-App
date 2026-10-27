import 'package:flutter/material.dart';

import 'design_tokens.dart';

ThemeData editorialTheme() {
  final base = ThemeData(
    useMaterial3: true,
    brightness: Brightness.light,
    fontFamily: DesignTokens.fontBody,
    scaffoldBackgroundColor: DesignTokens.background,
    colorScheme: const ColorScheme.light(
      primary: DesignTokens.accent,
      onPrimary: DesignTokens.onAccent,
      surface: DesignTokens.surface,
      onSurface: DesignTokens.ink,
      onSurfaceVariant: DesignTokens.muted,
      outline: DesignTokens.border,
    ),
  );
  return base.copyWith(
    textTheme: base.textTheme.copyWith(
      headlineLarge: base.textTheme.headlineLarge!.copyWith(
        fontFamily: DesignTokens.fontDisplay,
        fontWeight: FontWeight.w400,
        color: DesignTokens.ink,
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: DesignTokens.accent,
        foregroundColor: DesignTokens.onAccent,
        minimumSize: const Size(48, 48),
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.all(Radius.circular(DesignTokens.radius)),
        ),
      ),
    ),
  );
}
