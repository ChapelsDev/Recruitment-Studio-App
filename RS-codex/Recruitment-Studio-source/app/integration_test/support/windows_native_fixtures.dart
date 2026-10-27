// Windows-only QA operands. No host fixture paths, assets, provider doubles,
// personal data, production-root redirects, limit changes or native PASS claims.
import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:isolate';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:crypto/crypto.dart' as crypto;
import 'package:image/image.dart' as img;
import 'package:recruitment_studio/features/composition/export_format.dart';
import 'package:recruitment_studio/features/composition/variant_renderer.dart';
import 'package:recruitment_studio/features/editor/editor_session.dart';
import 'package:recruitment_studio/features/projects/project.dart';
import 'package:recruitment_studio/features/storage/package_zip_io.dart';
import 'package:recruitment_studio/features/media/image_header_probe.dart';
import 'package:recruitment_studio/features/storage/private_effect_custody.dart';
import 'package:recruitment_studio/features/storage/private_file_io.dart';
import 'package:recruitment_studio/shared/admission_budget.dart';
import 'package:recruitment_studio/shared/operation.dart';
import 'package:recruitment_studio/shared/problem.dart';
import 'package:recruitment_studio/shared/work_budget.dart';
import 'package:recruitment_studio/shared/work_limits.dart';

const windowsFixtureId = 'windows-synthetic-v1';
const manualHeadlines = <AppLocale, String>{
  AppLocale.ptPT: 'Vaga de teste', AppLocale.en: 'Test vacancy',
  AppLocale.fr: 'Poste de test', AppLocale.it: 'Posizione di prova',
  AppLocale.deDE: 'Teststelle', AppLocale.deCH: 'Teststelle Schweiz',
  AppLocale.es: 'Vacante de prueba',
};

void requireWindowsDevice() {
  if (!Platform.isWindows) throw UnsupportedError('Actual Windows required');
}

Future<Directory> windowsSandbox() async {
  requireWindowsDevice();
  final root = await Directory.systemTemp.createTemp('recruitment-windows-qa-');
  try {
    requireRegularPath(File('${root.path}/probe'), absent: true);
    return root;
  } catch (_) {
    await root.delete(recursive: true);
    rethrow;
  }
}

/// Pure bounded worker operand: deterministic gradient or xorshift noise.
/// The 4000x3000 noise case meets the current pixel cap, but is NOT a measured
/// worst-case proof. An encoded-byte/capacity refusal is authoritative.
Uint8List _generatePhoto(int width, int height, bool noise) {
  final pixels = img.Image(width: width, height: height);
  var state = 0x189008;
  for (var y = 0; y < height; y++) {
    for (var x = 0; x < width; x++) {
      state ^= (state << 13) & 0xffffffff;
      state ^= state >> 17;
      state ^= (state << 5) & 0xffffffff;
      state &= 0xffffffff;
      pixels.setPixelRgba(x, y,
        noise ? state & 255 : 80 + x * 120 ~/ width,
        noise ? (state >> 8) & 255 : 80 + y * 120 ~/ height,
        noise ? (state >> 16) & 255 : 120, 255);
    }
  }
  return Uint8List.fromList(img.encodeJpg(pixels, quality: WorkLimits.jpgQuality));
}

/// Explicit EditorSession owns fixture bytes until dispose; no raw resource
/// aliases escape with an unpaid consumer lifetime.
final class WindowsFixture {
  WindowsFixture._(this.session, this.budget, this.id, this.photoHash);
  final EditorSession session;
  final WorkBudgetController budget;
  final String id, photoHash;
  void dispose() => session.dispose();

