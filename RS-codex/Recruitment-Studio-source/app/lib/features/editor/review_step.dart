import 'package:flutter/material.dart';

import '../../shared/admission_budget.dart';
import '../../shared/problem.dart';
import '../composition/export_format.dart';
import '../projects/project.dart';
import 'editor_host_controller.dart';
import 'editor_controls.dart';
import 'preview_owner.dart';

/// Consumes the real PreviewOwner's resolved EditorialLayout/VariantValidator
/// diagnostics. No duplicate composition, character-count proxy or fake export.
/// Only the displayed variant is certified here; T12 must revalidate its frozen
/// selection. Callbacks transfer scalars, never mutable selection collections.
class ReviewStep extends StatefulWidget {
  const ReviewStep({
    super.key,
    required this.controller,
    required this.onProblem,
    this.onExportLocaleChanged,
    this.onExportFormatChanged,
    this.isExportLocaleSelected,
    this.isExportFormatSelected,
  });
  final bool Function(AppLocale)? isExportLocaleSelected;
  final bool Function(ExportFormat)? isExportFormatSelected;
  final EditorHostController controller;
  final ValueChanged<Problem> onProblem;
  final void Function(AppLocale, bool)? onExportLocaleChanged;
  final void Function(ExportFormat, bool)? onExportFormatChanged;

  @override
  State<ReviewStep> createState() => _ReviewStepState();
}

class _ReviewStepState extends State<ReviewStep> {
  AdmissionTicket? _credit;
  List<bool> _locales = const [], _formats = const [];
  EditorHostController get host => widget.controller;

  @override
  void initState() {
    super.initState();
    try {
      _credit = AdmissionBudget.shared.reserve(32 * 1024);
    } on CapacityExceeded {
      return;
    }
    _locales = List.filled(AppLocale.values.length, false);
    _formats = List.filled(ExportFormat.values.length, true);
    _locales[host.locale.index] = true;
  }

  @override
  void dispose() {
    _locales = const [];
    _formats = const [];
    _credit?.release();
    _credit = null;
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => _credit == null
      ? const EditorCapacityRefusal()
      : AnimatedBuilder(
          animation: host,
          builder: (context, _) {
            final status = host.previewStatus;
            final settled =
                status == PreviewStatus.ready || status == PreviewStatus.error;
            final problems = settled ? host.problems : const <Problem>[];
            final errors = problems
                .where((p) => p.severity == ProblemSeverity.error)
                .length;
            final active = host.session.project.localeOrder;
            for (final locale in AppLocale.values) {
              _locales[locale.index] =
                  active.contains(locale) &&
                  (widget.isExportLocaleSelected?.call(locale) ??
                      _locales[locale.index]);
            }
            for (final format in ExportFormat.values) {
              _formats[format.index] =
                  widget.isExportFormatSelected?.call(format) ??
                  _formats[format.index];
            }
            return SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Rever',
                    style: Theme.of(context).textTheme.headlineMedium,
                  ),
                  const SizedBox(height: 16),
                  const Text(
                    'Variante em revisão — independente da seleção para exportação',
                  ),
                  Wrap(
                    spacing: 8,
                    children: [
                      for (final locale in active)
                        ChoiceChip(
                          key: ValueKey('review-locale-${locale.code}'),
                          label: Text(locale.code),
                          selected: host.locale == locale,
                          onSelected: (_) => host.selectLocale(locale),
                        ),
                    ],
                  ),
                  Wrap(
                    spacing: 8,
                    children: [
                      for (final format in ExportFormat.values)
                        ChoiceChip(
                          key: ValueKey('review-format-${format.name}'),
                          label: Text('${format.width} × ${format.height}'),
                          selected: host.format == format,
                          onSelected: (_) => host.selectFormat(format),
                        ),
                    ],
                  ),
                  Text(
                    '${host.locale.code} — ${host.format.width} × ${host.format.height}',
                  ),
                  const Text(
                    'Pode guardar um rascunho incompleto quando a gravação estiver ligada. '
                    'Não verificamos a qualidade nem a fidelidade de traduções manuais.',
                  ),
                  const SizedBox(height: 16),
                  if (!settled)
                    const Text('A validar a variante…')
                  else
                    Text(
                      errors == 0
                          ? 'Sem erros nesta variante.'
                          : 'Erros nesta variante: $errors',
                    ),
                  const Text(
                    'Erros bloqueiam esta variante. Avisos não bloqueiam publicação.',
                  ),
                  for (final problem in problems)
                    Padding(
                      padding: const EdgeInsets.only(top: 16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            '${switch (problem.severity) {
                              ProblemSeverity.error => 'Erro',
                              ProblemSeverity.warning => 'Aviso',
                              ProblemSeverity.info => 'Informação',
                            }} — ${editorProblemMessage(problem.code)} — ${problem.field ?? 'projeto'}'
                            '${problem.sectionId == null ? '' : ' / secção ${problem.sectionId}'}',
                          ),
                          TextButton(
                            key: ValueKey(
                              'problem-${problem.code.name}-${problem.field}'
                              '${problem.sectionId == null ? '' : '-${problem.sectionId}'}',
                            ),
                            style: TextButton.styleFrom(
                              minimumSize: const Size(48, 48),
                            ),
                            onPressed: () => widget.onProblem(problem),
                            child: Text(
                              problem.actionLabel.isEmpty
                                  ? 'Rever e corrigir este problema'
                                  : problem.actionLabel,
                            ),
                          ),
                        ],
                      ),
                    ),
                  const SizedBox(height: 24),
                  Text(
                    'Seleção para exportação',
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  const Text(
                    'Reveja cada idioma e formato. A exportação terá de validar '
                    'novamente a seleção congelada, sem omitir variantes sem autorização.',
                  ),
                  for (final locale in active)
                    CheckboxListTile(
                      key: ValueKey('export-locale-${locale.code}'),
                      title: Text(locale.code),
                      contentPadding: EdgeInsets.zero,
                      value: _locales[locale.index],
                      onChanged: (value) {
                        if (value == null) return;
                        setState(() => _locales[locale.index] = value);
                        widget.onExportLocaleChanged?.call(locale, value);
                      },
                    ),
                  for (final format in ExportFormat.values)
                    CheckboxListTile(
                      key: ValueKey('export-format-${format.name}'),
                      title: Text('${format.width} × ${format.height}'),
                      contentPadding: EdgeInsets.zero,
                      value: _formats[format.index],
                      onChanged: (value) {
                        if (value == null) return;
                        setState(() => _formats[format.index] = value);
                        widget.onExportFormatChanged?.call(format, value);
                      },
                    ),
                  if (!_locales.any((selected) => selected) ||
                      !_formats.any((selected) => selected))
                    const Text(
                      'Escolha pelo menos um idioma e um formato para exportar.',
                    ),
                ],
              ),
            );
          },
        );
}
