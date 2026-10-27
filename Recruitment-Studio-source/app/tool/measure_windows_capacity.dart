// Flutter Windows entrypoint, NOT `dart run` (uses dart:ui and bundled fonts).
// Build after source reviews/SDK-slot admission:
//   flutter build windows --release --target tool/measure_windows_capacity.dart
// The unchanged windows/runner/main.cpp:22-25 forwards native argv to main.
// Run built EXE: --output-directory <existing owned dir> --run-id <id>
//   --samples 3 --build-receipt <real receipt> --build-receipt-sha256 <trusted SHA>
// This writes ONLY new <id>-timings.json and start/end markers. Exit 2 means
// timings recorded but native RSS/CPU gate PENDING; never a threshold PASS.
// A separate authorized Windows producer must sample THIS pid/run interval via
// GetProcessMemoryInfo.WorkingSetSize and GetProcessTimes. It is not implemented
// here. Then invoke SAME binary with --finalize <timings.json> --rss-record <json>
//   --rss-sha256 <trusted SHA> --producer-sha256 <trusted producer SHA>
//   --timings-sha256 <trusted timing SHA> --output-directory <owned dir>. Exit 0 validates/records operands ONLY,
// never T13 capacity thresholds or app readiness. Exit 1 = finite input/run error.
// Debug/profile require explicit --allow-diagnostic and cannot finalize release.
// External schema: windows-external-process-v1, pid:int, run_id:String,
// producer_sha256/executable_sha256, rss_method/cpu_method exact strings above,
// samples:[{utc:UTC ISO8601,working_set_bytes:positive int,user_cpu_us:int>=0,
// kernel_cpu_us:int>=0}]. Samples must cover the run inside its UTC interval,
// with ordered <=250ms gaps/end margins and positive aggregate CPU delta.
// Pinned bytes alone do NOT authenticate an operating producer: parent approval
// of the external producer, run identity and release receipt is still required.
import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart' as crypto;
import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:recruitment_studio/features/composition/export_format.dart';
import 'package:recruitment_studio/features/composition/font_catalog.dart';
import 'package:recruitment_studio/features/projects/project.dart';
import 'package:recruitment_studio/features/storage/package_zip_io.dart';
import 'package:recruitment_studio/features/storage/project_codec.dart';
import 'package:recruitment_studio/shared/admission_budget.dart';
import 'package:recruitment_studio/shared/problem.dart';
import 'package:recruitment_studio/shared/work_budget.dart';
import 'package:recruitment_studio/shared/work_limits.dart';

import '../integration_test/support/windows_native_fixtures.dart';

String get windowsMeasurementMode => kReleaseMode ? 'release' : kProfileMode ? 'profile' : 'debug';

Map<String, String> _arguments(List<String> args) {
  const values = {'--output-directory', '--run-id', '--samples', '--build-receipt',
    '--build-receipt-sha256', '--finalize', '--rss-record', '--rss-sha256', '--producer-sha256', '--timings-sha256'};
  final result = <String, String>{};
  for (var i = 0; i < args.length; i++) {
    final key = args[i];
    if (result.containsKey(key)) throw ArgumentError('Duplicate argument');
    if (key == '--allow-diagnostic') { result[key] = 'true'; continue; }
    if (!values.contains(key) || ++i >= args.length || args[i].startsWith('--')) {
      throw ArgumentError('Unknown argument or missing value');
    }
    result[key] = args[i];
  }
  return result;
}

void _checkHash(String hash) {
  if (!RegExp(r'^[0-9a-f]{64}$').hasMatch(hash)) throw ArgumentError('Expected exact lowercase SHA256');
}

Future<String> _fileHash(File file) async {
  requireRegularPath(file);
  return (await crypto.sha256.bind(file.openRead()).first).toString();
}

/// Inert hold/fault seams, not a serializer/backend substitution. The callbacks
/// never receive the private captured graph and cannot certify its admission.
final class WindowsMeasurementWriterHooks {
  const WindowsMeasurementWriterHooks({this.beforeCapture, this.beforeEncode,
    this.beforeUtf8, this.writer});
  final void Function()? beforeCapture, beforeEncode, beforeUtf8;
  final WindowsQaWriterHooks? writer;
}

