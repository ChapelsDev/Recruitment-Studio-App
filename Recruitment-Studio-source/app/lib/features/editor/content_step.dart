import 'package:flutter/material.dart';

import '../../shared/admission_budget.dart';
import '../../shared/problem.dart';
import '../../shared/work_limits.dart';
import '../projects/project.dart';
import 'editor_controls.dart';
import 'editor_host_controller.dart';
import 'editor_session.dart';

/// Real structural actions on shared blocks; manual text belongs to host.locale.
/// The caller retains the host/session. At most one removal dialog is pending.
class ContentStep extends StatefulWidget {
  const ContentStep({
    super.key,
    required this.controller,
    this.focusProblem,
    this.focusRequest = 0,
  });
  final EditorHostController controller;
  final Problem? focusProblem;
  final int focusRequest;

  @override
  State<ContentStep> createState() => _ContentStepState();
}

class _ContentStepState extends State<ContentStep> {
  bool _pending = false;
  AdmissionTicket? _credit;
  @override
  void initState() {
    super.initState();
    try {
      _credit = AdmissionBudget.shared.reserve(32 * 1024);
    } on CapacityExceeded {
      /* Static refusal, no controls or dialogs allocated. */
    }
  }

  @override
  void dispose() {
    // A live dialog/await owns the envelope even if this stage was unmounted.
    if (!_pending) {
      _credit?.release();
      _credit = null;
    }
    super.dispose();
  }

  EditorHostController get host => widget.controller;

  void _refuse(String message) {
    final messenger = ScaffoldMessenger.of(context);
    messenger.clearSnackBars();
    messenger.showSnackBar(SnackBar(content: Text(message)));
  }

  void _edit(void Function(EditorSession) action) {
    if (_pending) return;
    try {
      host.edit(action);
    } on CapacityExceeded {
      _refuse('Limite de capacidade atingido. O projeto não foi alterado.');
    }
  }

  static String _id(String prefix, Iterable<String> existing, int maximum) {
    for (var i = 1; i <= maximum + 1; i++) {
      final id = '$prefix$i';
      if (!existing.contains(id)) return id;
    }
    throw const CapacityExceeded();
  }

