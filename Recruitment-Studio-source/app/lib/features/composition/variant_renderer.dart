import 'dart:async';
import 'dart:isolate';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:crypto/crypto.dart';
import 'package:image/image.dart' as img;

import '../../shared/operation.dart';
import '../../shared/admission_budget.dart';
import '../../shared/problem.dart';
import '../../shared/work_budget.dart';
import '../../shared/work_limits.dart';
import '../media/image_header_probe.dart';
import '../projects/project.dart';
import '../projects/project_bundle.dart';
import 'editorial_layout.dart';
import 'export_format.dart';
import 'layout_scene.dart';
import 'scene_painter.dart';

abstract interface class VariantRenderer {
  Future<RenderedVariant> render(
    ProjectBundle bundle,
    AppLocale locale,
    ExportFormat format,
    ImageEncoding encoding, {
    Operation? operation,
  });
}

/// Only encoded bytes cross the public boundary. The renderer keeps no raster
/// or result cache. The receiver must dispose after all consumers drop the
/// bytes (or establish its own equal accounting before doing so). Readonly
/// storage is a view over an exact-size owned buffer, not a spare-capacity view.
/// A separate retained owner keeps these bytes paid beyond render/private finish;
/// dispose never finishes the caller's operation or releases its workspace.
final class RenderedVariant {
  RenderedVariant._(
    Uint8List bytes,
    this.width,
    this.height,
    this.locale,
    this.format,
    this.encoding,
    this._owner,
  ) : bytes = bytes.asUnmodifiableView();
  final Uint8List bytes;
  final int width, height;
  final AppLocale locale;
  final ExportFormat format;
  final ImageEncoding encoding;
  final WorkOperation _owner;
  Future<void> dispose() => _owner.finish();
}

/// Test-only deterministic barrier/fault at the byte worker's ready handshake.
/// A worker exists and waits on a port while this main-isolate callback is held.
/// No callback supplies pixels, resources, layouts or encoder implementations.
/// onEvent observes ownership transitions passively; its exceptions are ignored.
final class RendererTestHooks {
  const RendererTestHooks({this.beforeJpgEncode, this.onEvent});
  final Future<void> Function()? beforeJpgEncode;
  final void Function(String)? onEvent;
}

/// Conservative accounting envelope, not an RSS/native engine measurement.
/// Source E*2: borrowed encoded bytes + UI ImmutableBuffer. Source S*8: decoded
/// RGBA texture plus decoder workspace/padding. Output P*8: picture/raster and
/// raster encoder pixels; R*4: PNG rows/filter/inflate/worker decoded RGBA.
/// B*5: PNG storage/copy/transport/growth/encoded handoff. JPG adds B*2 for the
/// main->worker PNG transport plus jpegWorkspaceBound: entropy-bounded output
/// capacity/growth and two 16MiB slots for accepted exact copy and handoff. 8MiB covers bounded
/// row/descriptor/port/text recording and codec table workspace. Checked image
/// headers must match the paid, domain-bounded metadata before UI decode.
/// Inputs near the cap may be refused: there is no cap relaxation to fit them.
int rendererAllocationEstimate(
  ProjectBundle bundle,
  ExportFormat format,
  ImageEncoding encoding,
) {
  final refs = [
    bundle.project.photo,
    bundle.project.logo,
  ].whereType<AssetRef>();
  var sourcePixels = 0, encoded = 0;
  for (final ref in refs) {
    sourcePixels += ref.width * ref.height;
    encoded += bundle.resources[ref.id]?.length ?? 0;
  }
  final pixels = format.width * format.height;
  final raw = pixels * 4 + format.height;
  final pngBound = raw + (raw >> 12) + (raw >> 14) + (raw >> 25) + 65536 + 57;
  return encoded * 2 +
      sourcePixels * 8 +
      pixels * 8 +
      raw * 4 +
      pngBound * (encoding == ImageEncoding.jpg ? 7 : 5) +
      (encoding == ImageEncoding.jpg ? _jpegWorkspaceBound(format) : 0) +
      8 * 1024 * 1024;
}

