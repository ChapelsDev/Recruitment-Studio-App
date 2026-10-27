import 'dart:async';
import 'dart:ui' as ui;

import 'package:flutter/rendering.dart';
import 'package:flutter/scheduler.dart';
import 'package:flutter/widgets.dart';

import '../../shared/admission_budget.dart';
import '../../shared/operation.dart';
import '../../shared/problem.dart';
import '../../shared/work_budget.dart';
import '../composition/editorial_layout.dart';
import '../composition/export_format.dart';
import '../composition/layout_scene.dart';
import '../composition/variant_renderer.dart';
import '../projects/project.dart';
import 'editor_session.dart';

enum PreviewStatus { empty, loading, ready, error, closing }

enum PreviewPhase {
  beforeInspection,
  afterInspection,
  beforeRender,
  afterRender,
  beforeDecode,
  afterDecode,
  beforePublish,
  beforeRetire,
}

enum PreviewEvent {
  stageStarted,
  stageSettled,
  frameReserved,
  framePublished,
  leafDetached,
  frameRetired,
  outputDropped,
  snapshotReleased,
}

/// Holds/faults already-paid work only. It cannot supply pixels or resources.
final class PreviewTestHooks {
  const PreviewTestHooks({this.beforePhase, this.onEvent, this.beforeRegistration});
  // Synchronous fault/pressure seam after stage creation has been paid; cannot
  // supply operations/pixels/resources or replace the real pending registration.
  final void Function(PreviewPhase)? beforeRegistration;
  final Future<void> Function(PreviewPhase)? beforePhase;
  final void Function(PreviewEvent, PreviewPhase, int, int, int)? onEvent;
}

final class _Request {
  const _Request(this.session, this.locale, this.format, this.token);
  final EditorSession session;
  final AppLocale locale;
  final ExportFormat format;
  final int token;
}

/// A scalar fence. In particular, it retains neither a bundle nor a released
/// capture. Capture currentness is checked separately while the handle is live.
final class _Tag {
  _Tag(_Request request, CapturedSnapshot capture)
    : session = request.session,
      locale = request.locale,
      format = request.format,
      token = request.token,
      projectId = capture.projectId,
      revision = capture.revision,
      generation = capture.sessionGeneration;
  final EditorSession session;
  final AppLocale locale;
  final ExportFormat format;
  final int token, revision, generation;
  final String projectId;
}

/// One PNG processing job, one metadata replacement and at most two frontend
/// allocations. Each stage finishes independently; an idle image owns no slot.
final class PreviewOwner extends ChangeNotifier {
  PreviewOwner({
    required this._budget,
    required this._renderer,
    LayoutEngine? layout,
    PreviewTestHooks? testHooks,
  }) : _layout = layout ?? EditorialLayout(),
       _hooks = testHooks {
    // Close must remain available even when a reentrant hook exhausts ordinary
    // headroom. Prepay its one completion/relay envelope before creating it.
    _closeControl = AdmissionBudget.shared.reserve(4096);
    // Prepayment must not choose a constructor-zone completion scheduler.
    // Until close exists, the owner is the only lifetime target for this credit.
    _unclosedCloseFinalizer.attach(this, _closeControl, detach: _closeControl);
  }
  final WorkBudgetController _budget;
  final VariantRenderer _renderer;
  final LayoutEngine _layout;
  final PreviewTestHooks? _hooks;
  final Set<PreviewFrame> _frames = {};
  PreviewFrame? _current;
  PreviewFrame? get current => _current;
  PreviewStatus _status = PreviewStatus.empty;
  PreviewStatus get status => _status;
  List<Problem> _problems = const [];
  List<Problem> get problems => _problems;
  int get ownedImageCount => _frames.length;
  int _token = 0;
  _Request? _desired;
  WorkOperation? _stage;
  bool _running = false, _paused = false, _closing = false;
  bool _notifierDisposed = false;
  Future<void>? _idle;
  Future<void>? _processing;
  Future<void>? _retiring;
  Future<void>? _close;
  late final AdmissionTicket _closeControl;
  static final Finalizer<AdmissionTicket> _unclosedCloseFinalizer =
      Finalizer((ticket) { ticket.release(); });
  Future<void> get idle => _idle ?? Future<void>.value();

  /// Actual producer settlement, excluding an old displayed leaf's retirement.
  /// Media can start while two frontend allocations remain independently paid.
  Future<void> get processingSettled => _processing ?? Future<void>.value();

  void _notify() {
    if (!_notifierDisposed) {
      notifyListeners();
    }
  }