// Own-data plan, NOT heap/RSS/ABI or arbitrary foreign callback accounting.
// C bounds compact JSON UTF8 including newline; N bounds visited keys/values.
// 16*C covers retained string parts/growth, joined UTF16 JSON + newline copy,
// UTF8 worst-case scratch (<=3*C), fresh UTF8 sublist and final Uint8List.
// 512*N covers captured Map/List slot growth and encoder key/value carriers;
// 2 MiB covers bounded scalar/recursion scratch. No caller producer credit is
// substituted for these newly created outputs. File input/readback pay again
// independently in the same domain, including residuals after this call ends.
const _measurementWriterWorkspaceBytes = 16 * windowsMeasurementRecordByteCap +
  512 * WorkLimits.parserNodes + 2 * 1024 * 1024;

Future<void> writeWindowsMeasurement(File file, Map<String, Object?> value,
    {WorkBudgetController? budget, WindowsQaFileIo io = const WindowsQaFileIo(),
     WindowsMeasurementWriterHooks? hooks}) async {
  final domain = budget ?? WorkBudget.shared() as WorkBudgetController;
  // Before even a foreign getter or owned capture/encoder allocation. A fixed
  // prepayment alone is insufficient: the capture below bounds actual values
  // and growth BEFORE permitting whole serialization of its closed graph.
  final workspace = domain.reserveCopy(_measurementWriterWorkspaceBytes);
  AdmissionTicket? control;
  Uint8List? bytes;
  try {
    control = AdmissionBudget.shared.reserve(256 * 1024);
    bytes = _measurementWriterBytes(value, hooks);
    await writeFreshBytes(file, bytes, budget: domain, io: io, hooks: hooks?.writer);
  } finally {
    bytes = null; // surrender this invocation's last alias before any refund
    control?.release(); workspace.release();
  }
}

Uint8List _measurementWriterBytes(Map<String, Object?> value,
    WindowsMeasurementWriterHooks? hooks) {
  hooks?.beforeCapture?.call();
  final plan = _MeasurementWriterCapture();
  final captured = plan.capture(value, 1);
  // No foreign Map/List/toJson getter is reachable from this point onward.
  hooks?.beforeEncode?.call();
  final text = '${jsonEncode(captured)}\n';
  if (text.length > plan.outputBytes) throw const CapacityExceeded();
  hooks?.beforeUtf8?.call();
  final bytes = Uint8List.fromList(utf8.encode(text));
  // Defensive invariant checks, not the preallocation frontier.
  if (bytes.length > plan.outputBytes || bytes.length > windowsMeasurementRecordByteCap) {
    throw const CapacityExceeded();
  }
  return bytes;
}