  static Future<WindowsFixture> generate({bool maximumNoise = false}) async {
    requireWindowsDevice();
    final budget = WorkBudgetController();
    final operation = WorkOperation.create();
    WorkLease? lease;
    WorkReservation? transferred;
    EditorSession? session;
    final width = maximumNoise ? 4000 : 640;
    final height = maximumNoise ? 3000 : 480;
    try {
      if (width * height > WorkLimits.photoPixels) throw const CapacityExceeded();
      // The existing single heavy interface protects worker/raster/copies.
      lease = await budget.acquire(operation,
        width * height * 12 + WorkLimits.photoBytes * 2);
      final bytes = await Isolate.run(() => _generatePhoto(width, height, maximumNoise));
      if (bytes.isEmpty || bytes.length > WorkLimits.photoBytes) throw const CapacityExceeded();
      final hash = crypto.sha256.convert(bytes).toString();
      // Hold the transported result independently before retiring worker lease.
      transferred = budget.reserve(operation, bytes.length);
      lease.release();
      lease = null;
      final ref = AssetRef(id: 'fixture-photo', kind: AssetKind.photo,
        mediaType: MediaType.jpeg, width: width, height: height, sha256: hash);
      var project = Project.blank(id: windowsFixtureId).withName('Synthetic QA');
      for (final locale in AppLocale.values) {
        project = project.withLocale(locale)
          .withHeadline(locale, manualHeadlines[locale]!)
          .withLocation(locale, 'Local ${locale.code}')
          .withContact(locale, 'contact-1', '${locale.code}@invalid.test');
      }
      project = project.withPhoto(ref).withSections([
        Section(id: 'visible', titleByLocale: {
          for (final locale in AppLocale.values) locale: 'Manual ${locale.code}',
        }, items: [SectionItem(id: 'item-1', textByLocale: {
          for (final locale in AppLocale.values) locale: 'Texto ${locale.code}',
        })]),
        Section(id: 'hidden', visible: false, titleByLocale: {
          for (final locale in AppLocale.values) locale: 'HIDDEN-${locale.code}',
        }, items: [SectionItem(id: 'secret-item', textByLocale: {
          for (final locale in AppLocale.values) locale: 'HIDDEN-ITEM-${locale.code}',
        })]),
      ]);
      for (final format in ExportFormat.values) {
        project = project.withCrop(format,
          NormalizedRect(left: 0.125, top: 0.125, width: 0.75, height: 0.75));
      }
      session = EditorSession(project, resources: {ref.id: bytes}, budget: budget);
      transferred.release(); transferred = null;
      await operation.finish(); // producer terminal BEFORE surrendering consumer
      final result = WindowsFixture._(session, budget,
        '$windowsFixtureId-${maximumNoise ? '12mp-noise' : '640-gradient'}', hash);
      session = null;
      return result;
    } finally {
      try { session?.dispose(); }
      finally {
        try { transferred?.release(); }
        finally { lease?.release(); await operation.finish(); }
      }
    }
  }
}

String manifestHash(EditorSession session) => crypto.sha256.convert(
  utf8.encode(session.project.toManifestJson())).toString();

/// Narrow owned-IO seam. Defaults perform real IO; fault doubles may only hold
/// or reject these effects, never replace a codec/backend or claim native PASS.
class WindowsQaFileIo extends PrivateFileIo {
  const WindowsQaFileIo();
  Future<void> create(File file) async { await file.create(exclusive: true); }
  Future<void> write(RandomAccessFile handle, Uint8List bytes) async { await handle.writeFrom(bytes); }
  Future<void> flush(RandomAccessFile handle) async { await handle.flush(); }
  Future<int> readInto(RandomAccessFile handle, Uint8List bytes, int start, int end) =>
    handle.readInto(bytes, start, end);
}

Object _qaCause(Object error) => error is OperationException || error is CapacityExceeded
  ? error : const OperationException(ProblemCode.ioFailure);

/// Inert lifecycle seam. A hook may enroll a genuine pending completion on
/// this invocation's actual operation; it cannot replace finish/close/readback.
final class WindowsQaWriterHooks {
  const WindowsQaWriterHooks({this.beforeFinalDrain});
  final void Function(WorkOperation owner)? beforeFinalDrain;
}

bool _qaSameFile(FileStat now, FileStat owned) => now.type == owned.type &&
  now.size == owned.size && now.modified == owned.modified &&
  now.changed == owned.changed && now.mode == owned.mode;

