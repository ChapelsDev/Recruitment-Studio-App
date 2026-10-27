import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../shared/admission_budget.dart';
import '../../shared/problem.dart';
import '../../shared/work_limits.dart';
import 'editor_host_controller.dart';

/// Bounded control owned by its mounted state, never by the caller. The credit
/// precedes allocation and covers control, both worst-size UTF16 edit values and
/// fixed diagnostics. No rejected input or historical controller map is retained.
class EditorTextField extends StatefulWidget {
  const EditorTextField({
    super.key,
    required this.fieldKey,
    required this.value,
    required this.label,
    required this.onEdited,
    this.maximumUnits = WorkLimits.fieldUtf16Units,
    this.focusRequest = 0,
    this.onCommit,
    this.commitKey,
    this.invalidMessage = 'Valor inválido. O valor anterior foi mantido.',
  }) : assert(maximumUnits > 0 && maximumUnits <= WorkLimits.fieldUtf16Units);
  final int maximumUnits, focusRequest;
  final void Function(String)? onCommit;
  final Key? commitKey;
  final String invalidMessage;
  final Key fieldKey;
  final String value, label;
  final void Function(String) onEdited;

  @override
  State<EditorTextField> createState() => _EditorTextFieldState();
}

/// Two correction actions use independently prepaid focus/visibility owners.
/// At most one post-frame callback retains each owner, including after unmount.
class EditorActionButton extends StatefulWidget {
  const EditorActionButton({
    super.key,
    required this.buttonKey,
    required this.label,
    required this.onPressed,
    this.focusRequest = 0,
  });
  final Key buttonKey;
  final String label;
  final VoidCallback? onPressed;
  final int focusRequest;

  @override
  State<EditorActionButton> createState() => _EditorActionButtonState();
}

class _EditorActionButtonState extends State<EditorActionButton> {
  AdmissionTicket? _credit;
  FocusNode? _focus;
  bool _queued = false, _disposed = false;

  @override
  void initState() {
    super.initState();
    try {
      final credit = AdmissionBudget.shared.reserve(4096);
      try {
        _focus = FocusNode();
        _credit = credit;
        _queueFocus();
      } catch (_) {
        credit.release();
        rethrow;
      }
    } on CapacityExceeded {
      /* Static refusal, no unpaid focus owner. */
    }
  }

  @override
  void didUpdateWidget(covariant EditorActionButton oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.focusRequest != oldWidget.focusRequest ||
        (oldWidget.onPressed == null && widget.onPressed != null)) {
      _queueFocus();
    }
  }

  void _queueFocus() {
    if (_focus == null ||
        _queued ||
        widget.focusRequest == 0 ||
        widget.onPressed == null) {
      return;
    }
    _queued = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      try {
        if (!_disposed &&
            mounted &&
            widget.focusRequest != 0 &&
            widget.onPressed != null) {
          _focus?.requestFocus();
          unawaited(Scrollable.ensureVisible(context, alignment: .15));
        }
      } finally {
        _queued = false;
        if (_disposed) _release();
      }
    });
  }

  void _release() {
    _credit?.release();
    _credit = null;
  }

  @override
  void dispose() {
    _disposed = true;
    _focus?.dispose();
    _focus = null;
    if (!_queued) _release();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => _credit == null
      ? const EditorCapacityRefusal()
      : TextButton(
          key: widget.buttonKey,
          focusNode: _focus,
          style: TextButton.styleFrom(minimumSize: const Size(48, 48)),
          onPressed: widget.onPressed,
          child: Text(widget.label),
        );
}

/// Static refusal needs no owned controller, collection or pending job.
class EditorCapacityRefusal extends StatelessWidget {
  const EditorCapacityRefusal({super.key});
  @override
  Widget build(BuildContext context) => const Padding(
    key: Key('editor-capacity-refusal'),
    padding: EdgeInsets.all(24),
    child: Text(
      'Capacidade de memória indisponível. Feche outros editores '
      'e volte a abrir esta etapa. O projeto não foi alterado.',
    ),
  );
}

/// Status reflects the real shared media lane; cancelling invalidates its token.
class EditorMediaStatus extends StatelessWidget {
  const EditorMediaStatus({super.key, required this.controller});
  final EditorHostController controller;

  @override
  Widget build(BuildContext context) => controller.mediaBusy
      ? Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const LinearProgressIndicator(),
            const Text('A escolher ou validar o recurso local…'),
            TextButton(
              key: const Key('cancel-media'),
              style: TextButton.styleFrom(minimumSize: const Size(48, 48)),
              onPressed: controller.cancelMedia,
              child: const Text('Cancelar recurso'),
            ),
          ],
        )
      : controller.mediaProblem == null
      ? const SizedBox.shrink()
      : Semantics(
          liveRegion: true,
          child: Text(
            editorProblemMessage(controller.mediaProblem!.code),
            key: const Key('media-error'),
          ),
        );
}