/// Each owned insertion is preceded by counters. Strings are immutable borrowed
/// values, never copied before their finite encoded growth has been checked.
/// Foreign iterators/getters can do arbitrary work: this is not their sandbox.
/// Their returned values cannot authorize an unbounded later owned serializer.
final class _MeasurementWriterCapture {
  final List<Object> _active = [];
  int _nodes = 0;
  int outputBytes = 1; // actual final LF, not the two characters backslash+n
  void _charge(int amount) {
    if (amount < 0 || amount > windowsMeasurementRecordByteCap - outputBytes) {
      throw const CapacityExceeded();
    }
    outputBytes += amount;
  }
  void _node(int depth) {
    if (depth > WorkLimits.manifestDepth || ++_nodes > WorkLimits.parserNodes) {
      throw const CapacityExceeded();
    }
  }
  void _string(String value) {
    // Each UTF16 unit consumes at least one output byte, including pairs.
    if (value.length > windowsMeasurementRecordByteCap - outputBytes) {
      throw const CapacityExceeded();
    }
    _charge(2); // quotes
    for (var i = 0; i < value.length; i++) {
      final unit = value.codeUnitAt(i);
      if (unit == 34 || unit == 92 || unit == 8 || unit == 9 || unit == 10 ||
          unit == 12 || unit == 13) {
        _charge(2);
      } else if (unit < 32) {
        _charge(6);
      } else if (unit < 128) {
        _charge(1);
      } else if (unit < 2048) {
        _charge(2);
      } else if (unit >= 0xd800 && unit <= 0xdbff && i + 1 < value.length &&
          value.codeUnitAt(i + 1) >= 0xdc00 && value.codeUnitAt(i + 1) <= 0xdfff) {
        _charge(4); i++;
      } else if (unit >= 0xd800 && unit <= 0xdfff) {
        // Conservatively cover either JSON escape or UTF8 replacement. Keep
        // the real codec's existing semantics, not a new surrogate normalizer.
        _charge(6);
      } else {
        _charge(3);
      }
    }
  }
  Object? capture(Object? value, int depth) {
    _node(depth);
    if (value is String) { _string(value); return value; }
    if (value == null) { _charge(4); return null; }
    if (value is bool) { _charge(value ? 4 : 5); return value; }
    if (value is int || value is double) {
      if (!(value as num).isFinite) throw StateError('Nonfinite record value');
      // Only immutable built-in bounded numeric scalars, never supplied toJson.
      // Numeric conversion is prepaid scratch; no whole input graph is encoded.
      final scalar = jsonEncode(value);
      if (scalar.length > 32) throw const CapacityExceeded();
      _charge(scalar.length); return value;
    }
    if (value is! Map && value is! List) throw StateError('Unsupported record value');
    for (final ancestor in _active) {
      if (identical(ancestor, value)) throw StateError('Cyclic record value');
    }
    _charge(2); _active.add(value);
    try {
      var members = 0;
      if (value is Map) {
        final copy = <String, Object?>{};
        // Count actual yielded entries, not a caller-declared length. One
        // iterator, no foreign graph-sized entries.toList or map conversion.
        final iterator = value.entries.iterator;
        while (iterator.moveNext()) {
          if (++members > WorkLimits.parserMembers) throw const CapacityExceeded();
          if (members > 1) _charge(1);
          final entry = iterator.current;
          final key = entry.key;
          if (key is! String) throw StateError('String record key required');
          _node(depth + 1); _string(key); _charge(1);
          final child = capture(entry.value, depth + 1);
          copy[key] = child;
        }
        return copy;
      }
      final copy = <Object?>[];
      final iterator = (value as List).iterator;
      while (iterator.moveNext()) {
        if (++members > WorkLimits.parserMembers) throw const CapacityExceeded();
        if (members > 1) _charge(1);
        final child = capture(iterator.current, depth + 1);
        copy.add(child);
      }
      return copy;
    } finally { _active.removeLast(); }
  }
}