/// Separate custody for the created effect, not merely its handle. The existing
/// PrivateEffectCustody owns failed descriptors/payment; this finite supplement
/// keeps the file identity and root reachable even after an open/close fault.
final class WindowsQaFileCustody {
  WindowsQaFileCustody._(this.io, this.descriptor, this.credit);
  static final Set<WindowsQaFileCustody> _live = {};
  static int get retainedCount => _live.where((c) => c._residual).length;
  static Future<WindowsQaFileCustody> _admit(WindowsQaFileIo io) async {
    if (_live.length >= 32) throw const CapacityExceeded();
    final credit = AdmissionBudget.shared.reserve(64 * 1024);
    try {
      final record = WindowsQaFileCustody._(io, PrivateEffectCustody(io), credit);
      _live.add(record);
      return record;
    } catch (_) { credit.release(); rethrow; }
  }
  static Future<bool> reap() async {
    var all = true;
    // Explicit one-attempt recovery of transferred residuals, never a spin loop.
    for (final record in _live.where((c) => c._residual).toList()) {
      if (!await record.retire()) all = false;
    }
    return all;
  }
  final WindowsQaFileIo io;
  final PrivateEffectCustody descriptor;
  final AdmissionTicket credit;
  File? created;
  FileStat? identity;
  // Retain the strong byte root through final drain; the field is intentional custody.
  // ignore: unused_field
  Uint8List? _retainedBytes;
  // Descriptor retirement releases its own temporaryPayment at handle==null.
  // A writer's bytes outlive that frontier: only THIS custodian refunds them.
  WorkCopyReservation? _inputPayment;
  Object? _firstCause;
  WorkCopyReservation? _readbackPayment;
  Uint8List? _readbackBytes;
  bool _residual = false, _retired = false;
  bool _invocationDrained = true;
  Future<bool>? _retiring;

  void captureCreatedIdentity() {
    final file = created;
    if (file == null) return;
    requireRegularPath(file);
    identity = file.statSync();
  }
  void transferClosedOutput() {
    if (descriptor.handle != null || _residual || _retired || !_invocationDrained) {
      throw const OperationException(ProblemCode.ioFailure);
    }
    created = null; identity = null;
    _release();
  }
  void _release() {
    _retainedBytes = null; _readbackBytes = null;
    _inputPayment?.release(); _inputPayment = null;
    _readbackPayment?.release(); _readbackPayment = null;
    _retired = true;
    _live.remove(this);
    credit.release();
  }
  Future<bool> retire() {
    if (_retired) return Future.value(true);
    if (_retiring != null) return _retiring!;
    final done = Completer<bool>();
    _retiring = done.future;
    _retireOwned().then((value) {
      _residual = !value;
      if (!value) _firstCause ??= const OperationException(ProblemCode.ioFailure);
      _retiring = null; done.complete(value);
    }, onError: (Object _, StackTrace _) {
      _firstCause ??= const OperationException(ProblemCode.ioFailure);
      _residual = true; _retiring = null; done.complete(false);
    });
    return done.future;
  }
  Future<bool> _retireOwned() async {
    // No unlink/transfer/refund while the actual close is unresolved.
    if (!await descriptor.retire()) return false;
    final file = created;
    if (file != null) {
      final type = FileSystemEntity.typeSync(file.path, followLinks: false);
      if (type != FileSystemEntityType.notFound) {
        requireRegularPath(file);
        final owned = identity;
        if (owned == null || !_qaSameFile(file.statSync(), owned)) return false;
        await io.deleteFile(file);
        if (FileSystemEntity.typeSync(file.path, followLinks: false) != FileSystemEntityType.notFound) return false;
      }
      created = null; identity = null;
    }
    // A successful descriptor/effect retirement before the operation join is
    // not the writer's last buffer use. Even explicit reap cannot refund this
    // active invocation's retained fields before the real finish completes.
    if (_invocationDrained) _release();
    return true;
  }
}

Future<void> writeFreshBytes(File file, Uint8List bytes,
    {WorkBudgetController? budget, WindowsQaFileIo io = const WindowsQaFileIo(),
     WindowsQaWriterHooks? hooks}) =>
  _writeFreshBytes(file, bytes, budget: budget, io: io, hooks: hooks);