String editorProblemMessage(ProblemCode code) => switch (code) {
  ProblemCode.missingPhoto => 'Falta uma fotografia válida.',
  ProblemCode.missingHeadline => 'Falta o título manual deste idioma.',
  ProblemCode.missingContact =>
    'Falta pelo menos um contacto manual deste idioma.',
  ProblemCode.incompleteSection =>
    'Secção incompleta: título sem itens preenchidos.',
  ProblemCode.textOverflow => 'O texto não cabe nesta variante. Edite, oculte ou mude o formato; não será reduzido automaticamente.',
  ProblemCode.unsupportedGlyph => 'A fonte incluída não contém um carácter deste campo. O texto foi preservado para correção manual.',
  ProblemCode.insufficientResolution =>
    'A fotografia tem resolução útil insuficiente para esta variante.',
  ProblemCode.lowContrast =>
    'As cores têm contraste reduzido. Corrija ou reponha as cores.',
  ProblemCode.invalidResource => 'Imagem inválida ou não suportada. Escolha um JPEG ou PNG válido dentro dos limites.',
  ProblemCode.capacityExceeded => 'Capacidade indisponível. Reduza o recurso ou feche outros editores; o projeto foi preservado.',
  ProblemCode.operationCancelled =>
    'Operação cancelada. O projeto foi preservado.',
  ProblemCode.permissionDenied =>
    'Sem permissão de leitura. Escolha novamente um ficheiro local acessível.',
  ProblemCode.noSpace =>
    'Espaço insuficiente. Liberte espaço e tente novamente.',
  ProblemCode.ioFailure => 'Não foi possível ler ou processar o recurso local. Tente novamente; o projeto foi preservado.',
  ProblemCode.incompatibleProject =>
    'Projeto incompatível. O projeto atual foi preservado.',
  ProblemCode.unsafePackage =>
    'Pacote recusado por segurança. O projeto atual foi preservado.',
  ProblemCode.invalidSelection =>
    'Escolha pelo menos um idioma e um formato válidos.',
};

class _EditorTextFieldState extends State<EditorTextField> {
  static const _creditBytes = 8192 + 8 * WorkLimits.fieldUtf16Units;
  static const _overflow =
      'Limite de 16 000 unidades UTF-16 por campo excedido. '
      'O valor anterior foi mantido; reduza o texto e tente novamente.';
  static const _capacity =
      'Capacidade de memória indisponível. '
      'O valor anterior foi mantido; reduza o texto e tente novamente.';
  AdmissionTicket? _credit;
  TextEditingController? _text;
  FocusNode? _focus;
  bool _focusQueued = false, _disposed = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _admit();
  }

  void _admit() {
    try {
      if (widget.value.length > WorkLimits.fieldUtf16Units) {
        throw const CapacityExceeded();
      }
      final credit = AdmissionBudget.shared.reserve(_creditBytes);
      try {
        _text = TextEditingController(text: widget.value);
        _focus = FocusNode();
        _credit = credit;
        _queueFocus();
      } catch (_) {
        credit.release();
        rethrow;
      }
    } on CapacityExceeded {
      _error = _capacity;
    }
  }

  @override
  void didUpdateWidget(covariant EditorTextField oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.value != oldWidget.value && _text?.text != widget.value) {
      _restore();
    }
    if (widget.focusRequest != oldWidget.focusRequest) _queueFocus();
  }

  void _queueFocus() {
    if (widget.focusRequest == 0 || _focusQueued || _focus == null) return;
    _focusQueued = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      try {
        if (!_disposed && mounted && widget.focusRequest != 0) {
          _focus?.requestFocus();
          unawaited(Scrollable.ensureVisible(context, alignment: .15));
        }
      } finally {
        _focusQueued = false;
        if (_disposed) _release();
      }
    });
  }

  void _release() {
    _credit?.release();
    _credit = null;
  }

  void _restore() {
    _text?.value = TextEditingValue(
      text: widget.value,
      selection: TextSelection.collapsed(offset: widget.value.length),
    );
  }

  @override
  void dispose() {
    _disposed = true;
    _text?.clear();
    _text?.dispose();
    _text = null;
    _focus?.dispose();
    _focus = null;
    // A queued focus callback retains this state; keep its credit until it exits.
    if (!_focusQueued) _release();
    super.dispose();
  }

  void _commit() {
    // A retired incarnation may still have an already queued submit callback.
    if (_disposed || !mounted || _text == null) return;
    try {
      widget.onCommit?.call(_text!.text);
      setState(() => _error = null);
    } on ArgumentError {
      setState(() => _error = widget.invalidMessage);
    } on CapacityExceeded {
      setState(() => _error = _capacity);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_text == null) {
      return TextButton(
        onPressed: () => setState(_admit),
        child: const Text(_capacity),
      );
    }
    return Padding(
      padding: const EdgeInsets.only(bottom: 20),
      child: TextField(
        key: widget.fieldKey,
        controller: _text,
        focusNode: _focus,
        minLines: 1,
        maxLines: 4,
        inputFormatters: [
          TextInputFormatter.withFunction((oldValue, newValue) {
            if (newValue.text.length > widget.maximumUnits) {
              final message = widget.maximumUnits == WorkLimits.fieldUtf16Units
                  ? _overflow
                  : widget.invalidMessage;
              if (_error != message) {
                setState(() => _error = message);
              }
              return oldValue;
            }
            if (_error != null) {
              setState(() => _error = null);
            }
            return newValue;
          }),
        ],
        decoration: InputDecoration(
          labelText: widget.label,
          errorText: _error,
          errorMaxLines: 4,
          suffixIcon: widget.onCommit == null
              ? null
              : TextButton(
                  key: widget.commitKey,
                  style: TextButton.styleFrom(minimumSize: const Size(48, 48)),
                  onPressed: _commit,
                  child: const Text('Aplicar'),
                ),
        ),
        onSubmitted: widget.onCommit == null ? null : (_) => _commit(),
        onChanged: (value) {
          try {
            widget.onEdited(value);
          } on CapacityExceeded {
            _restore();
            setState(() => _error = _capacity);
          }
        },
      ),
    );
  }
}
