import 'package:flutter/material.dart';

import 'design/design_tokens.dart';
import 'design/editorial_theme.dart';
import 'features/editor/editor_session.dart';
import 'features/editor/languages_step.dart';
import 'features/projects/project.dart';

/// First playable development entrypoint. Does not replace the final native
/// bootstrap or imply Windows/Android acceptance.
Widget buildDevelopmentApplication() => MaterialApp(
  title: 'Editorial B — desenvolvimento',
  debugShowCheckedModeBanner: false,
  theme: editorialTheme(),
  home: const DevelopmentWorkspace(),
);

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(buildDevelopmentApplication());
}

class DevelopmentWorkspace extends StatefulWidget {
  const DevelopmentWorkspace({super.key});

  @override
  State<DevelopmentWorkspace> createState() => _DevelopmentWorkspaceState();
}

class _DevelopmentWorkspaceState extends State<DevelopmentWorkspace> {
  EditorSession? _session;

  void _create() {
    setState(() {
      _session = EditorSession(
        Project.blank(id: 'draft-${DateTime.now().microsecondsSinceEpoch}'),
      );
    });
  }

  @override
  void dispose() {
    _session?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final session = _session;
    final text = Theme.of(context).textTheme;
    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 20),
              decoration: const BoxDecoration(
                border: Border(bottom: BorderSide(color: DesignTokens.border)),
              ),
              child: Row(
                children: [
                  const Icon(Icons.edit_note, size: 34),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Editorial B', style: text.headlineMedium),
                        Text(
                          'ESTÚDIO DE RECRUTAMENTO · VERSÃO DE DESENVOLVIMENTO',
                          style: text.labelSmall,
                        ),
                      ],
                    ),
                  ),
                  if (session != null)
                    IconButton(
                      key: const ValueKey('undo'),
                      tooltip: 'Desfazer',
                      onPressed: session.canUndo
                          ? () => setState(session.undo)
                          : null,
                      icon: const Icon(Icons.undo),
                    ),
                ],
              ),
            ),
            if (session == null)
              Expanded(
                child: Center(
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 680),
                    child: Padding(
                      padding: const EdgeInsets.all(32),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Uma oportunidade.\nSete vozes.',
                            style: text.displayLarge,
                          ),
                          const SizedBox(height: 20),
                          Text(
                            'Crie o seu anúncio com edições manuais e independentes. O projeto começa vazio.',
                            style: text.bodyLarge,
                          ),
                          const SizedBox(height: 32),
                          FilledButton.icon(
                            key: const ValueKey('create-project'),
                            onPressed: _create,
                            icon: const Icon(Icons.add),
                            label: const Text('Criar projeto'),
                          ),
                          const SizedBox(height: 20),
                          const Text(
                            'Prévia de desenvolvimento. Não é ainda a entrega final Windows/Android.',
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              )
            else ...[
              Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: 28,
                  vertical: 12,
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(session.project.name, style: text.titleLarge),
                    ),
                    Text(
                      session.hasUnsavedChanges
                          ? 'Alterações nesta sessão · ainda não guardadas'
                          : 'Projeto vazio · ainda não guardado',
                      style: text.labelMedium,
                    ),
                  ],
                ),
              ),
              Expanded(
                child: LanguagesStep(
                  key: const ValueKey('content-scroll'),
                  session: session,
                  onChanged: () => setState(() {}),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