  void _event(PreviewEvent event, PreviewPhase phase, int token) {
    try {
      _hooks?.onEvent?.call(
        event,
        phase,
        token,
        _frames.length,
        _budget.reservedBytes,
      );
    } catch (_) {
      // A passive observer is never an ownership or publication authority.
    }
  }

  Future<void> _phase(PreviewPhase phase) async {
    await _hooks?.beforePhase?.call(phase);
  }

  void request(EditorSession session, AppLocale locale, ExportFormat format) {
    if (_closing) {
      throw StateError('Preview closing');
    }
    if (session.isDisposed || !session.project.localeOrder.contains(locale)) {
      throw ArgumentError('Unavailable preview selection');
    }
    _desired = _Request(session, locale, format, ++_token);
    _stage?.cancel();
    _status = PreviewStatus.loading;
    _notify();
    _start();
  }

  /// Serialized media priority. Only metadata and already-paid frames survive.
  void setPaused(bool paused) {
    if (_closing) {
      return;
    }
    _paused = paused;
    if (paused) {
      _token++;
      _desired = null;
      _stage?.cancel();
    } else {
      _start();
    }
  }

  void _start() {
    if (_running || _paused || _closing || _desired == null) {
      return;
    }
    AdmissionTicket control;
    try {
      control = AdmissionBudget.shared.reserve(4096);
    } on CapacityExceeded {
      _desired = null;
      // Refusal notification may synchronously request another selection.
      // Treat it as bounded metadata, not recursive admission under pressure.
      _running = true;
      try {
        _failControlAdmission();
      } finally {
        _running = false;
      }
      return;
    }
    final completion = Completer<void>();
    final idle = completion.future;
    control.retain(idle);
    _idle = idle;
    _running = true;
    // Publish the real obligation before the synchronous prefix of _pump.
    // The relay transfers errors as well as success, after its actual finally.
    unawaited(_pump().then(completion.complete,
        onError: completion.completeError));
  }

  Future<void> _pump() async {
    try {
      while (!_closing && !_paused && _desired != null) {
        final retiring = _retiring;
        if (retiring != null) {
          // Only an actual previous frame can install this barrier. A fresh
          // owner has no fake-zone idle sentinel to await in a real request.
          await retiring;
          if (identical(_retiring, retiring)) { _retiring = null; }
        }
        if (_closing || _paused || _desired == null) {
          break;
        }
        final request = _desired!;
        AdmissionTicket control;
        try {
          control = AdmissionBudget.shared.reserve(4096);
        } on CapacityExceeded {
          if (identical(_desired, request)) {
            _desired = null;
          }
          if (!_closing && !_paused && request.token == _token &&
              !request.session.isDisposed) {
            _failControlAdmission();
          }
          // A refusal is a settled producer outcome. Do not spin on a request
          // installed by a reentrant refusal listener while headroom is zero.
          break;
        }
        _desired = null;
        final completion = Completer<void>();
        final processing = completion.future;
        control.retain(processing);
        _processing = processing;
        // _job can create a capture/stage and reenter close before returning.
        // No callback can observe this job without its finally-bound barrier.
        unawaited(_job(request).then(completion.complete,
            onError: completion.completeError));
        await processing;
      }
    } finally {
      _running = false;
    }
  }

  bool _currentTag(_Tag tag) =>
      !_closing &&
      !_paused &&
      tag.token == _token &&
      !tag.session.isDisposed &&
      tag.session.project.id == tag.projectId &&
      tag.session.project.revision == tag.revision &&
      tag.session.generation == tag.generation;
  void _check(_Tag tag, [CapturedSnapshot? capture]) {
    if (!_currentTag(tag) ||
        (capture != null && !tag.session.isSnapshotCurrent(capture))) {
      throw const OperationException(ProblemCode.operationCancelled);
    }
  }

  WorkOperation _operation(_Tag tag) {
    final op = WorkOperation.create(
      projectId: tag.projectId,
      revision: tag.revision,
      sessionGeneration: tag.generation,
    );
    _stage = op;
    return op;
  }

  Future<void> _finishStage(WorkOperation op, Completer<void> done,
      PreviewPhase phase, int token) async {
    if (!done.isCompleted) {
      done.complete();
    }
    try {
      await op.finish();
    } finally {
      if (identical(_stage, op)) {
        _stage = null;
      }
      _event(PreviewEvent.stageSettled, phase, token);
    }
  }