/// This function really runs current codec/model/renderer lifetimes. Each time
/// is monotonic elapsed WALL microseconds, NOT CPU time/RSS. Fixture SHA binds
/// actual on-device bytes; failures/refusals are not turned into passing samples.
Future<Map<String, Object?>> measureWindowsWorkload(Directory root,
    {required String runId, required int repetitions, bool includeMaximum = true}) async {
  requireWindowsDevice();
  if (!RegExp(r'^[A-Za-z0-9_-]{1,64}$').hasMatch(runId) || repetitions < 1 || repetitions > 5) {
    throw ArgumentError('Finite run ID and 1..5 samples required');
  }
  await FontCatalog.load();
  final samples = <Map<String, Object?>>[];
  final operands = <Map<String, Object?>>[];
  Future<void> timed(String action, Future<void> Function() body) async {
    final stopwatch = Stopwatch()..start();
    await body();
    stopwatch.stop();
    if (stopwatch.elapsedMicroseconds <= 0) throw StateError('Empty timing sample');
    samples.add({'action': action, 'wall_us': stopwatch.elapsedMicroseconds});
  }
  WindowsFixture? maximum, fixture;
  try {
    if (includeMaximum) {
      await timed('generate_12mp_noise', () async { maximum = await WindowsFixture.generate(maximumNoise: true); });
      operands.add({'id': maximum!.id, 'photo_sha256': maximum!.photoHash,
        'photo_bytes': maximum!.session.bundle.resources.values.single.length,
        'width': 4000, 'height': 3000, 'manifest_sha256': manifestHash(maximum!.session)});
      final codec = ZipProjectCodec(budget: maximum!.budget);
      final file = File('${root.path}/maximum.recruitproj');
      await timed('maximum_codec_encode', () => codec.encode(maximum!.session.bundle, file));
      await timed('maximum_codec_import', () async {
        final imported = await codec.decodeEditorSession(file);
        try {
          if (manifestHash(imported) != manifestHash(maximum!.session)) throw StateError('Import mismatch');
        } finally { imported.dispose(); }
      });
      maximum!.dispose(); maximum = null;
    }
    await timed('generate_gradient', () async { fixture = await WindowsFixture.generate(); });
    operands.add({'id': fixture!.id, 'photo_sha256': fixture!.photoHash,
      'photo_bytes': fixture!.session.bundle.resources.values.single.length,
      'width': 640, 'height': 480, 'manifest_sha256': manifestHash(fixture!.session)});
    final codec = ZipProjectCodec(budget: fixture!.budget);
    for (var iteration = 0; iteration < repetitions; iteration++) {
      await timed('continuous_edit_$iteration', () async {
        for (var i = 0; i < 20; i++) {
          fixture!.session.setHeadline(AppLocale.ptPT, 'Vaga manual $iteration-$i');
          await Future<void>.delayed(Duration.zero);
        }
      });
      final file = File('${root.path}/save-$iteration.recruitproj');
      await timed('codec_encode_$iteration', () => codec.encode(fixture!.session.bundle, file));
      await timed('codec_import_$iteration', () async {
        final imported = await codec.decodeEditorSession(file);
        try {
          if (manifestHash(imported) != manifestHash(fixture!.session)) throw StateError('Reopen mismatch');
          imported.setHeadline(AppLocale.fr, 'Édition après réouverture');
        } finally { imported.dispose(); }
      });
      // Full selected 7x3 image operands, sequential real renderer/private IO.
      // NOT production gateway/ZIP destination timing; that remains operator QA.
      await timed('full_21_private_renders_$iteration', () async {
        for (final locale in AppLocale.values) {
          for (final format in ExportFormat.values) {
            final file = await renderPrivateImage(fixture!, root, locale, format,
              ImageEncoding.png, 'lot-$iteration');
            final decoded = await inspectImage(file, budget: fixture!.budget, format: format);
            if (decoded.width != format.width || decoded.height != format.height) {
              throw StateError('Output dimensions mismatch');
            }
          }
        }
      });
      for (final encoding in ImageEncoding.values) {
        await timed('reexport_${encoding.name}_$iteration', () async {
          await renderPrivateImage(fixture!, root, AppLocale.ptPT,
            ExportFormat.square, encoding, 'repeat-$iteration');
        });
      }
    }
    await timed('running_jpeg_worker_cancel_and_recovery', () => cancelAndRecoverRenderer(fixture!, root));
    final bytesBeforeClose = fixture!.budget.reservedBytes;
    final budget = fixture!.budget;
    await timed('fixture_lifecycle_close', () async {
      fixture!.dispose(); fixture = null;
      await Future<void>.delayed(Duration.zero);
    });
    if (budget.reservedBytes != 0 || budget.queuedCount != 0) throw StateError('Owned buffer drain unresolved');
    if (samples.isEmpty || operands.isEmpty) throw StateError('Empty measurement');
    final groups = <String, List<int>>{};
    for (final sample in samples) {
      final action = (sample['action']! as String).replaceFirst(RegExp(r'_[0-9]+$'), '');
      groups.putIfAbsent(action, () => []).add(sample['wall_us']! as int);
    }
    final summary = <String, Object?>{};
    for (final group in groups.entries) {
      final values = group.value..sort();
      summary[group.key] = {'samples': values.length,
        'p50_wall_us': values[(values.length * 0.50).ceil() - 1],
        'p95_wall_us': values[(values.length * 0.95).ceil() - 1],
        'peak_wall_us': values.last};
    }
    return {'schema': 'windows-workload-v1', 'run_id': runId,
      'summary': summary, 'quantile_method': 'nearest rank from actual finite samples; not statistical calibration',
      'build_mode': windowsMeasurementMode, 'repetitions': repetitions, 'include_maximum': includeMaximum,
      'fixtures': operands, 'samples': samples,
      'reservation_before_close_bytes': bytesBeforeClose, 'reservation_after_close_bytes': budget.reservedBytes,
      'reservation_semantics': 'existing owned-buffer accounting; NOT RSS',
      'photo_pixel_limit': WorkLimits.photoPixels, 'photo_byte_limit': WorkLimits.photoBytes,
      'owned_buffer_limit': WorkLimits.ownedBufferBytes,
      'timing_semantics': 'monotonic elapsed wall_us; NOT CPU',
      'threshold_verdict': null, 'native_rss_cpu': 'pending_external_producer',
      'manual_scope': ['actual native picker/export/ZIP timing', 'continuous UI frame timings',
        'DPI keyboard accessibility', 'production KnownFolder bootstrap', 'offline first launch'],
      'physical_bilateral_transfer': 'Android standby; pending, not proved'};
  } finally {
    try { fixture?.dispose(); } finally { maximum?.dispose(); }
  }
}

