// Inert specification-first regression operands, NOT RSS/CPU observations.
// No call to main(), no release/runtime grant, no threshold/native PASS.
import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:crypto/crypto.dart' as crypto;
import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/shared/operation.dart';
import 'package:recruitment_studio/shared/problem.dart';
import 'package:recruitment_studio/shared/work_budget.dart';

import '../integration_test/support/windows_native_fixtures.dart';
import '../tool/measure_windows_capacity.dart';

final class _SnapshotIo extends WindowsQaFileIo {
  _SnapshotIo({this.growOnRead = false, this.failWrite = false, this.failFlush = false,
    this.failClose = false, this.closeGate});
  final bool growOnRead, failWrite, failFlush;
  bool failClose;
  final Completer<void>? closeGate;
  final closeEntered = Completer<void>();
  int reads = 0, opens = 0;
  File? _openedFile;
  @override
  Future<RandomAccessFile> open(File file, {FileMode mode = FileMode.read}) {
    opens++; _openedFile = file;
    return super.open(file, mode: mode);
  }
  @override
  Future<int> readInto(RandomAccessFile handle, Uint8List bytes, int start, int end) async {
    reads++;
    if (growOnRead && reads == 1) {
      await _openedFile!.writeAsBytes([32], mode: FileMode.append);
    }
    return super.readInto(handle, bytes, start, end);
  }
  @override
  Future<void> write(RandomAccessFile handle, Uint8List bytes) async {
    if (failWrite) throw const OperationException(ProblemCode.invalidResource);
    await super.write(handle, bytes);
  }
  @override
  Future<void> flush(RandomAccessFile handle) async {
    if (failFlush) throw const OperationException(ProblemCode.invalidResource);
    await super.flush(handle);
  }
  @override
  Future<void> close(RandomAccessFile handle) async {
    if (!closeEntered.isCompleted) closeEntered.complete();
    await closeGate?.future;
    if (failClose) throw const OperationException(ProblemCode.ioFailure);
    await super.close(handle);
  }
}

