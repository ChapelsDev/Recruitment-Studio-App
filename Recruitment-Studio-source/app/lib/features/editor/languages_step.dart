import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../shared/admission_budget.dart';
import '../../shared/problem.dart';
import '../../shared/work_limits.dart';

import '../projects/project.dart';
import 'editor_session.dart';

/// Manual, independent language editions; the caller retains the session.
class LanguagesStep extends StatefulWidget {
  const LanguagesStep({super.key, required this.session, this.onChanged});

  final EditorSession session;
  final VoidCallback? onChanged;

  @override
  State<LanguagesStep> createState() => _LanguagesStepState();
}

class _LanguagesStepState extends State<LanguagesStep> {
  static const _labels = {
    AppLocale.ptPT: 'Português (Portugal)',
    AppLocale.en: 'English',
    AppLocale.fr: 'Français',
    AppLocale.it: 'Italiano',
    AppLocale.deDE: 'Deutsch (Deutschland)',
    AppLocale.deCH: 'Deutsch (Schweiz)',
    AppLocale.es: 'Español',
  };

  // At most seven paid locale maps, each bounded by headline/location +8 contacts.
  // Price covers two worst-size UTF16 values, key/map/controller control per field;
  // this is conservative app admission, not a physical Flutter/VM heap theorem.
  static const _localeControlBytes = 4096 + (2 + WorkLimits.contacts) *
      (8192 + 8 * WorkLimits.fieldUtf16Units + 4 * 136);
  static const _overflowMessage =
      'Limite de 16 000 unidades UTF-16 por campo excedido. '
      'O valor anterior foi mantido; reduza o texto e tente novamente.';
  // One validated <=136-unit field key, paid by the existing locale control
  // envelope. Never retain the rejected input or enqueue repeated diagnostics.
  String? _overflowField;
  AppLocale? _overflowLocale;

  TextInputFormatter _textLimit(AppLocale locale, String field) =>
      TextInputFormatter.withFunction((oldValue, newValue) {
        if (newValue.text.length > WorkLimits.fieldUtf16Units) {
          if (_overflowField != field || _overflowLocale != locale) {
            setState(() {
              _overflowField = field;
              _overflowLocale = locale;
            });
          }
          return oldValue;
        }
        if (_overflowField == field && _overflowLocale == locale) {
          setState(() {
            _overflowField = null;
            _overflowLocale = null;
          });
        }
        return newValue;
      });
  final _controllers = <AppLocale, Map<String, TextEditingController>>{};
  final _controllerCredit = <AppLocale, AdmissionTicket>{};
  AppLocale? _selected;
  bool _pending = false;