const windowsMeasurementRecordByteCap = 4 * 1024 * 1024;

// A finite lexical preflight before jsonDecode: string escapes cannot hide an
// unbounded nested/token population. JSON syntax/type validation remains the
// actual decoder's job, and all numbers are checked finite after decoding.
void _measurementJsonPreflight(Uint8List bytes) {
  var depth = 0, nodes = 0;
  var quoted = false, escaped = false;
  for (final byte in bytes) {
    if (quoted) {
      if (!escaped && byte == 34) quoted = false;
      escaped = !escaped && byte == 92;
      continue;
    }
    if (byte == 34) { quoted = true; escaped = false; continue; }
    if (byte == 123 || byte == 91) {
      if (++depth > WorkLimits.manifestDepth || ++nodes > WorkLimits.parserNodes) throw const CapacityExceeded();
    } else if (byte == 125 || byte == 93) {
      if (--depth < 0) throw StateError('Invalid object record');
    } else if (byte == 44 || byte == 58) {
      if (++nodes > WorkLimits.parserNodes) throw const CapacityExceeded();
    }
  }
  if (quoted || depth != 0) throw StateError('Invalid object record');
}

/// The sole JSON operand producer. Same saved bytes supply SHA and JSON; a
/// subsequent path replacement cannot change either. Finite copied collections
/// are immutable and independently retained with the existing graph-credit API.
Future<({String sha256, Map<String, dynamic> value})> readWindowsMeasurementSnapshot(
    File file, {required String expectedSha256, WorkBudgetController? budget,
     WindowsQaFileIo io = const WindowsQaFileIo(), Future<void> Function()? afterCapture}) async {
  _checkHash(expectedSha256);
  final domain = budget ?? WorkBudget.shared() as WorkBudgetController;
  // UTF8 body, UTF16 decode/string copies, bounded transient/frozen containers.
  // Conservative own-data envelope only, never an allocator/native RSS proof.
  final workspace = domain.reserveCopy(16 * windowsMeasurementRecordByteCap + 2 * 1024 * 1024);
  WindowsQaByteSnapshot? saved;
  AdmissionTicket? graph;
  try {
    saved = await readWindowsQaBytes(file, cap: windowsMeasurementRecordByteCap, budget: domain, io: io);
    final digest = crypto.sha256.convert(saved.bytes).toString();
    if (digest != expectedSha256) throw StateError('Record operand pin mismatch');
    await afterCapture?.call(); // test gate can change path, not our saved bytes
    _measurementJsonPreflight(saved.bytes);
    final decoded = jsonDecode(utf8.decode(saved.bytes, allowMalformed: false));
    if (decoded is! Map<String, dynamic>) throw StateError('Object record required');
    var nodes = 0, units = 0;
    Object? freeze(Object? value, int depth) {
      if (depth > WorkLimits.manifestDepth || ++nodes > WorkLimits.parserNodes) throw const CapacityExceeded();
      if (value is Map<String, dynamic>) {
        final copy = <String, dynamic>{};
        for (final entry in value.entries) {
          units += entry.key.length;
          copy[entry.key] = freeze(entry.value, depth + 1);
        }
        return Map<String, dynamic>.unmodifiable(copy);
      }
      if (value is List) return List<dynamic>.unmodifiable(value.map((v) => freeze(v, depth + 1)));
      if (value is String) { units += value.length; return value; }
      if (value is num && !value.isFinite) throw StateError('Nonfinite record value');
      if (value == null || value is bool || value is num) return value;
      throw StateError('Unsupported record value');
    }
    final value = freeze(decoded, 1) as Map<String, dynamic>;
    graph = AdmissionBudget.shared.reserve(4096 + 256 * nodes + 4 * units);
    graph.retainGraph(value);
    graph = null; // retained nested graph, not a refund on this frame's return
    return (sha256: digest, value: value);
  } on FormatException {
    throw StateError('Invalid object record'); // no input/content diagnostics
  } finally {
    graph?.release(); saved?.release(); workspace.release();
  }
}

