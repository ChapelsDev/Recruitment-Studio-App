import 'package:flutter/material.dart';

import '../features/editor/editor_controls.dart';
import '../features/projects/company_profile.dart';
import '../shared/admission_budget.dart';
import '../shared/problem.dart';
import 'product_runtime.dart';

/// Manual profile fields begin empty. Explicit Apply changes only a selected
/// key; persistence failure never resets this controller's manual draft.
class ProductProfilePanel extends StatefulWidget {
  const ProductProfilePanel({
    super.key,
    required this.runtime,
    required this.onBack,
  });
  final ProductRuntime runtime;
  final VoidCallback onBack;
  @override
  State<ProductProfilePanel> createState() => _ProductProfilePanelState();
}

class _ProductProfilePanelState extends State<ProductProfilePanel> {
  String _id = '', _contact = '', _hex = '', _role = 'accent', _feedback = '';
  AdmissionTicket? _credit;
  @override
  void initState() {
    super.initState();
    try {
      _credit = AdmissionBudget.shared.reserve(256 * 1024);
    } on CapacityExceeded {
      _feedback = 'Limite de capacidade';
    }
  }

  @override
  void dispose() {
    _credit?.release();
    super.dispose();
  }

  void _apply(void Function() action) {
    try {
      action();
      setState(
        () => _feedback =
            'Elemento manual atualizado — guardar perfil para confirmar',
      );
    } catch (_) {
      setState(
        () => _feedback =
            'Valor inválido ou limite atingido — perfil anterior preservado',
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final runtime = widget.runtime, profile = runtime.profile;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Perfil da empresa'),
        leading: IconButton(
          key: const Key('profile-back'),
          tooltip: 'Voltar',
          onPressed: runtime.busy ? null : widget.onBack,
          icon: const Icon(Icons.arrow_back),
        ),
      ),
      body: Column(
        children: [
          if (runtime.busy) const LinearProgressIndicator(),
          if (runtime.canCancel)
            TextButton(
              key: const Key('product-cancel'),
              onPressed: runtime.cancel,
              child: const Text('Cancelar operação'),
            ),
          if (runtime.message.isNotEmpty) Text(runtime.message),
          Expanded(
            child: ListView(
              padding: const EdgeInsets.all(24),
              children: [
                const Text(
                  'Apenas dados escritos ou escolhidos manualmente. Guardar não aplica o perfil automaticamente a nenhum projeto.',
                ),
                if (_feedback.isNotEmpty) Text(_feedback),
                if (_credit != null) ...[
                  EditorTextField(
                    fieldKey: const Key('profile-contact-id'),
                    value: _id,
                    label: 'Identificador do contacto (manual)',
                    onEdited: (value) => _id = value,
                  ),
                  EditorTextField(
                    fieldKey: const Key('profile-contact-value'),
                    value: _contact,
                    label: 'Texto do contacto (manual)',
                    onEdited: (value) => _contact = value,
                  ),
                  TextButton(
                    key: const Key('profile-contact-apply'),
                    onPressed: runtime.busy
                        ? null
                        : () => _apply(
                            () => profile.setDraft(
                              CompanyProfile(
                                logo: profile.draft.logo,
                                colours: profile.draft.colours,
                                contacts: {
                                  ...profile.draft.contacts,
                                  _id: _contact,
                                },
                              ),
                            ),
                          ),
                    child: const Text('Atualizar contacto manual'),
                  ),
                  for (final entry in profile.draft.contacts.entries)
                    ListTile(
                      title: Text('${entry.key}: ${entry.value}'),
                      trailing: IconButton(
                        tooltip: 'Remover contacto do perfil',
                        onPressed: runtime.busy
                            ? null
                            : () => _apply(
                                () => profile.setDraft(
                                  CompanyProfile(
                                    logo: profile.draft.logo,
                                    colours: profile.draft.colours,
                                    contacts: {
                                      for (final item
                                          in profile.draft.contacts.entries)
                                        if (item.key != entry.key)
                                          item.key: item.value,
                                    },
                                  ),
                                ),
                              ),
                        icon: const Icon(Icons.delete_outline),
                      ),
                    ),
                  DropdownButton<String>(
                    value: _role,
                    items: [
                      for (final role in ['ink', 'accent', 'paper'])
                        DropdownMenuItem(value: role, child: Text(role)),
                    ],
                    onChanged: runtime.busy
                        ? null
                        : (value) => setState(() => _role = value!),
                  ),
                  EditorTextField(
                    fieldKey: const Key('profile-colour-value'),
                    maximumUnits: 8,
                    value: _hex,
                    label: 'Cor ARGB hexadecimal — oito dígitos escritos manualmente',
                    onEdited: (value) => _hex = value,
                  ),
                  TextButton(
                    key: const Key('profile-colour-apply'),
                    onPressed: runtime.busy
                        ? null
                        : () => _apply(() {
                            if (!RegExp(r'^[0-9a-fA-F]{8}$').hasMatch(_hex)) {
                              throw ArgumentError('Invalid colour');
                            }
                            profile.setDraft(
                              CompanyProfile(
                                logo: profile.draft.logo,
                                contacts: profile.draft.contacts,
                                colours: {
                                  ...profile.draft.colours,
                                  _role: int.parse(_hex, radix: 16),
                                },
                              ),
                            );
                          }),
                    child: const Text('Atualizar cor selecionada'),
                  ),
                  for (final entry in profile.draft.colours.entries)
                    Text(
                      '${entry.key}: ${entry.value.toRadixString(16).padLeft(8, '0')}',
                    ),
                  TextButton(
                    key: const Key('profile-logo'),
                    onPressed: runtime.busy ? null : runtime.importProfileLogo,
                    child: const Text('Escolher logótipo local'),
                  ),
                  if (profile.draft.logo != null) ...[
                    const Text('Logótipo manual disponível'),
                    TextButton(
                      key: const Key('profile-logo-remove'),
                      onPressed: runtime.busy
                          ? null
                          : () => _apply(() {
                              profile.setDraft(
                                CompanyProfile(
                                  contacts: profile.draft.contacts,
                                  colours: profile.draft.colours,
                                ),
                              );
                            }),
                      child: const Text('Remover logótipo do perfil'),
                    ),
                  ],
                  FilledButton(
                    key: const Key('profile-save'),
                    onPressed: runtime.busy ? null : runtime.saveProfile,
                    child: const Text('Guardar perfil'),
                  ),
                  TextButton(
                    key: const Key('profile-reload'),
                    onPressed: runtime.busy ? null : runtime.reloadProfile,
                    child: const Text('Carregar perfil local confirmado'),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}