// Non-async public forwarding frame creates no awaited extra input alias.
// This nullable private input is explicitly cleared BEFORE the final join.
Future<void> _writeFreshBytes(File file, Uint8List? bytes,
    {WorkBudgetController? budget, required WindowsQaFileIo io,
     WindowsQaWriterHooks? hooks}) async {
  if (bytes == null) throw ArgumentError('Writer input required');
  if (bytes.length > WorkLimits.projectCompressedBytes ||
      file.absolute.path.length > WorkLimits.stagingPathUnits) {
    throw const CapacityExceeded();
  }
  final owner = WorkOperation.create();
  final drained = Completer<void>();
  WindowsQaFileCustody? custody;
  var enrolled = false;
  Object? first;
  try {
    custody = await WindowsQaFileCustody._admit(io);
    custody._invocationDrained = false;
    owner.registerPending(drained.future); enrolled = true;
    final domain = budget ?? WorkBudget.shared() as WorkBudgetController;
    custody._inputPayment = domain.reserveCopy(bytes.length);
    custody._retainedBytes = bytes;
    final expectedHash = crypto.sha256.convert(bytes).toString();
    requireRegularPath(file, absent: true);
    await io.create(file);
    custody.created = file; // nonfallible effect adoption before stat/open
    custody.captureCreatedIdentity();
    custody.descriptor.handle = await io.open(file, mode: FileMode.writeOnly);
    try {
      await io.write(custody.descriptor.handle!, bytes);
      await io.flush(custody.descriptor.handle!);
    } catch (error) { first = _qaCause(error); }
    // Capture our write-phase effect BEFORE awaiting close. Never adopt a
    // replacement after the close frontier or during explicit residual reap.
    try { custody.captureCreatedIdentity(); }
    catch (_) { first ??= const OperationException(ProblemCode.ioFailure); }
    try { await custody.descriptor.closeHandle(); }
    catch (error) { first ??= _qaCause(error); }
    if (first == null) {
      // Mandatory exact-byte readback stays inside the same created-effect
      // custody. A read/second-close failure cannot leave a published artifact.
      custody._readbackPayment = domain.reserveCopy(bytes.length + 1);
      requireRegularPath(file);
      if (!_qaSameFile(file.statSync(), custody.identity!)) {
        throw const OperationException(ProblemCode.ioFailure);
      }
      custody.descriptor.handle = await io.open(file);
      custody._readbackBytes = await _readWindowsQaHandle(custody.descriptor.handle!, io,
        bytes.length, allowEmpty: true);
      if (custody._readbackBytes!.length != bytes.length ||
          crypto.sha256.convert(custody._readbackBytes!).toString() != expectedHash) {
        throw const OperationException(ProblemCode.ioFailure);
      }
      await custody.descriptor.closeHandle();
    }
  } catch (error) { first ??= _qaCause(error); }
  if (custody != null) {
    custody._firstCause ??= first;
    if (first == null) {
      if (!await custody.descriptor.retire()) first = const OperationException(ProblemCode.ioFailure);
    }
    if (first != null) {
      // Actual residual has its own paid descriptor/effect owner. Finishing
      // this invocation below is a phase join, explicitly NOT a close/refund.
      await custody.retire();
    }
  }
  bytes = null; // custody retains the actual input and its independent charge
  try { hooks?.beforeFinalDrain?.call(owner); }
  catch (error) { first ??= _qaCause(error); }
  if (enrolled) drained.complete();
  try { await owner.finish(); }
  catch (error) { first ??= _qaCause(error); }
  if (custody != null) custody._invocationDrained = true;
  if (custody != null && first == null) {
    custody.transferClosedOutput();
  } else if (custody != null && !custody._residual && !custody._retired) {
    await custody.retire();
  }
  if (first != null) throw first;
}