Future<Map<String, Object?>> _finalize(Map<String, String> args) async {
  if (!kReleaseMode) throw StateError('Release binary required for finalization');
  return finalizeWindowsMeasurementRecords(timingsFile: File(args['--finalize']!),
    timingsSha256: args['--timings-sha256']!, rssFile: File(args['--rss-record']!),
    rssSha256: args['--rss-sha256']!, producerSha256: args['--producer-sha256']!,
    executableSha256: await _fileHash(File(Platform.resolvedExecutable)));
}

/// Integrity-only adapter for source-first regressions. It neither launches a
/// producer nor authenticates operational origin/release; _finalize/main keep
/// the real release/device gates. Records here are never a performance PASS.
Future<Map<String, Object?>> finalizeWindowsMeasurementRecords({
    required File timingsFile, required String timingsSha256,
    required File rssFile, required String rssSha256,
    required String producerSha256, required String executableSha256,
    WorkBudgetController? budget, WindowsQaFileIo io = const WindowsQaFileIo(),
    Future<void> Function()? afterTimingsCapture, Future<void> Function()? afterRssCapture}) async {
  _checkHash(timingsSha256); _checkHash(rssSha256);
  _checkHash(producerSha256); _checkHash(executableSha256);
  final timingSnapshot = await readWindowsMeasurementSnapshot(timingsFile,
    expectedSha256: timingsSha256, budget: budget, io: io, afterCapture: afterTimingsCapture);
  final timings = timingSnapshot.value;
  if (timings['run_id'] is! String ||
      !RegExp(r'^[A-Za-z0-9_-]{1,64}$').hasMatch(timings['run_id'] as String) ||
      timings['executable_sha256'] != executableSha256) {
    throw StateError('Unsafe run ID or changed release executable');
  }
  if (timings['schema'] != 'windows-workload-v1' || timings['build_mode'] != 'release' ||
      timings['samples'] is! List || (timings['samples'] as List).isEmpty ||
      timings['fixtures'] is! List || (timings['fixtures'] as List).isEmpty ||
      timings['pid'] is! int || timings['pid'] <= 0) {
    throw StateError('Missing actual workload');
  }
  final repetitions = timings['repetitions'];
  if (repetitions is! int || repetitions < 1 || repetitions > 5 ||
      timings['include_maximum'] != true || timings['reservation_after_close_bytes'] != 0) {
    throw StateError('Incomplete release workload');
  }
  final expectedActions = <String>{'generate_12mp_noise', 'maximum_codec_encode',
    'maximum_codec_import', 'generate_gradient', 'running_jpeg_worker_cancel_and_recovery', 'fixture_lifecycle_close',
    for (var i = 0; i < repetitions; i++) ...[
      'continuous_edit_$i', 'codec_encode_$i', 'codec_import_$i',
      'full_21_private_renders_$i', 'reexport_png_$i', 'reexport_jpg_$i',
    ],
  };
  final observedActions = <String>{};
  for (final sample in timings['samples'] as List) {
    if (sample is! Map || sample['wall_us'] is! int || sample['wall_us'] <= 0 ||
        sample['action'] is! String || !observedActions.add(sample['action'] as String)) {
      throw StateError('Invalid or duplicate timing sample');
    }
  }
  if (observedActions.length != expectedActions.length || !observedActions.containsAll(expectedActions)) {
    throw StateError('Missing mandatory release action');
  }
  final fixtures = timings['fixtures'] as List;
  if (fixtures.length != 2) throw StateError('Missing fixture identities');
  for (final fixture in fixtures) {
    if (fixture is! Map || fixture['id'] is! String || fixture['photo_sha256'] is! String ||
        fixture['manifest_sha256'] is! String || fixture['photo_bytes'] is! int || fixture['photo_bytes'] <= 0 ||
        fixture['width'] is! int || fixture['width'] <= 0 || fixture['height'] is! int || fixture['height'] <= 0) {
      throw StateError('Invalid fixture operand');
    }
    _checkHash(fixture['photo_sha256'] as String); _checkHash(fixture['manifest_sha256'] as String);
  }
  final producerHash = producerSha256;
  final rssSnapshot = await readWindowsMeasurementSnapshot(rssFile,
    expectedSha256: rssSha256, budget: budget, io: io, afterCapture: afterRssCapture);
  final digest = rssSnapshot.sha256;
  final rss = rssSnapshot.value;
  if (rss['schema'] != 'windows-external-process-v1' || rss['pid'] != timings['pid'] ||
      rss['run_id'] != timings['run_id'] || rss['producer_sha256'] != producerHash ||
      rss['executable_sha256'] != timings['executable_sha256'] ||
      rss['rss_method'] != 'GetProcessMemoryInfo.WorkingSetSize' ||
      rss['cpu_method'] != 'GetProcessTimes' || rss['samples'] is! List ||
      (rss['samples'] as List).length < 2) {
    throw StateError('Unbound external process records');
  }
  final start = DateTime.parse(timings['started_utc'] as String);
  final end = DateTime.parse(timings['ended_utc'] as String);
  if (!start.isUtc || !end.isUtc || !end.isAfter(start)) throw StateError('Invalid actual run interval');
  DateTime? previous, firstUtc;
  int? userCpu, kernelCpu, firstUserCpu, firstKernelCpu;
  var peak = 0;
  for (final sample in rss['samples'] as List) {
    if (sample is! Map || sample['working_set_bytes'] is! int || sample['working_set_bytes'] <= 0 ||
        sample['user_cpu_us'] is! int || sample['user_cpu_us'] < 0 ||
        sample['kernel_cpu_us'] is! int || sample['kernel_cpu_us'] < 0 ||
        sample['utc'] is! String) {
      throw StateError('Nonpositive/invalid external sample');
    }
    final utc = DateTime.parse(sample['utc'] as String);
    if (!utc.isUtc || utc.isBefore(start) || utc.isAfter(end) ||
        (previous != null && (!utc.isAfter(previous) || utc.difference(previous).inMilliseconds > 250)) ||
        (userCpu != null && sample['user_cpu_us'] < userCpu) ||
        (kernelCpu != null && sample['kernel_cpu_us'] < kernelCpu)) {
      throw StateError('External sample interval/CPU mismatch');
    }
    firstUtc ??= utc;
    firstUserCpu ??= sample['user_cpu_us'] as int;
    firstKernelCpu ??= sample['kernel_cpu_us'] as int;
    previous = utc; userCpu = sample['user_cpu_us'] as int; kernelCpu = sample['kernel_cpu_us'] as int;
    if (sample['working_set_bytes'] > peak) peak = sample['working_set_bytes'] as int;
  }
  if (firstUtc!.difference(start).inMilliseconds > 250 || end.difference(previous!).inMilliseconds > 250 ||
      (userCpu! - firstUserCpu!) + (kernelCpu! - firstKernelCpu!) <= 0) {
    throw StateError('Incomplete external interval or zero measured CPU work');
  }
  return {'schema': 'windows-capacity-combined-v1', 'run_id': timings['run_id'],
    'observed_user_cpu_delta_us': userCpu - firstUserCpu,
    'observed_kernel_cpu_delta_us': kernelCpu - firstKernelCpu,
    'timings_sha256': timingSnapshot.sha256, 'external_record_sha256': digest,
    'producer_sha256': producerHash, 'peak_observed_working_set_bytes': peak,
    'external_records': rss, 'workload': timings, 'threshold_verdict': null,
    'qualification': 'Integrity and supplied trusted producer binding only; parent must authenticate producer/run and adjudicate thresholds. No native/app acceptance.'};
}