  Future<List<Problem>> _inspect(_Tag tag, CapturedSnapshot capture) async {
    final op = _operation(tag);
    final done = Completer<void>();
    WorkLease? lease;
    LayoutScene? scene;
    try {
      _hooks?.beforeRegistration?.call(PreviewPhase.beforeInspection);
      op.registerPending(done.future);
      lease = await _budget.acquire(op, 8 * 1024 * 1024);
      _check(tag, capture);
      _event(
        PreviewEvent.stageStarted,
        PreviewPhase.beforeInspection,
        tag.token,
      );
      await _phase(PreviewPhase.beforeInspection);
      _check(tag, capture);
      scene = _layout.compose(capture.bundle.project, tag.locale, tag.format);
      return List<Problem>.unmodifiable(scene.problems);
    } finally {
      try {
        scene?.dispose();
      } finally {
        scene = null;
        try {
          lease?.release();
        } finally {
          await _finishStage(op, done, PreviewPhase.afterInspection, tag.token);
        }
      }
    }
  }

  Future<RenderedVariant> _render(_Tag tag, CapturedSnapshot capture) async {
    final op = _operation(tag);
    try {
      _event(PreviewEvent.stageStarted, PreviewPhase.beforeRender, tag.token);
      return await _renderer.render(
        capture.bundle,
        tag.locale,
        tag.format,
        ImageEncoding.png,
        operation: op,
      );
    } finally {
      // Never finish while a wrapper or the renderer still borrows the capture.
      await op.finish();
      _stage = null;
      _event(PreviewEvent.stageSettled, PreviewPhase.afterRender, tag.token);
    }
  }

  Future<PreviewFrame> _decode(_Tag tag, RenderedVariant output) async {
    final op = _operation(tag);
    final done = Completer<void>();
    WorkLease? lease;
    WorkOperation? frameOwner;
    ui.ImmutableBuffer? buffer;
    ui.ImageDescriptor? descriptor;
    ui.Codec? codec;
    ui.Image? image;
    PreviewFrame? provisional;
    try {
      _hooks?.beforeRegistration?.call(PreviewPhase.beforeDecode);
      op.registerPending(done.future);
      final n = output.bytes.lengthInBytes;
      final p = tag.format.width * tag.format.height;
      lease = await _budget.acquire(op, 2 * n + 8 * p + 8 * 1024 * 1024);
      _check(tag);
      if (output.encoding != ImageEncoding.png ||
          output.width != tag.format.width ||
          output.height != tag.format.height ||
          output.locale != tag.locale ||
          output.format != tag.format ||
          output.bytes.offsetInBytes != 0 ||
          output.bytes.buffer.lengthInBytes != n) {
        throw const OperationException(ProblemCode.invalidResource);
      }
      frameOwner = WorkOperation.create();
      _budget.reserve(frameOwner, n + 8 * p + 8 * 1024 * 1024);
      _event(PreviewEvent.frameReserved, PreviewPhase.beforeDecode, tag.token);
      _event(PreviewEvent.stageStarted, PreviewPhase.beforeDecode, tag.token);
      buffer = await ui.ImmutableBuffer.fromUint8List(output.bytes);
      _check(tag);
      descriptor = await ui.ImageDescriptor.encoded(buffer);
      _check(tag);
      if (descriptor.width != output.width ||
          descriptor.height != output.height) {
        throw const OperationException(ProblemCode.invalidResource);
      }
      codec = await descriptor.instantiateCodec();
      _check(tag);
      if (codec.frameCount != 1) {
        throw const OperationException(ProblemCode.invalidResource);
      }
      image = (await codec.getNextFrame()).image;
      _check(tag);
      if (image.width != output.width || image.height != output.height) {
        throw const OperationException(ProblemCode.invalidResource);
      }
      provisional = PreviewFrame._(image, frameOwner, tag, this);
      _frames.add(provisional);
      image = null;
      frameOwner = null;
      await _phase(PreviewPhase.afterDecode);
      _check(tag);
      final result = provisional;
      provisional = null;
      return result;
    } finally {
      try {
        try {
          image?.dispose();
        } finally {
          try {
            codec?.dispose();
          } finally {
            try {
              descriptor?.dispose();
            } finally {
              buffer?.dispose();
            }
          }
        }
      } finally {
        image = null;
        codec = null;
        descriptor = null;
        buffer = null;
        try {
          if (provisional != null) {
            await provisional._requestRetire();
          }
        } finally {
          provisional = null;
          try {
            if (frameOwner != null) {
              await frameOwner.finish();
            }
          } finally {
            frameOwner = null;
            try {
              lease?.release();
            } finally {
              await _finishStage(op, done, PreviewPhase.afterDecode, tag.token);
            }
          }
        }
      }
    }
  }