/// One exact-size bounded body plus one EOF byte; never readAsBytes() after a
/// stat guard. The reservation/lease belongs to the caller before open/read.
Future<Uint8List> _readWindowsQaHandle(RandomAccessFile handle,
    WindowsQaFileIo io, int cap, {bool allowEmpty = false}) async {
  final length = await handle.length();
  if (length < 0 || (!allowEmpty && length == 0) || length > cap) throw const CapacityExceeded();
  final bytes = Uint8List(length);
  var offset = 0;
  while (offset < length) {
    final end = offset + 65536 < length ? offset + 65536 : length;
    final count = await io.readInto(handle, bytes, offset, end);
    if (count <= 0 || count > end - offset) throw const OperationException(ProblemCode.ioFailure);
    offset += count;
  }
  final end = Uint8List(1);
  if (await io.readInto(handle, end, 0, 1) != 0 || await handle.length() != length) {
    throw const OperationException(ProblemCode.ioFailure);
  }
  return bytes;
}

final class WindowsQaByteSnapshot {
  WindowsQaByteSnapshot._(this._bytes, this._payment);
  Uint8List? _bytes;
  WorkCopyReservation? _payment;
  Uint8List get bytes => _bytes ?? (throw StateError('Snapshot released'));
  void release() { _bytes = null; _payment?.release(); _payment = null; }
}

Future<WindowsQaByteSnapshot> readWindowsQaBytes(File file, {required int cap,
    WorkBudgetController? budget, WindowsQaFileIo io = const WindowsQaFileIo()}) async {
  if (cap <= 0 || cap > WorkLimits.exportImageBytes ||
      file.absolute.path.length > WorkLimits.stagingPathUnits) {
    throw const CapacityExceeded();
  }
  final owner = WorkOperation.create();
  final drained = Completer<void>();
  WindowsQaFileCustody? custody;
  WorkCopyReservation? payment;
  Uint8List? bytes;
  Object? first;
  var enrolled = false;
  try {
    custody = await WindowsQaFileCustody._admit(io);
    owner.registerPending(drained.future); enrolled = true;
    payment = (budget ?? WorkBudget.shared() as WorkBudgetController).reserveCopy(2 * cap + 1);
    requireRegularPath(file);
    custody.descriptor.handle = await io.open(file);
    bytes = await _readWindowsQaHandle(custody.descriptor.handle!, io, cap);
    await custody.descriptor.closeHandle();
  } catch (error) { first = _qaCause(error); }
  if (custody != null) {
    custody._firstCause ??= first;
    // A failed read close receives the independently paid captured bytes; the
    // reader cannot return them or refund while its actual descriptor survives.
    if (first != null) {
      custody.descriptor.temporaryPayment = payment; payment = null;
      custody._retainedBytes = bytes;
    }
    if (!await custody.retire()) first ??= const OperationException(ProblemCode.ioFailure);
  }
  if (enrolled) drained.complete();
  try { await owner.finish(); }
  catch (error) { first ??= _qaCause(error); }
  if (first != null) { payment?.release(); throw first; }
  return WindowsQaByteSnapshot._(bytes!, payment!);
}

final class WindowsQaImageHooks {
  const WindowsQaImageHooks({this.beforeEngine, this.beforeFrameDispose, this.beforeCodecDispose});
  final Future<void> Function()? beforeEngine;
  final void Function()? beforeFrameDispose, beforeCodecDispose;
}