Future<void> main(List<String> args) async {
  WidgetsFlutterBinding.ensureInitialized();
  Directory? sandbox;
  try {
    requireWindowsDevice();
    final options = _arguments(args);
    if (!kReleaseMode && options['--allow-diagnostic'] != 'true') throw StateError('Release required; explicit diagnostic opt-in otherwise');
    final output = Directory(options['--output-directory']!);
    requireRegularPath(File('${output.path}/probe'), absent: true);
    if (options.containsKey('--finalize')) {
      final combined = await _finalize(options);
      await writeWindowsMeasurement(File('${output.path}/${combined['run_id']}-combined.json'), combined);
      exit(0); // records validated, NOT a threshold gate
    }
    final runId = options['--run-id']!;
    final repetitions = int.parse(options['--samples']!);
    final receipt = File(options['--build-receipt']!);
    final receiptHash = options['--build-receipt-sha256']!;
    _checkHash(receiptHash);
    if (await _fileHash(receipt) != receiptHash) throw StateError('Build receipt pin mismatch');
    final executableHash = await _fileHash(File(Platform.resolvedExecutable));
    sandbox = await windowsSandbox();
    final started = DateTime.now().toUtc();
    // Intentional CLI output protocol; preserve its exact stdout operands.
    // ignore: avoid_print
    print(jsonEncode({'event': 'measurement_start', 'pid': pid, 'run_id': runId,
      'started_utc': started.toIso8601String(), 'executable_sha256': executableHash}));
    final value = await measureWindowsWorkload(sandbox, runId: runId, repetitions: repetitions);
    value.addAll({'pid': pid, 'started_utc': started.toIso8601String(),
      'ended_utc': DateTime.now().toUtc().toIso8601String(),
      'operating_system': Platform.operatingSystemVersion,
      'dart_runtime': Platform.version, 'executable_sha256': executableHash,
      'build_receipt_sha256': receiptHash});
    await writeWindowsMeasurement(File('${output.path}/$runId-timings.json'), value);
    // Intentional CLI output protocol; preserve its exact stdout operands.
    // ignore: avoid_print
    print(jsonEncode({'event': 'measurement_end', 'run_id': runId, 'status': 'timings_recorded_rss_cpu_pending', 'threshold_verdict': null}));
    await sandbox.delete(recursive: true); sandbox = null;
    exit(2);
  } catch (error) {
    // Preserve finite failure class and sandbox for diagnostic retrieval. Never
    // synthesize an empty passing artifact or disclose arbitrary input content.
    // Intentional CLI output protocol; preserve its exact stdout operands.
    // ignore: avoid_print
    print(jsonEncode({'schema': 'windows-capacity-error-v1', 'status': 'failed',
      'error_type': error.runtimeType.toString(), 'native_acceptance': false}));
    // Intentional CLI output protocol; preserve its exact stdout operands.
    // ignore: avoid_print
    if (sandbox != null) print('Owned diagnostic sandbox retained: ${sandbox.path}');
    exit(1);
  }
}