String _sha(List<int> bytes) => crypto.sha256.convert(bytes).toString();
String get _pin => 'a' * 64;
Map<String, Object?> _timings() => {
  'schema': 'windows-workload-v1', 'run_id': 'inert-schema-control',
  'build_mode': 'release', 'pid': 123, 'executable_sha256': _pin,
  'repetitions': 1, 'include_maximum': true, 'reservation_after_close_bytes': 0,
  'started_utc': '2026-01-01T00:00:00.000Z', 'ended_utc': '2026-01-01T00:00:00.200Z',
  'fixtures': [for (final id in ['maximum', 'gradient']) {
    'id': id, 'photo_sha256': _pin, 'manifest_sha256': _pin,
    'photo_bytes': 1, 'width': 1, 'height': 1,
  }],
  'samples': [for (final action in [
    'generate_12mp_noise', 'maximum_codec_encode', 'maximum_codec_import',
    'generate_gradient', 'running_jpeg_worker_cancel_and_recovery', 'fixture_lifecycle_close',
    'continuous_edit_0', 'codec_encode_0', 'codec_import_0',
    'full_21_private_renders_0', 'reexport_png_0', 'reexport_jpg_0',
  ]) {'action': action, 'wall_us': 1}],
};
Map<String, Object?> _rss() => {
  'schema': 'windows-external-process-v1', 'run_id': 'inert-schema-control',
  'pid': 123, 'producer_sha256': _pin, 'executable_sha256': _pin,
  'rss_method': 'GetProcessMemoryInfo.WorkingSetSize', 'cpu_method': 'GetProcessTimes',
  'samples': [
    {'utc': '2026-01-01T00:00:00.000Z', 'working_set_bytes': 101, 'user_cpu_us': 0, 'kernel_cpu_us': 0},
    {'utc': '2026-01-01T00:00:00.200Z', 'working_set_bytes': 102, 'user_cpu_us': 1, 'kernel_cpu_us': 1},
  ],
};

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test('Snapshot normal finite real file authenticates and decodes exactly once', () async {
    final root = await Directory.systemTemp.createTemp('measurement-regression-');
    final file = File('${root.path}/input.json');
    final bytes = utf8.encode('{"value":1}');
    final io = _SnapshotIo();
    final budget = WorkBudgetController();
    try {
      await file.writeAsBytes(bytes);
      final snapshot = await readWindowsMeasurementSnapshot(file, expectedSha256: _sha(bytes), budget: budget, io: io);
      expect(snapshot.sha256, _sha(bytes));
      expect(snapshot.value, {'value': 1});
      expect(io.opens, 1);
      expect(budget.reservedBytes, 0);
    } finally { await root.delete(recursive: true); }
  });

  test('Snapshot swap after capture cannot publish newly substituted unhashed JSON', () async {
    final root = await Directory.systemTemp.createTemp('measurement-regression-');
    final file = File('${root.path}/input.json');
    final a = utf8.encode('{"value":1}'), b = utf8.encode('{"value":2}');
    try {
      await file.writeAsBytes(a);
      final result = await readWindowsMeasurementSnapshot(file, expectedSha256: _sha(a),
        afterCapture: () async { await file.writeAsBytes(b); });
      expect(result.sha256, _sha(a));
      expect(result.value, {'value': 1});
      expect(await file.readAsBytes(), orderedEquals(b));
      expect(() => result.value['value'] = 99, throwsUnsupportedError);
      await expectLater(readWindowsMeasurementSnapshot(file, expectedSha256: _sha(a)), throwsA(isA<StateError>()));
    } finally { await root.delete(recursive: true); }
  });

  test('Snapshot oversize is refused before bounded buffer reads or SHA processing', () async {
    final root = await Directory.systemTemp.createTemp('measurement-regression-');
    final file = File('${root.path}/large.json');
    final io = _SnapshotIo();
    try {
      final handle = await file.open(mode: FileMode.write);
      try { await handle.truncate(windowsMeasurementRecordByteCap + 1); }
      finally { await handle.close(); }
      await expectLater(readWindowsMeasurementSnapshot(file, expectedSha256: _pin, io: io),
        throwsA(isA<CapacityExceeded>()));
      expect(io.reads, 0);
      expect(WindowsQaFileCustody.retainedCount, 0);
    } finally { await root.delete(recursive: true); }
  });

  test('Snapshot wrong digest malformed object invalid UTF8 and finite type refuse', () async {
    final root = await Directory.systemTemp.createTemp('measurement-regression-');
    final file = File('${root.path}/bad.json');
    try {
      for (final bytes in [utf8.encode('[]'), utf8.encode('{'), [255], utf8.encode('{"x":1e999}')]) {
        await file.writeAsBytes(bytes);
        await expectLater(readWindowsMeasurementSnapshot(file, expectedSha256: _sha(bytes)), throwsA(anything));
      }
      await file.writeAsString('{"ok":1}');
      await expectLater(readWindowsMeasurementSnapshot(file, expectedSha256: 'A' * 64), throwsA(isA<ArgumentError>()));
      await expectLater(readWindowsMeasurementSnapshot(file, expectedSha256: _pin), throwsA(isA<StateError>()));
    } finally { await root.delete(recursive: true); }
  });

  test('Snapshot inclusive byte cap succeeds and concurrent growth refuses boundedly', () async {
    final root = await Directory.systemTemp.createTemp('measurement-regression-');
    final file = File('${root.path}/input.json');
    final bytes = Uint8List(windowsMeasurementRecordByteCap)..fillRange(0, windowsMeasurementRecordByteCap, 32);
    bytes.setRange(0, 7, utf8.encode('{"x":1}'));
    try {
      await file.writeAsBytes(bytes);
      final positive = await readWindowsMeasurementSnapshot(file, expectedSha256: _sha(bytes));
      expect(positive.value, {'x': 1});
      expect(positive.sha256, _sha(bytes));
      final io = _SnapshotIo(growOnRead: true);
      await expectLater(readWindowsMeasurementSnapshot(file, expectedSha256: _sha(bytes), io: io),
        throwsA(isA<OperationException>()));
      expect(io.reads, greaterThan(0));
      expect(WindowsQaFileCustody.retainedCount, 0);
    } finally { await root.delete(recursive: true); }
  });

  test('Snapshot capacity refusal opens no descriptor and preserves input', () async {
    final root = await Directory.systemTemp.createTemp('measurement-regression-');
    final file = File('${root.path}/input.json');
    final bytes = utf8.encode('{"value":1}');
    final io = _SnapshotIo();
    try {
      await file.writeAsBytes(bytes);
      await expectLater(readWindowsMeasurementSnapshot(file, expectedSha256: _sha(bytes),
        budget: WorkBudgetController(capacityBytes: 0), io: io), throwsA(isA<CapacityExceeded>()));
      expect(io.opens, 0);
      expect(await file.readAsBytes(), orderedEquals(bytes));
    } finally { await root.delete(recursive: true); }
  });

  test('Finalizer normal supplied record integrity remains explicitly non-native', () async {
    final root = await Directory.systemTemp.createTemp('measurement-regression-');
    final timings = File('${root.path}/timings.json'), rss = File('${root.path}/rss.json');
    final a = utf8.encode(jsonEncode(_timings())), b = utf8.encode(jsonEncode(_rss()));
    try {
      await timings.writeAsBytes(a); await rss.writeAsBytes(b);
      final result = await finalizeWindowsMeasurementRecords(timingsFile: timings, timingsSha256: _sha(a),
        rssFile: rss, rssSha256: _sha(b), producerSha256: _pin, executableSha256: _pin);
      expect(result['timings_sha256'], _sha(a));
      expect(result['external_record_sha256'], _sha(b));
      expect(result['peak_observed_working_set_bytes'], 102);
      expect(result['observed_user_cpu_delta_us'], 1);
      expect(result['threshold_verdict'], isNull);
      expect(result['qualification'], contains('No native/app acceptance'));
    } finally { await root.delete(recursive: true); }
  });

  test('Finalizer timing and RSS swaps keep both authenticated snapshot operands', () async {
    final root = await Directory.systemTemp.createTemp('measurement-regression-');
    final timings = File('${root.path}/timings.json'), rss = File('${root.path}/rss.json');
    final a = utf8.encode(jsonEncode(_timings())), b = utf8.encode(jsonEncode(_rss()));
    try {
      await timings.writeAsBytes(a); await rss.writeAsBytes(b);
      final result = await finalizeWindowsMeasurementRecords(timingsFile: timings, timingsSha256: _sha(a),
        rssFile: rss, rssSha256: _sha(b), producerSha256: _pin, executableSha256: _pin,
        afterTimingsCapture: () async { await timings.writeAsString('{"swapped":true}'); },
        afterRssCapture: () async { await rss.writeAsString('{"swapped":true}'); });
      expect(result['workload'], _timings()); expect(result['external_records'], _rss());
      expect(result['timings_sha256'], _sha(a)); expect(result['external_record_sha256'], _sha(b));
      expect(result['peak_observed_working_set_bytes'], 102);
    } finally { await root.delete(recursive: true); }
  });

  for (final mutation in ['bool-pid', 'float-wall', 'missing-action', 'foreign-run', 'zero-cpu', 'backwards-time']) {
    test('Finalizer preserves strict schema refusal for $mutation', () async {
      final root = await Directory.systemTemp.createTemp('measurement-regression-');
      final timings = File('${root.path}/timings.json'), rss = File('${root.path}/rss.json');
      final t = _timings(), r = _rss();
      if (mutation == 'bool-pid') t['pid'] = true;
      if (mutation == 'float-wall') ((t['samples'] as List).first as Map)['wall_us'] = 1.0;
      if (mutation == 'missing-action') (t['samples'] as List).removeLast();
      if (mutation == 'foreign-run') r['run_id'] = 'foreign';
      if (mutation == 'zero-cpu') { ((r['samples'] as List).last as Map)['user_cpu_us'] = 0; ((r['samples'] as List).last as Map)['kernel_cpu_us'] = 0; }
      if (mutation == 'backwards-time') ((r['samples'] as List).last as Map)['utc'] = '2025-12-31T23:59:59.000Z';
      final a = utf8.encode(jsonEncode(t)), b = utf8.encode(jsonEncode(r));
      try {
        await timings.writeAsBytes(a); await rss.writeAsBytes(b);
        await expectLater(finalizeWindowsMeasurementRecords(timingsFile: timings, timingsSha256: _sha(a),
          rssFile: rss, rssSha256: _sha(b), producerSha256: _pin, executableSha256: _pin), throwsA(isA<StateError>()));
      } finally { await root.delete(recursive: true); }
    });
  }

  for (final phase in ['write', 'flush']) {
    test('Measurement $phase first cause survives close failure and retains created effect', () async {
      final root = await Directory.systemTemp.createTemp('measurement-regression-');
      final file = File('${root.path}/write.json');
      final io = _SnapshotIo(failWrite: phase == 'write', failFlush: phase == 'flush', failClose: true);
      final budget = WorkBudgetController();
      try {
        await expectLater(writeWindowsMeasurement(file, {'ok': 1}, budget: budget, io: io),
          throwsA(isA<OperationException>().having((e) => e.code, 'first code', ProblemCode.invalidResource)));
        expect(WindowsQaFileCustody.retainedCount, 1);
        expect(budget.reservedBytes, greaterThan(0));
        io.failClose = false; expect(await WindowsQaFileCustody.reap(), isTrue);
        expect(await file.exists(), isFalse); expect(budget.reservedBytes, 0);
      } finally { io.failClose = false; await WindowsQaFileCustody.reap(); await root.delete(recursive: true); }
    });
  }

  test('Measurement normal writer publishes actual readback only after real close', () async {
    final root = await Directory.systemTemp.createTemp('measurement-regression-');
    final file = File('${root.path}/write.json');
    final gate = Completer<void>(), io = _SnapshotIo(closeGate: null);
    final held = _SnapshotIo(closeGate: gate);
    var done = false;
    final pending = writeWindowsMeasurement(file, {'ok': 1}, io: held).then((_) { done = true; });
    try {
      await held.closeEntered.future; expect(done, isFalse);
      gate.complete(); await pending; expect(done, isTrue);
      expect(jsonDecode(await file.readAsString()), {'ok': 1});
      expect(WindowsQaFileCustody.retainedCount, 0);
      expect(io.opens, 0);
    } finally { if (!gate.isCompleted) gate.complete(); await pending; await root.delete(recursive: true); }
  });
}
