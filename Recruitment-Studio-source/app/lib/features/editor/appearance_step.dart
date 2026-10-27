import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../design/design_tokens.dart';
import '../../shared/admission_budget.dart';
import '../../shared/problem.dart';
import '../../shared/work_limits.dart';
import '../composition/editorial_layout.dart';
import '../composition/export_format.dart';
import '../projects/project.dart';
import 'editor_host_controller.dart';
import 'editor_controls.dart';
import 'editor_session.dart';

/// Controlled appearance, never free positioning or automatic text shrinking.
/// Slider gestures retain one scalar draft; domain/preview changes only at end.
class AppearanceStep extends StatefulWidget {
  const AppearanceStep({
    super.key,
    required this.controller,
    this.focusProblem,
    this.focusRequest = 0,
  });
  final EditorHostController controller;
  final Problem? focusProblem;
  final int focusRequest;

  @override
  State<AppearanceStep> createState() => _AppearanceStepState();
}

class _AppearanceStepState extends State<AppearanceStep> {
  EditorHostController get host => widget.controller;
  AdmissionTicket? _credit;
  @override
  void initState() {
    super.initState();
    try {
      _credit = AdmissionBudget.shared.reserve(32 * 1024);
    } on CapacityExceeded {
      /* Static refusal. */
    }
  }

