import 'dart:async';

import 'package:flutter/material.dart';

import '../../design/design_tokens.dart';
import '../../shared/admission_budget.dart';
import '../../shared/problem.dart';
import 'editor_controls.dart';
import '../composition/export_format.dart';
import '../projects/project.dart';
import 'preview_owner.dart';
import 'appearance_step.dart';
import 'content_step.dart';
import 'editor_host_controller.dart';
import 'editor_session.dart';
import 'languages_step.dart';
import 'review_step.dart';

enum GuidedEditorStage { model, content, appearance, languages, review }

/// Guided component, not a runtime entrypoint. Caller always owns the session.
/// An injected host remains caller-owned; an internally created host is drained
/// on unmount. Fonts must be loaded before mounting (FontCatalog.load).
class EditorShell extends StatefulWidget {
  const EditorShell({
    super.key,
    required this.session,
    this.controller,
    this.onExport,
  });
  final Future<void> Function(List<AppLocale>, List<ExportFormat>)? onExport;
  final EditorSession session;
  final EditorHostController? controller;

  @override
  State<EditorShell> createState() => _EditorShellState();
}

class _EditorShellState extends State<EditorShell> {
  late EditorHostController _host;
  bool _owned = false, _attached = false;
  AdmissionTicket? _credit;
  List<bool> _exportLocales = const [], _exportFormats = const [];
  GuidedEditorStage _stage = GuidedEditorStage.model;
  bool _previewOpen = false, _storyGuides = false;
  Problem? _focusProblem;
  int _focusRequest = 0;
  late GlobalKey _previewKey;
  static const _labels = ['Modelo', 'Conteúdo', 'Aspeto', 'Idiomas', 'Rever'];

  @override
  void initState() {
    super.initState();
    try {
      _credit = AdmissionBudget.shared.reserve(64 * 1024);
      _previewKey = GlobalKey();
      _attach();
    } on CapacityExceeded {
      _credit?.release();
      _credit = null;
    }
  }

  void _attach() {
    _host =
        widget.controller ?? EditorHostController.production(widget.session);
    _owned = widget.controller == null;
    if (!identical(_host.session, widget.session)) {
      throw ArgumentError('Host and shell must use the same session');
    }
    _attached = true;
    _exportLocales = List.filled(AppLocale.values.length, false);
    _exportLocales[_host.locale.index] = true;
    _exportFormats = List.filled(ExportFormat.values.length, true);
    _host.refresh();
  }

  @override
  void didUpdateWidget(covariant EditorShell oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (_credit == null) return;
    if (!identical(widget.session, oldWidget.session) ||
        !identical(widget.controller, oldWidget.controller)) {
      if (_owned) _host.dispose();
      _stage = GuidedEditorStage.model;
      _attach();
    }
  }

  @override
  void dispose() {
    if (_attached && _owned) {
      _host.dispose();
      unawaited(_host.closed);
    }
    _focusProblem = null;
    _exportLocales = const [];
    _exportFormats = const [];
    _credit?.release();
    _credit = null;
    super.dispose();
  }

  void _navigate(GuidedEditorStage stage) {
    FocusManager.instance.primaryFocus?.unfocus();
    setState(() {
      _stage = stage;
      _previewOpen = false;
      _focusProblem = null;
    });
    _host.selectStep(switch (stage) {
      GuidedEditorStage.model => EditorStep.model,
      GuidedEditorStage.appearance => EditorStep.appearance,
      _ => EditorStep.content,
    });
  }

  void _correct(Problem problem) {
    if (problem.locale != null &&
        widget.session.project.localeOrder.contains(problem.locale)) {
      _host.selectLocale(problem.locale!);
    }
    if (problem.format != null) _host.selectFormat(problem.format!);
    _navigate(
      ['ink', 'accent', 'paper', 'logo'].contains(problem.field)
          ? GuidedEditorStage.appearance
          : GuidedEditorStage.content,
    );
    setState(() {
      _focusProblem = problem;
      _focusRequest = _focusRequest % 0xffffffff + 1;
    });
  }