// image 4.10.1 baseline 4:4:4: three 8x8 blocks per padded MCU. Bound
// 64 coefficients by 16 Huffman + 16 magnitude bits each, then 32 bits
// for block/end/flush overhead: 260 bytes, doubled for FF stuffing. Zero
// runs consume fewer than their charged coefficient slots. No source metadata
// enters the decoded engine PNG. The fixed JPEG tables/headers fit 64KiB.
// OutputBuffer grows 8192 -> 3*8192 -> ...; account the simultaneous old and
// new capacities, not 16MiB or the eventual successful encoded length. An
// oversized encoded result is refused before allocating the exact-size copy.
int _jpegWorkspaceBound(ExportFormat format) {
  final bound =
      ((format.width + 7) ~/ 8) * ((format.height + 7) ~/ 8) * 3 * 520 + 65536;
  var capacity = 8192;
  while (capacity < bound) {
    capacity *= 3;
  }
  return capacity + capacity ~/ 3 + WorkLimits.exportImageBytes * 2;
}

abstract interface class BorrowedLeaseVariantRenderer
    implements VariantRenderer {
  Future<RenderedVariant> renderWithLease(
    ProjectBundle bundle,
    AppLocale locale,
    ExportFormat format,
    ImageEncoding encoding, {
    required WorkOperation operation,
    required WorkLease lease,
  });
}

final class CanvasVariantRenderer implements BorrowedLeaseVariantRenderer {
  CanvasVariantRenderer({
    WorkBudgetController? budget,
    RendererTestHooks? testHooks,
  }) : _budget = budget ?? WorkBudget.shared() as WorkBudgetController,
       _hooks = testHooks;
  final WorkBudgetController _budget;
  final RendererTestHooks? _hooks;

  void _event(String name) {
    try {
      _hooks?.onEvent?.call(name);
    } catch (_) {
      /* Passive observation. */
    }
  }

  void _open(WorkOperation op) {
    op.throwIfCancelled();
    if (op.isFinishing) {
      throw const OperationException(ProblemCode.operationCancelled);
    }
  }

  @override
  Future<RenderedVariant> renderWithLease(
    ProjectBundle bundle,
    AppLocale locale,
    ExportFormat format,
    ImageEncoding encoding, {
    required WorkOperation operation,
    required WorkLease lease,
  }) => _render(
    bundle,
    locale,
    format,
    encoding,
    operation: operation,
    parentLease: lease,
  );

  @override
  Future<RenderedVariant> render(
    ProjectBundle bundle,
    AppLocale locale,
    ExportFormat format,
    ImageEncoding encoding, {
    Operation? operation,
  }) => _render(bundle, locale, format, encoding, operation: operation);