/// Failed UI disposal keeps the genuine operation/pending/lease and concrete
/// native object reachable. Explicit reap attempts only residuals, once each.
/// The price is the accepted renderer's conservative E*2/S*8/8MiB envelope,
/// NOT sizeof(ui.Codec), RSS, opaque callback-body or allocator certification.
final class WindowsQaImageCustody {
  WindowsQaImageCustody._(this.owner, this.budget, this.io, this.hooks, this.credit, this.descriptorCustody);
  static final Set<WindowsQaImageCustody> _live = {};
  static int get retainedCount => _live.where((c) => c._residual).length;
  static Future<bool> reap() async {
    var all = true;
    for (final record in _live.where((c) => c._residual).toList()) {
      if (!await record.retire()) all = false;
    }
    return all;
  }
  final WorkOperation owner;
  final WorkBudgetController budget;
  final WindowsQaFileIo io;
  final WindowsQaImageHooks? hooks;
  final AdmissionTicket credit;
  final PrivateEffectCustody descriptorCustody;
  final drained = Completer<void>();
  WorkLease? lease;
  Uint8List? bytes;
  ui.ImmutableBuffer? buffer;
  ui.ImageDescriptor? descriptor;
  ui.Codec? codec;
  ui.Image? frame;
  Object? _firstCause;
  bool _residual = false;
  Future<bool>? _retiring;
  Future<bool> retire() {
    if (_retiring != null) return _retiring!;
    final done = Completer<bool>();
    _retiring = done.future;
    _disposeOwned().then((value) {
      _residual = !value;
      if (!value) _firstCause ??= const OperationException(ProblemCode.ioFailure);
      _retiring = null; done.complete(value);
    }, onError: (Object _, StackTrace _) {
      _firstCause ??= const OperationException(ProblemCode.ioFailure);
      _residual = true; _retiring = null; done.complete(false);
    });
    return done.future;
  }
  Future<bool> _disposeOwned() async {
    void attempt(void Function() dispose) { try { dispose(); } catch (_) { /* keep actual owner */ } }
    if (frame != null) attempt(() { hooks?.beforeFrameDispose?.call(); frame!.dispose(); frame = null; });
    if (codec != null) attempt(() { hooks?.beforeCodecDispose?.call(); codec!.dispose(); codec = null; });
    if (descriptor != null) attempt(() { descriptor!.dispose(); descriptor = null; });
    if (buffer != null) attempt(() { buffer!.dispose(); buffer = null; });
    final fileRetired = await descriptorCustody.retire();
    if (!fileRetired || frame != null || codec != null || descriptor != null || buffer != null) return false;
    bytes = null;
    lease?.release(); // deferred until pending completes; no premature refund
    if (!drained.isCompleted) drained.complete();
    await owner.finish();
    lease = null;
    _live.remove(this); credit.release();
    return true;
  }
}

/// Decode real output under the SAME heavy domain as the actual consumer.
Future<({int width, int height, String hash})> inspectImage(File file,
    {required WorkBudgetController budget, required ExportFormat format,
     WindowsQaFileIo io = const WindowsQaFileIo(), WindowsQaImageHooks? hooks}) async {
  if (file.absolute.path.length > WorkLimits.stagingPathUnits ||
      format.width <= 0 || format.height <= 0 ||
      format.width > WorkLimits.photoPixels ~/ format.height) {
    throw const CapacityExceeded();
  }
  final owner = WorkOperation.create();
  WindowsQaImageCustody? custody;
  AdmissionTicket? credit;
  PrivateEffectCustody? fileCustody;
  Object? first;
  ({int width, int height, String hash})? result;
  try {
    if (WindowsQaImageCustody._live.length >= 32) throw const CapacityExceeded();
    credit = AdmissionBudget.shared.reserve(64 * 1024);
    fileCustody = PrivateEffectCustody(io);
    final record = WindowsQaImageCustody._(owner, budget, io, hooks, credit, fileCustody);
    owner.registerPending(record.drained.future);
    custody = record;
    WindowsQaImageCustody._live.add(record);
    record.lease = await budget.acquire(owner, WorkLimits.exportImageBytes * 2 +
      format.width * format.height * 8 + 8 * 1024 * 1024);
    packageCheckOperation(owner);
    requireRegularPath(file);
    record.descriptorCustody.handle = await io.open(file);
    record.bytes = await _readWindowsQaHandle(record.descriptorCustody.handle!, io, WorkLimits.exportImageBytes);
    await record.descriptorCustody.closeHandle();
    final header = ImageHeaderProbe().inspect(record.bytes!);
    if (header.width != format.width || header.height != format.height ||
        header.orientation != 1 || header.hasPrivateMetadata) {
      throw const OperationException(ProblemCode.invalidResource);
    }
    await hooks?.beforeEngine?.call();
    packageCheckOperation(owner);
    record.buffer = await ui.ImmutableBuffer.fromUint8List(record.bytes!);
    record.descriptor = await ui.ImageDescriptor.encoded(record.buffer!);
    if (record.descriptor!.width != format.width || record.descriptor!.height != format.height) {
      throw const OperationException(ProblemCode.invalidResource);
    }
    record.codec = await record.descriptor!.instantiateCodec();
    if (record.codec!.frameCount != 1) throw const OperationException(ProblemCode.invalidResource);
    record.frame = (await record.codec!.getNextFrame()).image;
    if (record.frame!.width != format.width || record.frame!.height != format.height) {
      throw const OperationException(ProblemCode.invalidResource);
    }
    result = (width: record.frame!.width, height: record.frame!.height,
      hash: crypto.sha256.convert(record.bytes!).toString());
  } catch (error) { first = _qaCause(error); }
  if (custody != null) {
    custody._firstCause ??= first;
    if (!await custody.retire()) first ??= const OperationException(ProblemCode.ioFailure);
  } else {
    try { if (fileCustody != null && !await fileCustody.retire()) first ??= const OperationException(ProblemCode.ioFailure); }
    finally { try { await owner.finish(); } catch (error) { first ??= _qaCause(error); } credit?.release(); }
  }
  if (first != null) throw first;
  return result!;
}