  Future<void> _dropOutput(RenderedVariant output) => output.dispose();
  Future<void> _job(_Request request) async {
    CapturedSnapshot? capture;
    RenderedVariant? output;
    PreviewFrame? frame;
    _Tag? tag;
    try {
      if (request.session.isDisposed) {
        return;
      }
      capture = request.session.captureSnapshot();
      tag = _Tag(request, capture);
      _check(tag, capture);
      final problems = await _inspect(tag, capture);
      _check(tag, capture);
      await _phase(PreviewPhase.afterInspection);
      _check(tag, capture);
      _problems = problems;
      if (problems.any((p) => p.severity == ProblemSeverity.error)) {
        _status = PreviewStatus.error;
        _removeCurrent();
        _notify();
        return;
      }
      await _phase(PreviewPhase.beforeRender);
      _check(tag, capture);
      output = await _render(tag, capture);
      _check(tag, capture);
      await _phase(PreviewPhase.afterRender);
      _check(tag, capture);
      capture.release();
      capture = null;
      _event(
        PreviewEvent.snapshotReleased,
        PreviewPhase.afterRender,
        tag.token,
      );
      await _phase(PreviewPhase.beforeDecode);
      _check(tag);
      frame = await _decode(tag, output);
      // The helper has exited and disposed every buffer/descriptor/codec/view.
      final dropping = _dropOutput(output);
      output = null;
      await dropping;
      _event(PreviewEvent.outputDropped, PreviewPhase.afterDecode, tag.token);
      _check(tag);
      await _phase(PreviewPhase.beforePublish);
      _check(tag);
      final old = _current;
      _current = frame;
      frame = null;
      _status = PreviewStatus.ready;
      if (old != null) {
        _retiring = old._requestRetire();
      }
      _event(
        PreviewEvent.framePublished,
        PreviewPhase.beforePublish,
        tag.token,
      );
      _notify();
    } on OperationException catch (error) {
      if (tag != null &&
          _currentTag(tag) &&
          error.code != ProblemCode.operationCancelled) {
        _fail(error.problem);
      }
    } on CapacityExceeded catch (error) {
      if (tag != null && _currentTag(tag)) {
        _fail(error.problem);
      }
    } catch (_) {
      if (tag != null && _currentTag(tag)) {
        _fail(
          const Problem(
            code: ProblemCode.ioFailure,
            severity: ProblemSeverity.error,
          ),
        );
      }
    } finally {
      if (capture != null) {
        capture.release();
        capture = null;
        _event(
          PreviewEvent.snapshotReleased,
          PreviewPhase.afterRender,
          request.token,
        );
      }
      if (output != null) {
        final dropping = _dropOutput(output);
        output = null;
        await dropping;
        _event(
          PreviewEvent.outputDropped,
          PreviewPhase.afterDecode,
          request.token,
        );
      }
      if (frame != null) {
        await frame._requestRetire();
        frame = null;
      }
    }
  }

  void _failControlAdmission() {
    // This branch can have zero ordinary headroom. Its finite diagnostic is a
    // shared constant, not a freshly allocated escaped list/Problem graph.
    _problems = const [Problem(
      code: ProblemCode.capacityExceeded,
      severity: ProblemSeverity.error,
    )];
    _status = PreviewStatus.error;
    final current = _current;
    if (current != null && !_currentTag(current._tag)) {
      _removeCurrent();
    }
    _notify();
    // A reentrant listener can replace only the one desired metadata record.
    // It is still unadmitted, so do not leave a fictitious loading state.
    if (!_closing && _desired != null) {
      _status = PreviewStatus.error;
    }
  }

  void _fail(Problem problem) {
    _problems = List.unmodifiable([problem]);
    _status = PreviewStatus.error;
    // Preserve only a raster that still represents the current scalar state.
    final current = _current;
    if (current != null && (!_currentTag(current._tag))) {
      _removeCurrent();
    }
    _notify();
  }

  void _removeCurrent() {
    final old = _current;
    _current = null;
    if (old != null) {
      _retiring = old._requestRetire();
    }
  }

  Future<void> close() {
    if (_close != null) {
      return _close!;
    }
    // Reentrant listeners/phase observers join this same close, never recurse
    // through another close RHS or mistake cancellation for producer settlement.
    final completion = Completer<void>();
    final closing = completion.future;
    // Transfer custody while this owner and the new future are both live.
    // Attach first: neither an abandoned unclosed owner nor an escaped closed
    // future may lose its payment during the one synchronous handoff.
    _closeControl.retain(closing);
    _unclosedCloseFinalizer.detach(_closeControl);
    _close = closing;
    _closing = true;
    _token++;
    _desired = null;
    _stage?.cancel();
    _status = PreviewStatus.closing;
    _removeCurrent();
    _notify();
    unawaited(_drainClose().then(completion.complete,
        onError: completion.completeError));
    return closing;
  }

