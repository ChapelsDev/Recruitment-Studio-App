import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'design/design_tokens.dart';

import 'design/editorial_theme.dart';

/// T00 bootstrap only: project creation awaits the session controller.
Widget buildApplication() => MaterialApp(
  title: 'Recrutamento',
  debugShowCheckedModeBanner: false,
  theme: editorialTheme(),
  home: const _EmptyShell(),
);

/// Load the same local faces registered in pubspec for host widget tests.
/// Flutter's native asset font registration remains the application runtime path.
/// Errors propagate; no network source or silent recovery is provided.
Future<void> loadBundledFonts({AssetBundle? bundle}) async {
  final source = bundle ?? rootBundle;
  const families = {
    DesignTokens.fontBody: [
      'DM-Sans-400.ttf',
      'DM-Sans-500.ttf',
      'DM-Sans-600.ttf',
      'DM-Sans-700.ttf',
    ],
    DesignTokens.fontDisplay: ['DM-Serif-Display-400.ttf'],
  };
  for (final family in families.entries) {
    final loader = FontLoader(family.key);
    for (final filename in family.value) {
      final bytes = await source.load('assets/fonts/$filename');
      loader.addFont(Future.value(bytes));
    }
    await loader.load();
  }
}

class _EmptyShell extends StatelessWidget {
  const _EmptyShell();

  @override
  Widget build(BuildContext context) => Scaffold(
    body: SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Align(
          alignment: Alignment.topLeft,
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 1120),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Recrutamento',
                  style: Theme.of(context).textTheme.headlineLarge,
                ),
                const SizedBox(height: 24),
                const FilledButton(
                  onPressed: null,
                  child: Text('Criar projeto'),
                ),
              ],
            ),
          ),
        ),
      ),
    ),
  );
}