/// Real renderer, engine, JPEG worker and private Windows filesystem outputs.
/// This is NOT native picker/gateway destination confirmation.
Future<File> renderPrivateImage(WindowsFixture fixture, Directory root,
    AppLocale locale, ExportFormat format, ImageEncoding encoding, String suffix) async {
  if (!RegExp(r'^[A-Za-z0-9_-]{1,64}$').hasMatch(suffix)) {
    throw ArgumentError('Private output suffix must be a finite path-free ID');
  }
  final operation = WorkOperation.create();
  CapturedSnapshot? snapshot;
  RenderedVariant? rendered;
  try {
    snapshot = fixture.session.captureSnapshot();
    rendered = await CanvasVariantRenderer(budget: fixture.budget).render(
      snapshot.bundle, locale, format, encoding, operation: operation);
    final file = File('${root.path}/${locale.code}-${format.name}-$suffix.${encoding.name}');
    await writeFreshBytes(file, rendered.bytes);
    return file;
  } finally {
    try { await rendered?.dispose(); }
    finally { try { snapshot?.release(); } finally { await operation.finish(); } }
  }
}

/// Stop an actual running JPEG worker at its existing ready handshake. No
/// injected pixels/renderer/provider; cancellation is not a native dialog case.
Future<void> cancelAndRecoverRenderer(WindowsFixture fixture, Directory root) async {
  final ready = Completer<void>(), resume = Completer<void>();
  final operation = WorkOperation.create();
  CapturedSnapshot? snapshot;
  RenderedVariant? unexpected;
  Future<void>? running;
  Object? failure;
  try {
    snapshot = fixture.session.captureSnapshot();
    final renderer = CanvasVariantRenderer(budget: fixture.budget,
      testHooks: RendererTestHooks(beforeJpgEncode: () async {
        ready.complete();
        await resume.future;
      }));
    running = renderer.render(snapshot.bundle, AppLocale.ptPT,
      ExportFormat.square, ImageEncoding.jpg, operation: operation).then<void>(
        (value) { unexpected = value; }, onError: (Object error) { failure = error; });
    // A capacity/refusal before the worker must not deadlock or fake cancel.
    await Future.any([ready.future, running]);
    if (!ready.isCompleted) throw StateError('JPEG worker not reached');
    operation.cancel();
    resume.complete();
    await running;
    if (failure is! OperationException ||
        (failure as OperationException).problem.code != ProblemCode.operationCancelled ||
        unexpected != null) {
      throw StateError('Actual renderer cancellation not observed');
    }
  } finally {
    if (!resume.isCompleted) resume.complete();
    try { await running; await unexpected?.dispose(); }
    finally { try { snapshot?.release(); } finally { await operation.finish(); } }
  }
  await renderPrivateImage(fixture, root, AppLocale.ptPT,
    ExportFormat.square, ImageEncoding.png, 'after-cancel');
}