  Future<RenderedVariant> _render(
    ProjectBundle bundle,
    AppLocale locale,
    ExportFormat format,
    ImageEncoding encoding, {
    Operation? operation,
    WorkLease? parentLease,
  }) async {
    final owner = operation ?? WorkOperation.create();
    if (owner is! WorkOperation) {
      throw const OperationException(ProblemCode.invalidSelection);
    }
    WorkLease? lease;
    AdmissionTicket? ordinary;
    LayoutScene? scene;
    ui.Picture? picture;
    ui.Image? raster;
    WorkOperation? outputOwner;
    RenderedVariant? produced;
    final images = <String, ui.Image>{};
    final completion = Completer<void>();
    var enrolled = false;
    try {
      _open(owner);
      ordinary = AdmissionBudget.shared.reserve(2 * 1024 * 1024);
      if (!bundle.project.localeOrder.contains(locale)) {
        throw const OperationException(ProblemCode.invalidSelection);
      }
      // One lifetime pending covers queue admission, UI buffers/codec/frame,
      // toImage/toByteData, actual byte-worker exit, handoff and final disposal.
      // Enrollment precedes the first await; finish cannot snapshot an empty set.
      owner.registerPending(completion.future);
      enrolled = true;
      try {
        final estimate = rendererAllocationEstimate(bundle, format, encoding);
        if (parentLease != null) {
          parentLease.forChild(owner);
          if (!parentLease.belongsTo(_budget) || parentLease.bytes < estimate) {
            throw const OperationException(ProblemCode.invalidSelection);
          }
          lease = parentLease;
        } else {
          lease = await _budget.acquire(owner, estimate);
        }
      } on StateError {
        // Admission can fail when the queued caller finishes without cancel.
        // Normalize that stop here, not later unrelated rendering/IO faults.
        _open(owner);
        rethrow;
      }
      _open(owner);
      scene = EditorialLayout().compose(bundle.project, locale, format);
      for (final problem in scene.problems) {
        if (problem.severity == ProblemSeverity.error) {
          throw OperationException(problem.code);
        }
      }
      for (final ref in [
        bundle.project.photo,
        bundle.project.logo,
      ].whereType<AssetRef>()) {
        _open(owner);
        final bytes = bundle.resources[ref.id];
        if (bytes == null) {
          throw const OperationException(ProblemCode.invalidResource);
        }
        final cap = ref.kind == AssetKind.photo
            ? WorkLimits.photoBytes
            : WorkLimits.logoBytes;
        if (bytes.length > cap) {
          throw const CapacityExceeded();
        }
        final header = ImageHeaderProbe().inspect(bytes);
        if (header.width != ref.width ||
            header.height != ref.height ||
            header.mediaType != ref.mediaType ||
            header.orientation != 1 ||
            header.hasPrivateMetadata ||
            sha256.convert(bytes).toString() != ref.sha256) {
          throw const OperationException(ProblemCode.invalidResource);
        }
        images[ref.id] = await _decode(bytes, ref, owner);
        _event('sourceImageDecoded');
        _open(owner);
      }
      final recorder = ui.PictureRecorder();
      late final ui.Picture recorded;
      try {
        ScenePainter(scene: scene, images: images).paint(
          ui.Canvas(recorder),
          ui.Size(format.width.toDouble(), format.height.toDouble()),
        );
      } finally {
        recorded = recorder.endRecording();
        picture = recorded;
      }
      raster = await recorded.toImage(format.width, format.height);
      _event('rasterCreated');
      _open(owner);
      final data = await raster.toByteData(format: ui.ImageByteFormat.png);
      _open(owner);
      if (data == null) {
        throw const OperationException(ProblemCode.ioFailure);
      }
      final png = data.buffer.asUint8List(
        data.offsetInBytes,
        data.lengthInBytes,
      );
      if (png.length > WorkLimits.exportImageBytes) {
        throw const CapacityExceeded();
      }
      // Worker receives only PNG bytes and ports. Nothing closes over this
      // renderer, the scene, images, fonts, Canvas or caller's operation.
      final encoded = encoding == ImageEncoding.png
          ? Uint8List.fromList(png)
          : await _jpg(png);
      _open(owner);
      if (encoded.length > WorkLimits.exportImageBytes) {
        throw const CapacityExceeded();
      }
      outputOwner = WorkOperation.create();
      _budget.reserve(outputOwner, encoded.length);
      final result = RenderedVariant._(
        encoded,
        format.width,
        format.height,
        locale,
        format,
        encoding,
        outputOwner,
      );
      outputOwner = null;
      produced = result;
    } on OperationException {
      rethrow;
    } on CapacityExceeded {
      rethrow;
    } catch (_) {
      // No resource text/private paths are placed in exception diagnostics.
      throw const OperationException(ProblemCode.ioFailure);
    } finally {
      var cleanupFailed = false;
      void clean(void Function() action) {
        try { action(); } catch (_) { cleanupFailed = true; }
      }
      clean(() => raster?.dispose());
      if (raster != null) { _event('rasterDisposed'); }
      clean(() => picture?.dispose());
      if (picture != null) { _event('pictureDisposed'); }
      for (final image in images.values) {
        clean(image.dispose); _event('sourceImageDisposed');
      }
      images.clear();
      if (scene != null) {
        clean(() => scene?.dispose());
        _event('sceneDisposed');
      }
      scene = null;
      try {
        if (outputOwner != null) { await outputOwner.finish(); }
      } catch (_) { cleanupFailed = true; }
      finally {
        if (parentLease == null) clean(() => lease?.release());
        if (enrolled) {
          completion.complete();
          await Future<void>.delayed(Duration.zero);
        }
        try {
          if (operation == null) { await owner.finish(); }
        } catch (_) { cleanupFailed = true; }
        finally { ordinary?.release(); }
      }
      if (cleanupFailed) {
        await produced?.dispose();
        throw const OperationException(ProblemCode.ioFailure);
      }
    }
    // Final asynchronous releases are also cancellation boundaries. Do not
    // hand out a stale success when the caller stopped during disposal/drain.
    if (owner.isCancelled || (operation != null && owner.isFinishing)) {
      await produced.dispose();
      throw const OperationException(ProblemCode.operationCancelled);
    }
    _event('resultTransferred');
    return produced;
  }