  Future<void> _drainClose() async {
    final idle = _idle, processing = _processing, retiring = _retiring;
    Object? failure;
    StackTrace? failureStack;
    // The constructor-prepaid close envelope owns this fixed three-entry
    // join list, the first-error state and the existing bounded frame snapshot.
    // A producer failure is not a certificate that other owners have drained.
    for (final future in [idle, processing, retiring]) {
      if (future == null) {
        continue;
      }
      try {
        await future;
      } catch (error, stack) {
        if (failure == null) {
          failure = error;
          failureStack = stack;
        }
      }
    }
    for (final frame in _frames.toList()) {
      try {
        await frame._requestRetire();
      } catch (error, stack) {
        if (failure == null) {
          failure = error;
          failureStack = stack;
        }
      }
    }
    if (failure != null) {
      Error.throwWithStackTrace(failure, failureStack!);
    }
  }

  @override
  void dispose() {
    unawaited(close());
    _notifierDisposed = true;
    super.dispose();
  }
}

/// One original UI handle and its exact keyed leaf. Accounting includes encoded
/// backing until clone-clear AND a subsequently requested scheduler frame.
final class PreviewFrame {
  PreviewFrame._(this._image, this._owner, this._tag, this._preview);
  ui.Image? _image;
  final WorkOperation _owner;
  final _Tag _tag;
  final PreviewOwner _preview;
  final _retired = Completer<void>();
  final _unmounted = Completer<void>();
  Future<void>? _retirement;
  bool _built = false, _mounted = false, _retiring = false;
  bool get isRetiring => _retiring;
  Future<void> get retired => _retired.future;
  String get projectId => _tag.projectId;
  int get revision => _tag.revision;
  int get sessionGeneration => _tag.generation;
  int get jobToken => _tag.token;
  AppLocale get locale => _tag.locale;
  ExportFormat get format => _tag.format;
  ui.Image get image {
    if (_retiring || _image == null) {
      throw StateError('Frame is no longer buildable');
    }
    return _image!;
  }

  void _mount() {
    if (_retiring || _built) {
      throw StateError('A frame has one leaf and cannot remount');
    }
    _built = true;
    _mounted = true;
  }

  void _assertLeafLive() {
    if (!_mounted || _retiring) {
      throw StateError('Frame leaf is not live');
    }
  }

  void _leafUnmounted() {
    if (!_mounted) {
      throw StateError('Foreign frame retirement acknowledgement');
    }
    _mounted = false;
    _preview._event(
      PreviewEvent.leafDetached,
      PreviewPhase.beforeRetire,
      jobToken,
    );
    _unmounted.complete();
    // A hidden slot also retires its exact frame; it is never remountable.
    unawaited(_requestRetire());
  }

  Future<void> _requestRetire() {
    if (_retirement != null) {
      return _retirement!;
    }
    _retiring = true;
    _retirement = _retire();
    _retirement!.then(_retired.complete, onError: _retired.completeError);
    return _retirement!;
  }

  Future<void> _retire() async {
    await _preview._phase(PreviewPhase.beforeRetire);
    if (_built) {
      await _unmounted.future;
      final postframe = Completer<void>();
      SchedulerBinding.instance.addPostFrameCallback(
        (_) => postframe.complete(),
      );
      // Registering a callback is not itself a request for a frame.
      final requestedFrame = SchedulerBinding.instance.endOfFrame;
      await postframe.future;
      await requestedFrame;
    }
    _image!.dispose();
    _image = null;
    await _owner.finish();
    _preview._frames.remove(this);
    _preview._event(
      PreviewEvent.frameRetired,
      PreviewPhase.beforeRetire,
      jobToken,
    );
  }
}

/// Uses only the production RawImage painter. Its superclass clears and disposes
/// the RenderImage clone before this particular frame receives its unmount ack.
final class PreviewImageLeaf extends RawImage {
  PreviewImageLeaf({required this.frame})
    : super(key: ObjectKey(frame), image: frame.image, fit: BoxFit.contain);
  final PreviewFrame frame;
  @override
  RenderImage createRenderObject(BuildContext context) {
    frame._mount();
    return super.createRenderObject(context);
  }

  @override
  void updateRenderObject(BuildContext context, RenderImage renderObject) {
    frame._assertLeafLive();
    super.updateRenderObject(context, renderObject);
  }

  @override
  void didUnmountRenderObject(RenderImage renderObject) {
    super.didUnmountRenderObject(renderObject);
    frame._leafUnmounted();
  }
}