  @override
  void didUpdateWidget(covariant LanguagesStep oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!identical(oldWidget.session, widget.session)) {
      _disposeControllers();
      _selected = null;
      _overflowField = null;
      _overflowLocale = null;
    }
  }

  void _disposeLocale(AppLocale locale) {
    if (_overflowLocale == locale) {
      _overflowField = null;
      _overflowLocale = null;
    }
    final fields = _controllers[locale];
    if (fields != null) {
      for (final controller in fields.values) {
        controller.dispose();
      }
      fields.clear();
      _controllers.remove(locale);
    }
    // Keep the complete envelope until all owned controllers have been disposed.
    _controllerCredit.remove(locale)?.release();
  }

  void _disposeControllers() {
    for (final locale in _controllers.keys.toList()) {
      _disposeLocale(locale);
    }
  }

  void _ensureLocale(AppLocale locale) {
    if (_controllers.containsKey(locale)) {
      return;
    }
    final credit = AdmissionBudget.shared.reserve(_localeControlBytes);
    try {
      _controllers[locale] = {};
      _controllerCredit[locale] = credit;
    } catch (_) {
      _controllers.remove(locale);
      _controllerCredit.remove(locale);
      credit.release();
      rethrow;
    }
  }

  @override
  void dispose() {
    _disposeControllers();
    super.dispose();
  }

  TextEditingController _controller(
    AppLocale locale,
    String field,
    String value,
  ) {
    final fields = _controllers[locale]!;
    if (value.length > WorkLimits.fieldUtf16Units ||
        (!fields.containsKey(field) && fields.length >= 2 + WorkLimits.contacts)) {
      throw const CapacityExceeded();
    }
    final controller = fields.putIfAbsent(
      field,
      () => TextEditingController(text: value),
    );
    if (controller.text != value) {
      controller.value = TextEditingValue(
        text: value,
        selection: TextSelection.collapsed(offset: value.length),
      );
    }
    return controller;
  }

  void _retireDisabled() {
    final enabled = widget.session.project.localeOrder;
    final removed = _controllers.keys
        .where((l) => !enabled.contains(l))
        .toList();
    for (final locale in removed) {
      _disposeLocale(locale);
    }
    final validFields = <String>{
      'headline', 'location',
      for (final id in widget.session.project.contactIds) 'contact-$id',
    };
    if (_overflowField != null &&
        (!enabled.contains(_overflowLocale) || !validFields.contains(_overflowField))) {
      _overflowField = null;
      _overflowLocale = null;
    }
    // Reconcile hidden enabled locales too; historical contact keys never grow.
    for (final fields in _controllers.values) {
      final obsolete = fields.keys.where((key) => !validFields.contains(key)).toList();
      for (final key in obsolete) {
        fields.remove(key)!.dispose();
      }
    }
  }

  void _refuse(String message) {
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(message)));
    setState(() {});
  }

  void _mutate(VoidCallback mutation) {
    if (_pending) {
      return;
    }
    final before = widget.session.generation;
    mutation();
    if (widget.session.generation != before) {
      setState(() {});
      widget.onChanged?.call();
    }
  }

  bool _hasManualContent(Project project, AppLocale locale) {
    final edition = project.edition(locale);
    if (edition.headline.isNotEmpty ||
        edition.location.isNotEmpty ||
        edition.contacts.values.any((text) => text.isNotEmpty)) {
      return true;
    }
    for (final section in project.sections) {
      if (section.titleByLocale[locale]?.isNotEmpty ?? false) {
        return true;
      }
      for (final item in section.items) {
        if (item.textByLocale[locale]?.isNotEmpty ?? false) {
          return true;
        }
      }
    }
    return false;
  }

  Future<void> _toggle(AppLocale locale, bool enabled) async {
    if (_pending) {
      return;
    }
    if (enabled) {
      _mutate(() => widget.session.addLocale(locale));
      return;
    }

    final session = widget.session;
    final RemovalImpact impact;
    try {
      impact = session.requestRemoveLocale(locale);
    } on ArgumentError catch (error) {
      if (error.message != 'Cannot remove last locale') {
        rethrow;
      }
      if (mounted) {
        _refuse('É necessário manter pelo menos um idioma.');
      }
      return;
    } on StateError {
      if (session.project.localeOrder.length == 1 &&
          session.project.localeOrder.contains(locale)) {
        _refuse('É necessário manter pelo menos um idioma.');
        return;
      }
      rethrow;
    }

    if (_hasManualContent(session.project, locale)) {
      setState(() => _pending = true);
      final confirmed = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: Text('Remover ${_labels[locale]}?'),
          content: const Text(
            'Este idioma contém texto preenchido. A remoção elimina apenas '
            'essa edição e não altera os outros idiomas.',
          ),
          actions: [
            TextButton(
              key: const ValueKey('cancel-remove-locale'),
              onPressed: () => Navigator.of(context).pop(false),
              child: const Text('Cancelar'),
            ),
            TextButton(
              key: const ValueKey('confirm-remove-locale'),
              onPressed: () => Navigator.of(context).pop(true),
              child: const Text('Remover idioma'),
            ),
          ],
        ),
      );
      if (!mounted) {
        return;
      }
      setState(() => _pending = false);
      if (confirmed != true) {
        return;
      }
    }

    if (!identical(widget.session, session) ||
        session.isDisposed ||
        impact.projectId != session.project.id ||
        impact.revision != session.project.revision ||
        impact.sessionGeneration != session.generation) {
      _refuse('O projeto mudou. Reveja a remoção do idioma.');
      return;
    }
    _mutate(() => session.confirmRemoveLocale(locale, impact: impact));
  }

  Widget _textField({
    required AppLocale locale,
    required String field,
    required String value,
    required String label,
    required ValueChanged<String> onChanged,
  }) => Padding(
    padding: const EdgeInsets.only(bottom: 16),
    child: TextField(
      key: ValueKey('$field-${locale.code}'),
      controller: _controller(locale, field, value),
      readOnly: _pending,
      inputFormatters: [_textLimit(locale, field)],
      decoration: InputDecoration(
        labelText: '$label — ${_labels[locale]}',
        errorText: _overflowField == field && _overflowLocale == locale
            ? _overflowMessage : null,
        errorMaxLines: 3,
      ),
      onChanged: onChanged,
    ),
  );

  @override
  Widget build(BuildContext context) {
    final project = widget.session.project;
    final locales = project.localeOrder;
    _retireDisabled();
    if (!locales.contains(_selected)) {
      _selected = locales.first;
    }
    final locale = _selected!;
    try {
      _ensureLocale(locale);
    } on CapacityExceeded {
      return const Padding(
        padding: EdgeInsets.all(24),
        child: Text('Capacidade de memória indisponível. Feche outros editores '
            'e tente novamente. O projeto não foi alterado.'),
      );
    }
    final edition = project.edition(locale);
    final theme = Theme.of(context);

    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Idiomas', style: theme.textTheme.headlineMedium),
          const SizedBox(height: 8),
          const Text(
            'Cada idioma é uma edição independente. Os novos idiomas começam '
            'vazios; preencha manualmente o respetivo texto.',
          ),
          const SizedBox(height: 16),
          for (final choice in AppLocale.values)
            CheckboxListTile(
              key: ValueKey('enable-${choice.code}'),
              title: Text(_labels[choice]!),
              value: locales.contains(choice),
              controlAffinity: ListTileControlAffinity.leading,
              contentPadding: EdgeInsets.zero,
              onChanged: _pending
                  ? null
                  : (value) {
                      if (value != null) {
                        _toggle(choice, value);
                      }
                    },
            ),
          const SizedBox(height: 16),
          Text('Editar edição', style: theme.textTheme.titleLarge),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final enabled in locales)
                ChoiceChip(
                  key: ValueKey('select-${enabled.code}'),
                  label: Text(_labels[enabled]!),
                  selected: enabled == locale,
                  onSelected: _pending
                      ? null
                      : (_) => setState(() => _selected = enabled),
                ),
            ],
          ),
          const SizedBox(height: 24),
          _textField(
            locale: locale,
            field: 'headline',
            value: edition.headline,
            label: 'Título',
            onChanged: (value) =>
                _mutate(() => widget.session.setHeadline(locale, value)),
          ),
          _textField(
            locale: locale,
            field: 'location',
            value: edition.location,
            label: 'Localização',
            onChanged: (value) =>
                _mutate(() => widget.session.setLocation(locale, value)),
          ),
          for (final id in project.contactIds)
            Padding(
              padding: const EdgeInsets.only(bottom: 16),
              child: TextField(
                key: ValueKey('contact-${locale.code}-$id'),
                controller: _controller(
                  locale,
                  'contact-$id',
                  edition.contacts[id]!,
                ),
                readOnly: _pending,
                inputFormatters: [_textLimit(locale, 'contact-$id')],
                decoration: InputDecoration(
                  labelText: 'Contacto $id — ${_labels[locale]}',
                  errorText: _overflowField == 'contact-$id' && _overflowLocale == locale
                      ? _overflowMessage : null,
                  errorMaxLines: 3,
                ),
                onChanged: (value) =>
                    _mutate(() => widget.session.setContact(locale, id, value)),
              ),
            ),
        ],
      ),
    );
  }
}