  @override
  void didUpdateWidget(covariant AppearanceStep oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!identical(oldWidget.controller, host)) {
      _draftKey = null;
      _draftValue = null;
    }
  }

  @override
  void dispose() {
    _draftKey = null;
    _draftValue = null;
    _credit?.release();
    _credit = null;
    super.dispose();
  }

  String? _draftKey;
  double? _draftValue;

  void _edit(void Function(EditorSession) action) {
    try {
      host.edit(action);
    } on CapacityExceeded {
      _refuse('Limite de capacidade atingido. O projeto não foi alterado.');
    } on ArgumentError {
      _refuse(
        'Valor inválido. Use os limites do modelo; o valor anterior foi mantido.',
      );
    }
  }

  void _refuse(String message) {
    final messenger = ScaffoldMessenger.of(context);
    messenger.clearSnackBars();
    messenger.showSnackBar(SnackBar(content: Text(message)));
  }

  void _body(int value) => _edit((session) {
    final old = session.project.style;
    session.replaceProject(
      session.project.withStyle(
        ProjectStyle(
          ink: old.ink,
          accent: old.accent,
          paper: old.paper,
          bodyPx: value,
          logoScale: old.logoScale,
        ),
      ),
    );
  });

  Widget _colour(String role, String label, int value) {
    final source = host;
    return EditorTextField(
      key: ValueKey('colour-control-$role'),
      fieldKey: ValueKey('colour-$role'),
      value: value.toRadixString(16).padLeft(8, '0'),
      label: '$label — RGB/ARGB hexadecimal',
      maximumUnits: 9,
      focusRequest: widget.focusProblem?.field == role
          ? widget.focusRequest
          : 0,
      invalidMessage: 'Cor inválida. Use 6 dígitos RGB ou 8 ARGB; o valor anterior foi mantido.',
      onEdited: (_) {},
      commitKey: ValueKey('apply-colour-$role'),
      onCommit: (text) {
        if (!mounted || !identical(source, host) || source.session.isDisposed) {
          return;
        }
        final match = RegExp(r'^#?([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$')
            .firstMatch(text);
        if (match == null) throw ArgumentError('Invalid colour');
        final hex = match.group(1)!;
        final colour = int.parse(hex.length == 6 ? 'ff$hex' : hex, radix: 16);
        source.edit((session) {
          final old = session.project.style;
          session.replaceProject(
            session.project.withStyle(
              ProjectStyle(
                ink: role == 'ink' ? colour : old.ink,
                accent: role == 'accent' ? colour : old.accent,
                paper: role == 'paper' ? colour : old.paper,
                bodyPx: old.bodyPx,
                logoScale: old.logoScale,
              ),
            ),
          );
        });
      },
    );
  }

  void _resetColours() => _edit((session) {
    final old = session.project.style;
    session.replaceProject(
      session.project.withStyle(
        ProjectStyle(
          ink: DesignTokens.ink.toARGB32(),
          accent: DesignTokens.accent.toARGB32(),
          paper: DesignTokens.background.toARGB32(),
          bodyPx: old.bodyPx,
          logoScale: old.logoScale,
        ),
      ),
    );
  });

  Widget _slider(
    String key,
    String label,
    double value,
    double min,
    double max,
    void Function(double) commit,
  ) {
    final source = host;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label),
        Slider(
          key: ValueKey(key),
          label: (_draftKey == key ? _draftValue! : value).toStringAsFixed(2),
          value: _draftKey == key ? _draftValue! : value.clamp(min, max),
          min: min,
          max: max,
          onChanged: (value) {
            if (!mounted ||
                !identical(source, host) ||
                source.session.isDisposed) {
              return;
            }
            setState(() {
              _draftKey = key;
              _draftValue = value;
            });
          },
          onChangeEnd: (value) {
            if (!mounted ||
                !identical(source, host) ||
                source.session.isDisposed) {
              return;
            }
            setState(() {
              _draftKey = null;
              _draftValue = null;
            });
            if (!value.isFinite || value < min || value > max) {
              _refuse('Valor inválido. O valor anterior foi mantido.');
            } else {
              commit(value);
            }
          },
        ),
      ],
    );
  }

  ({double width, double height, double zoom, double x, double y}) _crop() {
    final project = host.session.project;
    final photo = project.photo!;
    final target = EditorialRegions.forFormat(host.format).photo;
    final ratio = target.width / target.height / (photo.width / photo.height);
    final baseW = math.min(1.0, ratio);
    final baseH = math.min(1.0, 1 / ratio);
    final old = project.cropByFormat[host.format];
    final zoom = old == null ? 1.0 : (baseW / old.width).clamp(1.0, 8.0);
    final width = baseW / zoom, height = baseH / zoom;
    return (
      width: width,
      height: height,
      zoom: zoom,
      x: old == null || width == 1
          ? .5
          : (old.left / (1 - width)).clamp(0.0, 1.0),
      y: old == null || height == 1
          ? .5
          : (old.top / (1 - height)).clamp(0.0, 1.0),
    );
  }

  void _commitCrop({double? zoom, double? x, double? y}) {
    final crop = _crop();
    final scale = crop.zoom / (zoom ?? crop.zoom);
    final width = crop.width * scale, height = crop.height * scale;
    final left = (1 - width) * (x ?? crop.x);
    final top = (1 - height) * (y ?? crop.y);
    _edit(
      (session) => session.setCrop(
        host.format,
        NormalizedRect(
          left: left,
          top: top,
          width: math.min(width, 1 - left),
          height: math.min(height, 1 - top),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) => _credit == null
      ? const EditorCapacityRefusal()
      : AnimatedBuilder(
          animation: host,
          builder: (context, _) {
            final project = host.session.project;
            final crop = project.photo == null ? null : _crop();
            return SingleChildScrollView(
              // Host identity is an incarnation, unlike per-edit generation.
              // Remount text/focus owners even when committed colours are equal.
              key: ObjectKey(host),
              padding: const EdgeInsets.all(24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Aspeto',
                    style: Theme.of(context).textTheme.headlineMedium,
                  ),
                  const SizedBox(height: 16),
                  EditorMediaStatus(controller: host),
                  TextButton(
                    key: const Key('choose-logo'),
                    style: TextButton.styleFrom(
                      minimumSize: const Size(48, 48),
                    ),
                    onPressed: host.mediaAvailable
                        ? () => host.requestMedia(AssetKind.logo)
                        : null,
                    child: Text(
                      project.logo == null
                          ? 'Escolher logótipo local (opcional)'
                          : 'Substituir logótipo',
                    ),
                  ),
                  if (project.logo != null)
                    _slider(
                      'logo-scale',
                      'Escala do logótipo — proporção preservada',
                      project.style.logoScale,
                      WorkLimits.minimumLogoScale,
                      WorkLimits.maximumLogoScale,
                      (value) =>
                          _edit((session) => session.setLogoScale(value)),
                    ),
                  const SizedBox(height: 16),
                  const Text(
                    'Corpo do texto — pixels na arte. Sem redução automática.',
                  ),
                  Wrap(
                    spacing: 8,
                    children: [
                      for (final size in WorkLimits.bodyPxChoices)
                        ChoiceChip(
                          key: ValueKey('body-$size'),
                          label: Text('$size px'),
                          selected: project.style.bodyPx == size,
                          onSelected: (_) => _body(size),
                        ),
                    ],
                  ),
                  const SizedBox(height: 24),
                  _colour('ink', 'Texto', project.style.ink),
                  _colour('accent', 'Destaque', project.style.accent),
                  _colour('paper', 'Papel', project.style.paper),
                  TextButton(
                    key: const Key('reset-colours'),
                    onPressed: _resetColours,
                    style: TextButton.styleFrom(
                      minimumSize: const Size(48, 48),
                    ),
                    child: const Text('Repor cores Editorial B'),
                  ),
                  const SizedBox(height: 24),
                  Text(
                    'Enquadramento por formato',
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  Wrap(
                    spacing: 8,
                    children: [
                      for (final format in ExportFormat.values)
                        ChoiceChip(
                          key: ValueKey('crop-format-${format.name}'),
                          label: Text('${format.width} × ${format.height}'),
                          selected: host.format == format,
                          onSelected: (_) {
                            setState(() {
                              _draftKey = null;
                              _draftValue = null;
                            });
                            host.selectFormat(format);
                          },
                        ),
                    ],
                  ),
                  if (crop == null)
                    const Text(
                      'Escolha uma fotografia em Conteúdo para ajustar o recorte.',
                    )
                  else ...[
                    const Text(
                      'Recorte proporcional à área de fotografia deste formato. '
                      'Os outros formatos e os textos não são alterados.',
                    ),
                    _slider(
                      'crop-zoom',
                      'Ampliação do recorte',
                      crop.zoom,
                      1,
                      8,
                      (value) => _commitCrop(zoom: value),
                    ),
                    _slider(
                      'crop-horizontal',
                      'Posição horizontal',
                      crop.x,
                      0,
                      1,
                      (value) => _commitCrop(x: value),
                    ),
                    _slider(
                      'crop-vertical',
                      'Posição vertical',
                      crop.y,
                      0,
                      1,
                      (value) => _commitCrop(y: value),
                    ),
                  ],
                ],
              ),
            );
          },
        );
}