  Future<ui.Image> _decode(
    Uint8List bytes,
    AssetRef expected,
    WorkOperation owner,
  ) async {
    ui.ImmutableBuffer? buffer;
    ui.ImageDescriptor? descriptor;
    ui.Codec? codec;
    ui.Image? image;
    try {
      buffer = await ui.ImmutableBuffer.fromUint8List(bytes);
      _open(owner);
      descriptor = await ui.ImageDescriptor.encoded(buffer);
      _open(owner);
      if (descriptor.width != expected.width ||
          descriptor.height != expected.height) {
        throw const OperationException(ProblemCode.invalidResource);
      }
      codec = await descriptor.instantiateCodec();
      _open(owner);
      if (codec.frameCount != 1) {
        throw const OperationException(ProblemCode.invalidResource);
      }
      image = (await codec.getNextFrame()).image;
      _open(owner);
      if (image.width != expected.width || image.height != expected.height) {
        throw const OperationException(ProblemCode.invalidResource);
      }
      final result = image;
      image = null;
      return result;
    } on OperationException {
      rethrow;
    } catch (_) {
      throw const OperationException(ProblemCode.invalidResource);
    } finally {
      image?.dispose();
      codec?.dispose();
      descriptor?.dispose();
      buffer?.dispose();
    }
  }

  Future<Uint8List> _jpg(Uint8List png) async {
    final control = WorkerAdmission.acquire();
    try { return await _jpgOwned(png); }
    finally { control.release(); }
  }
  Future<Uint8List> _jpgOwned(Uint8List png) async {
    final messages = ReceivePort();
    final exited = Completer<void>();
    Uint8List? result;
    ProblemCode? failure;
    Isolate? isolate;
    final subscription = messages.listen((dynamic message) {
      if (message == null) {
        _event('workerExited');
        exited.complete();
        return;
      }
      final m = message as List<Object?>;
      if (m[0] == 'ready') {
        _event('workerStarted');
        final port = m[1] as SendPort;
        Future<void>.sync(() async {
          await _hooks?.beforeJpgEncode?.call();
        }).then(
          (_) => port.send(true),
          onError: (Object _, StackTrace _) => port.send(false),
        );
      } else if (m[0] == 'result') {
        result = m[1] as Uint8List;
      } else {
        failure = m[0] == 'capacity'
            ? ProblemCode.capacityExceeded
            : ProblemCode.ioFailure;
      }
    });
    final timer = Timer(WorkLimits.decodeTimeout, () {
      failure = ProblemCode.ioFailure;
      isolate?.kill(priority: Isolate.immediate);
    });
    try {
      isolate = await Isolate.spawn(
        _jpgEntry,
        <Object?>[png, messages.sendPort],
        onExit: messages.sendPort,
        onError: messages.sendPort,
        errorsAreFatal: true,
      );
      if (failure != null) {
        isolate.kill(priority: Isolate.immediate);
      }
      await exited.future;
      if (failure == ProblemCode.capacityExceeded) {
        throw const CapacityExceeded();
      }
      if (failure != null || result == null) {
        throw const OperationException(ProblemCode.ioFailure);
      }
      return result!;
    } finally {
      try {
        if (isolate != null && !exited.isCompleted) {
          isolate.kill(priority: Isolate.immediate); await exited.future;
        }
      } finally {
        timer.cancel();
        try { await subscription.cancel(); }
        finally { messages.close(); }
      }
    }
  }
}

/// Byte-only isolate entrypoint. Isolate.exit transfers the exact-size encoded
/// result; onExit is separately observed before active accounting is released.
void _jpgEntry(List<Object?> args) async {
  final png = args[0] as Uint8List;
  final reply = args[1] as SendPort;
  final gate = ReceivePort();
  reply.send(<Object?>['ready', gate.sendPort]);
  final proceed = await gate.first;
  gate.close();
  if (proceed != true) {
    Isolate.exit(reply, <Object?>['error']);
  }
  try {
    final decoded = img.decodePng(png);
    if (decoded == null) {
      Isolate.exit(reply, <Object?>['error']);
    }
    final encoded = img.encodeJpg(decoded, quality: WorkLimits.jpgQuality);
    if (encoded.length > WorkLimits.exportImageBytes) {
      Isolate.exit(reply, <Object?>['capacity']);
    }
    Isolate.exit(reply, <Object?>['result', Uint8List.fromList(encoded)]);
  } catch (_) {
    Isolate.exit(reply, <Object?>['error']);
  }
}