  Future<void> _remove(String sectionId, [String? itemId]) async {
    if (_pending) return;
    final source = host;
    final session = source.session;
    final RemovalImpact impact;
    try {
      impact = itemId == null
          ? session.requestRemoveSection(sectionId)
          : session.requestRemoveItem(sectionId, itemId);
    } on CapacityExceeded {
      _refuse('Limite de capacidade atingido. O projeto não foi alterado.');
      return;
    }
    if (impact.requiresConfirmation) {
      setState(() => _pending = true);
      final confirmed = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: Text(itemId == null ? 'Remover secção?' : 'Remover item?'),
          content: Text(
            'Esta estrutura é partilhada. Será removido texto em '
            '${impact.affectedLocales.map((locale) => locale.code).join(', ')}. '
            'Pode desfazer durante esta sessão.',
          ),
          actions: [
            TextButton(
              key: const Key('cancel-remove-block'),
              onPressed: () => Navigator.of(context).pop(false),
              child: const Text('Cancelar'),
            ),
            TextButton(
              key: const Key('confirm-remove-block'),
              onPressed: () => Navigator.of(context).pop(true),
              child: const Text('Remover'),
            ),
          ],
        ),
      );
      if (!mounted) {
        _pending = false;
        _credit?.release();
        _credit = null;
        return;
      }
      setState(() => _pending = false);
      if (confirmed != true) return;
    }
    if (!identical(source, host) ||
        session.isDisposed ||
        impact.projectId != session.project.id ||
        impact.sessionGeneration != session.generation ||
        impact.revision != session.project.revision) {
      _refuse('O projeto mudou. Reveja a remoção.');
      return;
    }
    _edit((session) {
      if (itemId == null) {
        session.confirmRemoveSection(sectionId, impact: impact);
      } else {
        session.confirmRemoveItem(sectionId, itemId, impact: impact);
      }
    });
  }

  Widget _action(String key, String label, VoidCallback? action) {
    if (key == 'choose-photo' || key == 'add-contact') {
      return EditorActionButton(
        key: ValueKey('action-$key-${host.locale.code}'),
        buttonKey: ValueKey(key),
        label: label,
        onPressed: action,
        focusRequest: _target(key) ? widget.focusRequest : 0,
      );
    }
    return TextButton(
      key: ValueKey(key),
      style: TextButton.styleFrom(minimumSize: const Size(48, 48)),
      onPressed: action,
      child: Text(label),
    );
  }

  bool _target(String coordinate) {
    final problem = widget.focusProblem;
    if (problem == null ||
        (problem.locale != null && problem.locale != host.locale)) {
      return false;
    }
    final field = problem.field;
    if (field == 'photo') return coordinate == 'choose-photo';
    if (field == 'headline' || field == 'location') return coordinate == field;
    if (field == 'contacts') {
      final ids = host.session.project.contactIds;
      return coordinate ==
          (ids.isEmpty ? 'add-contact' : 'contact-${ids.first}');
    }
    if (field != null && field.startsWith('contact:')) {
      return coordinate == 'contact-${field.substring(8)}';
    }
    if (field == 'title') return coordinate == 'title-${problem.sectionId}';
    if (field != null && field.startsWith('item:')) {
      return coordinate == 'item-${problem.sectionId}-${field.substring(5)}';
    }
    return false;
  }

  Widget _field(
    String coordinate,
    String value,
    String label,
    void Function(EditorSession, String) action,
  ) => EditorTextField(
    key: ValueKey('control-$coordinate-${host.locale.code}'),
    fieldKey: ValueKey('content-$coordinate-${host.locale.code}'),
    value: value,
    label: '$label — ${host.locale.code}',
    focusRequest: _target(coordinate) ? widget.focusRequest : 0,
    onEdited: (value) => host.edit((session) => action(session, value)),
  );

  @override
  Widget build(BuildContext context) => _credit == null
      ? const EditorCapacityRefusal()
      : AnimatedBuilder(
          animation: host,
          builder: (context, _) {
            final project = host.session.project;
            final locale = host.locale;
            return SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: AbsorbPointer(
                absorbing: _pending,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Conteúdo',
                      style: Theme.of(context).textTheme.headlineMedium,
                    ),
                    const SizedBox(height: 16),
                    EditorMediaStatus(controller: host),
                    _action(
                      'choose-photo',
                      project.photo == null
                          ? 'Escolher fotografia local'
                          : 'Substituir fotografia',
                      host.mediaAvailable
                          ? () => host.requestMedia(AssetKind.photo)
                          : null,
                    ),
                    if (!host.mediaAvailable)
                      const Text(
                        'A origem de ficheiros locais ainda não está ligada.',
                      ),
                    _field(
                      'headline',
                      project.edition(locale).headline,
                      'Título / profissão',
                      (s, value) => s.setHeadline(locale, value),
                    ),
                    _field(
                      'location',
                      project.edition(locale).location,
                      'Localização (opcional)',
                      (s, value) => s.setLocation(locale, value),
                    ),
                    for (final id in project.contactIds)
                      _field(
                        'contact-$id',
                        project.edition(locale).contacts[id]!,
                        'Contacto $id',
                        (s, value) => s.setContact(locale, id, value),
                      ),
                    _action(
                      'add-contact',
                      'Adicionar contacto',
                      project.contactIds.length >= WorkLimits.contacts
                          ? null
                          : () => _edit(
                              (s) => s.setContact(
                                locale,
                                _id(
                                  'c',
                                  project.contactIds,
                                  WorkLimits.contacts,
                                ),
                                '',
                              ),
                            ),
                    ),
                    for (
                      var index = 0;
                      index < project.sections.length;
                      index++
                    )
                      _section(project.sections[index], index, locale),
                    _action(
                      'add-section',
                      'Adicionar secção',
                      project.sections.length >= WorkLimits.sections
                          ? null
                          : () => _edit(
                              (session) => session.addSection(
                                _id(
                                  's',
                                  project.sections.map((s) => s.id),
                                  WorkLimits.sections,
                                ),
                              ),
                            ),
                    ),
                    _action(
                      'content-undo',
                      'Desfazer',
                      host.session.canUndo
                          ? () => _edit((s) => s.undo())
                          : null,
                    ),
                  ],
                ),
              ),
            );
          },
        );

  Widget _section(Section section, int index, AppLocale locale) => Padding(
    key: ValueKey('section-${section.id}'),
    padding: const EdgeInsets.only(top: 24, bottom: 8),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Divider(),
        Text(
          'Secção ${index + 1}',
          style: Theme.of(context).textTheme.titleLarge,
        ),
        SwitchListTile(
          key: ValueKey('visible-${section.id}'),
          title: const Text('Incluir esta secção no anúncio'),
          subtitle: const Text('Ocultar conserva o texto de todos os idiomas.'),
          contentPadding: EdgeInsets.zero,
          value: section.visible,
          onChanged: (value) =>
              _edit((s) => s.setSectionVisible(section.id, value)),
        ),
        _field(
          'title-${section.id}',
          section.title(locale),
          'Título da secção',
          (s, value) => s.setSectionTitle(locale, section.id, value),
        ),
        Wrap(
          children: [
            _action(
              'move-section-up-${section.id}',
              'Mover secção acima',
              index == 0
                  ? null
                  : () => _edit((s) => s.moveSection(section.id, index - 1)),
            ),
            _action(
              'move-section-down-${section.id}',
              'Mover secção abaixo',
              index == host.session.project.sections.length - 1
                  ? null
                  : () => _edit((s) => s.moveSection(section.id, index + 1)),
            ),
            _action(
              'remove-section-${section.id}',
              'Remover secção',
              () => _remove(section.id),
            ),
          ],
        ),
        for (var i = 0; i < section.items.length; i++) ...[
          _field(
            'item-${section.id}-${section.items[i].id}',
            section.items[i].text(locale),
            'Texto do item ${i + 1}',
            (s, value) =>
                s.setItemText(locale, section.id, section.items[i].id, value),
          ),
          Wrap(
            children: [
              _action(
                'move-item-up-${section.id}-${section.items[i].id}',
                'Mover item acima',
                i == 0
                    ? null
                    : () => _edit(
                        (s) =>
                            s.moveItem(section.id, section.items[i].id, i - 1),
                      ),
              ),
              _action(
                'move-item-down-${section.id}-${section.items[i].id}',
                'Mover item abaixo',
                i == section.items.length - 1
                    ? null
                    : () => _edit(
                        (s) =>
                            s.moveItem(section.id, section.items[i].id, i + 1),
                      ),
              ),
              _action(
                'remove-item-${section.id}-${section.items[i].id}',
                'Remover item',
                () => _remove(section.id, section.items[i].id),
              ),
            ],
          ),
        ],
        _action(
          'add-item-${section.id}',
          'Adicionar item',
          section.items.length >= WorkLimits.itemsPerSection
              ? null
              : () => _edit(
                  (s) => s.addItem(
                    section.id,
                    _id(
                      'i',
                      section.items.map((item) => item.id),
                      WorkLimits.itemsPerSection,
                    ),
                  ),
                ),
        ),
      ],
    ),
  );
}