  Widget _form() => switch (_stage) {
    GuidedEditorStage.model => SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Editorial B', style: Theme.of(context).textTheme.headlineLarge),
          const SizedBox(height: 16),
          const Text(
            'Uma composição guiada para os três formatos. '
            'Os textos novos ficam vazios; não existem frases ou traduções sugeridas.',
          ),
          const SizedBox(height: 24),
          EditorTextField(
            key: ValueKey('name-control-${widget.session.project.id}'),
            fieldKey: const Key('project-name'),
            value: widget.session.project.name,
            label: 'Nome interno do projeto (não publicado no anúncio)',
            onEdited: (value) =>
                _host.edit((session) => session.setName(value)),
          ),
          const Text('Formato inicial da prévia'),
          Wrap(
            spacing: 8,
            children: [
              for (final format in ExportFormat.values)
                ChoiceChip(
                  key: ValueKey('model-format-${format.name}'),
                  label: Text('${format.width} × ${format.height}'),
                  selected: _host.format == format,
                  onSelected: (_) => _host.selectFormat(format),
                ),
            ],
          ),
        ],
      ),
    ),
    GuidedEditorStage.content => ContentStep(
      controller: _host,
      focusProblem: _focusProblem,
      focusRequest: _focusRequest,
    ),
    GuidedEditorStage.appearance => AppearanceStep(
      controller: _host,
      focusProblem: _focusProblem,
      focusRequest: _focusRequest,
    ),
    GuidedEditorStage.languages => LanguagesStep(
      session: widget.session,
      onChanged: _host.refresh,
    ),
    GuidedEditorStage.review => Column(
      children: [
        Expanded(
          child: ReviewStep(
            controller: _host,
            onProblem: _correct,
            isExportLocaleSelected: (locale) => _exportLocales[locale.index],
            isExportFormatSelected: (format) => _exportFormats[format.index],
            onExportLocaleChanged: (locale, selected) =>
                setState(() => _exportLocales[locale.index] = selected),
            onExportFormatChanged: (format, selected) =>
                setState(() => _exportFormats[format.index] = selected),
          ),
        ),
        if (widget.onExport != null)
          FilledButton(
            key: const Key('review-export'),
            onPressed: () => widget.onExport!(
              List.unmodifiable(
                widget.session.project.localeOrder.where(
                  (l) => _exportLocales[l.index],
                ),
              ),
              List.unmodifiable(
                ExportFormat.values.where((f) => _exportFormats[f.index]),
              ),
            ),
            child: const Text('Exportar seleção de imagens'),
          ),
      ],
    ),
  };

  Widget _preview() {
    final frame = _host.preview.current;
    final live =
        frame != null &&
        !frame.isRetiring &&
        frame.projectId == widget.session.project.id &&
        frame.sessionGeneration == widget.session.generation &&
        frame.revision == widget.session.project.revision &&
        frame.locale == _host.locale &&
        frame.format == _host.format;
    return KeyedSubtree(
      key: _previewKey,
      child: Material(
        key: const Key('preview-pane'),
        color: DesignTokens.surface,
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Prévia', style: Theme.of(context).textTheme.titleLarge),
              Wrap(
                spacing: 8,
                children: [
                  for (final format in ExportFormat.values)
                    ChoiceChip(
                      key: ValueKey('preview-format-${format.name}'),
                      label: Text('${format.width} × ${format.height}'),
                      selected: _host.format == format,
                      onSelected: (_) => _host.selectFormat(format),
                    ),
                ],
              ),
              const SizedBox(height: 16),
              if (_host.previewStatus == PreviewStatus.loading)
                const LinearProgressIndicator(),
              if (_host.format == ExportFormat.story)
                SwitchListTile(
                  key: const Key('story-guides-toggle'),
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Guias story (apenas no editor)'),
                  subtitle: const Text(
                    'Margens indicativas, não uma zona universal segura. '
                    'As guias nunca fazem parte da imagem final.',
                  ),
                  value: _storyGuides,
                  onChanged: (value) => setState(() => _storyGuides = value),
                ),
              Semantics(
                image: live,
                label:
                    'Prévia do anúncio ${_host.locale.code}, '
                    '${_host.format.width} por ${_host.format.height}',
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 420),
                  child: AspectRatio(
                    aspectRatio: _host.format.width / _host.format.height,
                    child: live
                        ? Stack(
                            fit: StackFit.expand,
                            children: [
                              PreviewImageLeaf(frame: frame),
                              if (_storyGuides &&
                                  _host.format == ExportFormat.story)
                                IgnorePointer(
                                  child: Center(
                                    child: FractionallySizedBox(
                                      key: const Key('story-guides-overlay'),
                                      widthFactor: .88,
                                      heightFactor: .8,
                                      child: DecoratedBox(
                                        decoration: BoxDecoration(
                                          border: Border.all(
                                            color: DesignTokens.accent,
                                            width: 2,
                                          ),
                                        ),
                                      ),
                                    ),
                                  ),
                                ),
                            ],
                          )
                        : const Center(
                            child: Text(
                              'Prévia do rascunho: faltam dados ou existem '
                              'erros de composição. Abra Rever para corrigir.',
                            ),
                          ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) => _credit == null
      ? const Scaffold(body: EditorCapacityRefusal())
      : Scaffold(
          appBar: AppBar(
            title: const Text('Editor de anúncio'),
            actions: [
              AnimatedBuilder(
                animation: _host,
                builder: (context, _) => TextButton(
                  key: const Key('editor-undo'),
                  style: TextButton.styleFrom(minimumSize: const Size(48, 48)),
                  onPressed: widget.session.canUndo
                      ? () {
                          try {
                            _host.edit((session) => session.undo());
                          } on CapacityExceeded {
                            final messenger = ScaffoldMessenger.of(context);
                            messenger.clearSnackBars();
                            messenger.showSnackBar(
                              const SnackBar(
                                content: Text(
                                  'Limite de capacidade atingido. O projeto não foi alterado.',
                                ),
                              ),
                            );
                          }
                        }
                      : null,
                  child: const Text('Desfazer'),
                ),
              ),
            ],
          ),
          body: AnimatedBuilder(
            animation: _host,
            builder: (context, _) => LayoutBuilder(
              builder: (context, constraints) {
                final wide = constraints.maxWidth >= 1000;
                for (final locale in AppLocale.values) {
                  if (!widget.session.project.localeOrder.contains(locale)) {
                    _exportLocales[locale.index] = false;
                  }
                }
                return Column(
                  children: [
                    SingleChildScrollView(
                      scrollDirection: Axis.horizontal,
                      child: Row(
                        children: [
                          for (final stage in GuidedEditorStage.values)
                            TextButton(
                              key: ValueKey('step-${stage.name}'),
                              style: TextButton.styleFrom(
                                minimumSize: const Size(48, 48),
                              ),
                              onPressed: () => _navigate(stage),
                              child: Text(
                                '${stage.index + 1}. ${_labels[stage.index]}',
                              ),
                            ),
                        ],
                      ),
                    ),
                    SingleChildScrollView(
                      scrollDirection: Axis.horizontal,
                      child: Row(
                        children: [
                          const Padding(
                            padding: EdgeInsets.all(8),
                            child: Text('Edição:'),
                          ),
                          for (final locale
                              in widget.session.project.localeOrder)
                            Padding(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 4,
                              ),
                              child: ChoiceChip(
                                key: ValueKey('ui-locale-${locale.code}'),
                                label: Text(locale.code),
                                selected: _host.locale == locale,
                                onSelected: (_) => _host.selectLocale(locale),
                              ),
                            ),
                        ],
                      ),
                    ),
                    if (!wide)
                      Align(
                        alignment: Alignment.centerLeft,
                        child: TextButton(
                          key: Key(
                            _previewOpen ? 'close-preview' : 'open-preview',
                          ),
                          style: TextButton.styleFrom(
                            minimumSize: const Size(48, 48),
                          ),
                          onPressed: () {
                            FocusManager.instance.primaryFocus?.unfocus();
                            setState(() => _previewOpen = !_previewOpen);
                          },
                          child: Text(
                            _previewOpen
                                ? 'Voltar ao formulário'
                                : 'Abrir prévia',
                          ),
                        ),
                      ),
                    Expanded(
                      child: wide
                          ? Row(
                              key: const Key('desktop-editor'),
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: [
                                Expanded(flex: 5, child: _form()),
                                const VerticalDivider(width: 1),
                                Expanded(flex: 4, child: _preview()),
                              ],
                            )
                          : Stack(
                              key: const Key('compact-editor'),
                              children: [
                                Positioned.fill(
                                  child: Offstage(
                                    offstage: _previewOpen,
                                    child: _form(),
                                  ),
                                ),
                                Positioned.fill(
                                  child: Offstage(
                                    offstage: !_previewOpen,
                                    child: _preview(),
                                  ),
                                ),
                              ],
                            ),
                    ),
                  ],
                );
              },
            ),
          ),
        );
}
