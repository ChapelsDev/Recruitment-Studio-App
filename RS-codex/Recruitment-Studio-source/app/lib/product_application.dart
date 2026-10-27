import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';

import 'design/editorial_theme.dart';
import 'features/composition/export_format.dart';
import 'features/projects/project.dart';
import 'features/export/export_selection.dart';
import 'features/editor/editor_controls.dart';
import 'features/editor/editor_shell.dart';
import 'features/editor/leave_project_guard.dart';
import 'runtime/native_bootstrap.dart';
import 'runtime/profile_panel.dart';
import 'features/editor/editor_host_controller.dart';
import 'runtime/product_runtime.dart';
export 'runtime/product_runtime.dart' show ProductGatewayFactory;

Widget buildFunctionalApplication({
  Directory? privateDirectory,
  ProductGatewayFactory? gatewayFactory,
}) => MaterialApp(
  title: 'Recrutamento',
  debugShowCheckedModeBanner: false,
  theme: editorialTheme(),
  home: ProductApplication(
    privateDirectory: privateDirectory,
    gatewayFactory: gatewayFactory,
  ),
);

class ProductApplication extends StatefulWidget {
  const ProductApplication({
    super.key,
    this.privateDirectory,
    this.gatewayFactory,
  });
  final Directory? privateDirectory;
  final ProductGatewayFactory? gatewayFactory;
  @override
  State<ProductApplication> createState() => ProductApplicationState();
}

class ProductApplicationState extends State<ProductApplication> {
  ProductRuntime? get runtime => _runtime;
  ProductRuntime? _runtime;
  bool _failed = false, _profileOpen = false;
  @override
  void initState() {
    super.initState();
    unawaited(_open());
  }

  Future<void> _open() async {
    try {
      final directory =
          widget.privateDirectory ?? await NativeProductBootstrap.privateRoot();
      final factory = widget.gatewayFactory ?? NativeProductBootstrap.gateway;
      final runtime = await ProductRuntime.open(directory, factory);
      if (!mounted) {
        await runtime.close();
        runtime.dispose();
        return;
      }
      _runtime = runtime;
      runtime.addListener(_changed);
      setState(() {});
    } catch (_) {
      if (mounted) setState(() => _failed = true);
    }
  }

  void _changed() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    _runtime?.removeListener(_changed);
    _runtime?.dispose();
    super.dispose();
  }

  Future<LeaveDecision> _leaveDecision() async {
    final runtime = _runtime!;
    var decision = LeaveDecision.discard;
    if (runtime.session!.hasUnsavedChanges) {
      decision =
          await showDialog<LeaveDecision>(
            context: context,
            builder: (context) => AlertDialog(
              title: const Text('Alterações não guardadas no projeto editável'),
              content: const Text(
                'O rascunho privado não substitui um projeto guardado. Descartar sai sem apagar rascunhos confirmados.',
              ),
              actions: [
                TextButton(
                  key: const Key('leave-cancel'),
                  onPressed: () => Navigator.pop(context, LeaveDecision.cancel),
                  child: const Text('Continuar edição'),
                ),
                TextButton(
                  key: const Key('leave-discard'),
                  onPressed: () =>
                      Navigator.pop(context, LeaveDecision.discard),
                  child: const Text('Descartar e sair'),
                ),
                FilledButton(
                  key: const Key('leave-save'),
                  onPressed: () => Navigator.pop(context, LeaveDecision.save),
                  child: const Text('Guardar projeto e sair'),
                ),
              ],
            ),
          ) ??
          LeaveDecision.cancel;
    }
    return decision;
  }

  Future<void> _leave() async {
    final decision = await _leaveDecision();
    if (mounted) await _runtime!.leave(decision);
  }

  Future<void> _openEditor() async {
    final decision = await _leaveDecision();
    if (mounted) await _runtime!.openProject(decision: decision);
  }

  Future<void> _remove(String id) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Remover apenas projeto local?'),
        content: const Text(
          'Remove o rascunho e gerações pertencentes à aplicação. Não remove projetos editáveis ou imagens guardados em destinos externos.',
        ),
        actions: [
          TextButton(
            key: const Key('remove-cancel'),
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            key: const Key('remove-confirm'),
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Remover projeto local'),
          ),
        ],
      ),
    );
    if (confirmed == true && mounted) {
      await _runtime!.remove(id, confirmed: true);
    }
  }

  Future<void> _copyProfile() async {
    final host = _runtime!.host!;
    host.requestProfile(host.session.project.localeOrder.toSet());
    final locales = <AppLocale>{}, contacts = <String>{}, colours = <String>{};
    var logo = false, confirmed = false;
    try {
      await showDialog<void>(
        context: context,
        builder: (context) => StatefulBuilder(
          builder: (context, setChoice) => AnimatedBuilder(
            animation: host,
            builder: (context, _) {
              final options = host.profileOptions;
              return AlertDialog(
                title: const Text('Copiar elementos explícitos do perfil'),
                content: SizedBox(
                  width: 480,
                  child: SingleChildScrollView(
                    child: options == null
                        ? Text(
                            host.mediaProblem == null
                                ? 'A preparar perfil local…'
                                : 'Perfil indisponível — cancelar e tentar novamente',
                          )
                        : Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const Text(
                                'Nenhuma tradução é criada. Selecione idiomas e elementos; os restantes ficam inalterados.',
                              ),
                              for (final locale in options.eligibleLocales)
                                CheckboxListTile(
                                  key: ValueKey(
                                    'profile-select-${locale.code}',
                                  ),
                                  title: Text(locale.code),
                                  value: locales.contains(locale),
                                  onChanged: (value) => setChoice(
                                    () => value == true
                                        ? locales.add(locale)
                                        : locales.remove(locale),
                                  ),
                                ),
                              for (final id in options.contactIds)
                                CheckboxListTile(
                                  key: ValueKey('profile-select-contact-$id'),
                                  title: Text(id),
                                  value: contacts.contains(id),
                                  onChanged: (value) => setChoice(
                                    () => value == true
                                        ? contacts.add(id)
                                        : contacts.remove(id),
                                  ),
                                ),
                              for (final role in options.colourRoles)
                                CheckboxListTile(
                                  key: ValueKey('profile-select-colour-$role'),
                                  title: Text(role),
                                  value: colours.contains(role),
                                  onChanged: (value) => setChoice(
                                    () => value == true
                                        ? colours.add(role)
                                        : colours.remove(role),
                                  ),
                                ),
                              if (options.hasLogo)
                                CheckboxListTile(
                                  key: const Key('profile-select-logo'),
                                  title: const Text('Logótipo manual'),
                                  value: logo,
                                  onChanged: (value) =>
                                      setChoice(() => logo = value ?? false),
                                ),
                            ],
                          ),
                  ),
                ),
                actions: [
                  TextButton(
                    onPressed: () => Navigator.pop(context),
                    child: const Text('Cancelar'),
                  ),
                  FilledButton(
                    key: const Key('profile-copy-confirm'),
                    onPressed:
                        options != null &&
                            locales.isNotEmpty &&
                            (contacts.isNotEmpty || colours.isNotEmpty || logo)
                        ? () {
                            host.confirmProfile(
                              ProfileSelection(
                                jobToken: host.mediaJobToken,
                                locales: locales,
                                contactIds: contacts,
                                colourRoles: colours,
                                includeLogo: logo,
                              ),
                            );
                            confirmed = true;
                            Navigator.pop(context);
                          }
                        : null,
                    child: const Text('Copiar seleção'),
                  ),
                ],
              );
            },
          ),
        ),
      );
    } finally {
      if (!confirmed) host.cancelMedia();
    }
  }

  Future<void> _export(
    List<AppLocale> locales,
    List<ExportFormat> formats,
  ) async {
    var encoding = ImageEncoding.png;
    var zip = locales.length * formats.length > 1;
    final options = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setChoice) => AlertDialog(
          title: const Text('Imagens selecionadas'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text(
                'O ZIP contém apenas as imagens selecionadas, nunca o projeto ou os registos. Várias imagens neste destino exigem ZIP.',
              ),
              DropdownButton<ImageEncoding>(
                value: encoding,
                items: [
                  for (final value in ImageEncoding.values)
                    DropdownMenuItem(
                      value: value,
                      child: Text(value.name.toUpperCase()),
                    ),
                ],
                onChanged: (value) => setChoice(() => encoding = value!),
              ),
              SwitchListTile(
                key: const Key('export-zip'),
                title: const Text('Agrupar imagens em ZIP'),
                value: zip,
                onChanged: (value) => setChoice(() => zip = value),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancelar'),
            ),
            FilledButton(
              key: const Key('export-options-confirm'),
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Rever conteúdo e nomes'),
            ),
          ],
        ),
      ),
    );
    if (options != true || !mounted) return;
    await _runtime!.exportSelected(
      ExportSelection(
        locales: locales,
        formats: formats,
        encoding: encoding,
        bundleAsZip: zip,
      ),
      approveContent: (check) async {
        var omissions = false;
        return showDialog<bool>(
          context: context,
          builder: (context) => StatefulBuilder(
            builder: (context, setChoice) => AlertDialog(
              title: const Text('Verificação de conteúdo'),
              content: SizedBox(
                width: 480,
                child: SingleChildScrollView(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Válidas: ${check.validVariants.length}; inválidas: ${check.invalidVariants.length}',
                      ),
                      for (final variant in [
                        ...check.validVariants,
                        ...check.invalidVariants,
                      ])
                        Text(
                          '${variant.locale.code} — ${variant.format.width} × ${variant.format.height}: ${variant.valid ? 'válida' : 'BLOQUEADA'}\n${variant.problems.map((p) => '${p.severity.name}: ${editorProblemMessage(p.code)}').join('\n')}',
                        ),
                      for (final name in check.proposedNames)
                        Text('Nome proposto: $name'),
                      if (check.invalidVariants.isNotEmpty)
                        CheckboxListTile(
                          key: const Key('export-omit-invalid'),
                          title: const Text(
                            'Omitir explicitamente todas as variantes inválidas acima',
                          ),
                          value: omissions,
                          onChanged: (value) =>
                              setChoice(() => omissions = value ?? false),
                        ),
                    ],
                  ),
                ),
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.pop(context),
                  child: const Text('Cancelar e corrigir'),
                ),
                FilledButton(
                  key: const Key('export-content-confirm'),
                  onPressed:
                      check.selectionValid &&
                          check.validVariants.isNotEmpty &&
                          (check.invalidVariants.isEmpty || omissions)
                      ? () => Navigator.pop(context, omissions)
                      : null,
                  child: const Text('Escolher destino'),
                ),
              ],
            ),
          ),
        );
      },
      approveDestination: (check) async =>
          await showDialog<bool>(
            context: context,
            builder: (context) => AlertDialog(
              title: const Text('Aprovar destino e nomes finais'),
              content: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    for (final name in check.proposedNames)
                      Text('Nome aprovado: $name'),
                    for (final name in check.destination!.displayNames)
                      Text('Nome efetivo no destino: $name'),
                    const Text(
                      'A confirmação exige fechar a escrita e voltar a ler o ficheiro final. Destinos existentes não são substituídos; escolha uma cópia nova.',
                    ),
                  ],
                ),
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.pop(context, false),
                  child: const Text('Cancelar'),
                ),
                FilledButton(
                  key: const Key('export-destination-confirm'),
                  onPressed: check.readyToExport
                      ? () => Navigator.pop(context, true)
                      : null,
                  child: const Text('Confirmar exportação'),
                ),
              ],
            ),
          ) ??
          false,
    );
  }

  @override
  Widget build(BuildContext context) {
    final runtime = _runtime;
    if (runtime == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Recrutamento')),
        body: Column(
          children: [
            if (!_failed) const LinearProgressIndicator(),
            if (_failed)
              const Text(
                'Armazenamento privado indisponível — tentar novamente',
              ),
            FilledButton(onPressed: null, child: const Text('Criar projeto')),
            if (_failed)
              TextButton(
                onPressed: () {
                  setState(() => _failed = false);
                  unawaited(_open());
                },
                child: const Text('Tentar novamente'),
              ),
          ],
        ),
      );
    }
    if (_profileOpen) {
      return ProductProfilePanel(
        runtime: runtime,
        onBack: () => setState(() => _profileOpen = false),
      );
    }
    final session = runtime.session;
    if (session != null) {
      return PopScope(
        canPop: false,
        onPopInvokedWithResult: (didPop, _) {
          if (!didPop) unawaited(_leave());
        },
        child: Scaffold(
          body: SafeArea(
            child: Column(
              children: [
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: [
                      TextButton(
                        key: const Key('product-library'),
                        onPressed: runtime.busy ? null : _leave,
                        child: const Text('Projetos'),
                      ),
                      TextButton(
                        key: const Key('product-draft'),
                        onPressed: runtime.busy ? null : runtime.checkpoint,
                        child: const Text('Confirmar rascunho'),
                      ),
                      TextButton(
                        key: const Key('product-save'),
                        onPressed: runtime.busy ? null : runtime.saveProject,
                        child: const Text('Guardar projeto editável'),
                      ),
                      TextButton(
                        key: const Key('product-open'),
                        onPressed: runtime.busy ? null : _openEditor,
                        child: const Text('Abrir projeto editável'),
                      ),
                      TextButton(
                        key: const Key('product-profile'),
                        onPressed: runtime.busy
                            ? null
                            : () => setState(() => _profileOpen = true),
                        child: const Text('Perfil da empresa'),
                      ),
                      TextButton(
                        key: const Key('product-apply-profile'),
                        onPressed: runtime.busy ? null : _copyProfile,
                        child: const Text('Aplicar seleção do perfil'),
                      ),
                    ],
                  ),
                ),
                if (runtime.busy) const LinearProgressIndicator(),
                if (runtime.canCancel)
                  TextButton(
                    key: const Key('product-cancel'),
                    onPressed: runtime.cancel,
                    child: const Text('Cancelar operação'),
                  ),
                if (runtime.message.isNotEmpty)
                  Text(runtime.message, key: const Key('product-feedback')),
                Expanded(
                  child: EditorShell(
                    key: ValueKey(session),
                    session: session,
                    controller: runtime.host,
                    onExport: runtime.busy ? null : _export,
                  ),
                ),
              ],
            ),
          ),
        ),
      );
    }
    // Remove editor image consumers immediately, but do not advertise the
    // library's next action until the published transition really settles.
    if (runtime.busy) {
      return Scaffold(
        appBar: AppBar(title: const Text('Recrutamento')),
        body: SafeArea(
          child: Column(
            children: [
              const LinearProgressIndicator(),
              if (runtime.canCancel)
                TextButton(
                  key: const Key('product-cancel'),
                  onPressed: runtime.cancel,
                  child: const Text('Cancelar operação'),
                ),
              if (runtime.message.isNotEmpty)
                Text(runtime.message, key: const Key('product-feedback')),
            ],
          ),
        ),
      );
    }
    return Scaffold(
      appBar: AppBar(title: const Text('Recrutamento')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(24),
          children: [
            FilledButton(
              key: const Key('library-create'),
              onPressed: runtime.busy ? null : runtime.create,
              child: const Text('Criar projeto'),
            ),
            TextButton(
              key: const Key('library-open'),
              onPressed: runtime.busy ? null : () => runtime.openProject(),
              child: const Text('Abrir projeto editável'),
            ),
            TextButton(
              key: const Key('library-profile'),
              onPressed: runtime.busy
                  ? null
                  : () => setState(() => _profileOpen = true),
              child: const Text('Perfil da empresa'),
            ),
            if (runtime.rows.isEmpty)
              const Text('Ainda não existem projetos locais.'),
            if (runtime.busy) const LinearProgressIndicator(),
            if (runtime.message.isNotEmpty)
              Text(runtime.message, key: const Key('product-feedback')),
            for (final row in runtime.rows)
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(row.name.isEmpty ? 'Projeto sem nome' : row.name),
                      Text(
                        'Rascunho privado — confirmado: ${row.lastConfirmedSave.toLocal().toIso8601String()}',
                      ),
                      Wrap(
                        spacing: 8,
                        children: [
                          TextButton(
                            key: ValueKey('recover-${row.id}'),
                            onPressed: runtime.busy
                                ? null
                                : () => runtime.recover(row.id),
                            child: const Text('Recuperar'),
                          ),
                          TextButton(
                            key: ValueKey('duplicate-${row.id}'),
                            onPressed: runtime.busy
                                ? null
                                : () => runtime.duplicate(row.id),
                            child: const Text('Duplicar com nova identidade'),
                          ),
                          TextButton(
                            key: ValueKey('remove-${row.id}'),
                            onPressed: runtime.busy
                                ? null
                                : () => _remove(row.id),
                            child: const Text('Remover projeto local'),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
