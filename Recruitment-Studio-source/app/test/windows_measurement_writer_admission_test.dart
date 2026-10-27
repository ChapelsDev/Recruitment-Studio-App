// Inert specification-first source: NOT compiled, imported or executed.
// Genuine budgets/operations and real IO; hooks hold/fail frontiers only.
// No native backend double, RSS observation, RED/GREEN or acceptance claim.
import 'dart:async';
import 'dart:collection';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:crypto/crypto.dart' as crypto;
import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/shared/admission_budget.dart';
import 'package:recruitment_studio/shared/operation.dart';
import 'package:recruitment_studio/shared/problem.dart';
import 'package:recruitment_studio/shared/work_budget.dart';
import 'package:recruitment_studio/shared/work_limits.dart';
import '../integration_test/support/windows_native_fixtures.dart';
import '../tool/measure_windows_capacity.dart';

final class _ObservedMap extends MapBase<String, Object?> {
  _ObservedMap(this.backing);
  final Map<String, Object?> backing;
  int reads = 0;
  @override
  Iterable<String> get keys { reads++; return backing.keys; }
  @override
  Object? operator [](Object? key) { reads++; return backing[key]; }
  @override
  void operator []=(String key, Object? value) => backing[key] = value;
  @override
  void clear() => backing.clear();
  @override
  Object? remove(Object? key) => backing.remove(key);
}
final class _WriterIo extends WindowsQaFileIo {
  _WriterIo({this.failWrite = false, this.failFlush = false,
    this.failReadClose = false, this.failAllClose = false});
  final bool failWrite, failFlush;
  bool failReadClose, failAllClose;
  int creates = 0, opens = 0, reads = 0, closes = 0;
  @override
  Future<void> create(File file) async { creates++; await super.create(file); }
  @override
  Future<RandomAccessFile> open(File file, {FileMode mode = FileMode.read}) {
    opens++; return super.open(file, mode: mode);
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
  Future<int> readInto(RandomAccessFile handle, Uint8List bytes, int start, int end) {
    reads++; return super.readInto(handle, bytes, start, end);
  }
  @override
  Future<void> close(RandomAccessFile handle) async {
    closes++;
    if (failAllClose || (failReadClose && opens == 2)) {
      throw const OperationException(ProblemCode.ioFailure);
    }
    await super.close(handle);
  }
}
Future<void> _root(Future<void> Function(Directory) body) async {
  final root = await Directory.systemTemp.createTemp('writer-admission-spec-');
  try { await body(root); }
  finally { await WindowsQaFileCustody.reap(); await root.delete(recursive: true); }
}
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test('Writer zero budget refuses before getter capture encoder UTF8 and IO', () async {
    await _root((root) async {
      final value = _ObservedMap({'x': 'ordinary'}), io = _WriterIo();
      final budget = WorkBudgetController(capacityBytes: 0);
      var captures = 0, encodes = 0, utf8s = 0;
      expect(AdmissionBudget.shared.capacityBytes - AdmissionBudget.shared.reservedBytes,
        greaterThan(256 * 1024)); // ordinary controls have headroom
      await expectLater(writeWindowsMeasurement(File('${root.path}/zero.json'), value,
        budget: budget, io: io, hooks: WindowsMeasurementWriterHooks(
          beforeCapture: () { captures++; }, beforeEncode: () { encodes++; },
          beforeUtf8: () { utf8s++; })), throwsA(isA<CapacityExceeded>()));
      expect([captures, encodes, utf8s, value.reads, io.creates, io.opens], everyElement(0));
      expect(budget.reservedBytes, 0); expect(await root.list().toList(), isEmpty);
    });
  });
  test('Writer nonzero insufficient workspace refuses before foreign getter', () async {
    await _root((root) async {
      final value = _ObservedMap({'x': 1}), io = _WriterIo();
      final budget = WorkBudgetController(capacityBytes: 1);
      await expectLater(writeWindowsMeasurement(File('${root.path}/small.json'), value,
        budget: budget, io: io), throwsA(isA<CapacityExceeded>()));
      expect(value.reads, 0); expect(io.creates, 0); expect(budget.reservedBytes, 0);
    });
  });
  test('Writer ordinary JSON matches codec escaping UTF16 numbers and real newline', () async {
    await _root((root) async {
      final file = File('${root.path}/ordinary.json');
      final value = <String, Object?>{'quote"\\': '\b\f\n\r\t\u0000/é漢😀',
        'values': [null, true, false, 1, -2, -0.0, 1.25, 1e100],
        'unpaired': String.fromCharCodes([0xd800, 65, 0xdc00])};
      final expected = utf8.encode('${jsonEncode(value)}\n');
      final budget = WorkBudgetController(), io = _WriterIo();
      await writeWindowsMeasurement(file, value, budget: budget, io: io);
      final actual = await file.readAsBytes();
      expect(actual, orderedEquals(expected)); expect(actual.last, 10);
      expect(jsonDecode(utf8.decode(actual)), jsonDecode(utf8.decode(expected)));
      expect(io.opens, 2); expect(io.reads, greaterThan(0)); expect(budget.reservedBytes, 0);
    });
  });
  test('Writer inclusive ASCII byte cap persists while snapshot graph admission refuses', () async {
    await _root((root) async {
      final file = File('${root.path}/boundary.json');
      final value = <String, Object?>{'x': 'a' * (windowsMeasurementRecordByteCap - 9)};
      final expected = utf8.encode('${jsonEncode(value)}\n');
      expect(expected.length, windowsMeasurementRecordByteCap);
      final budget = WorkBudgetController();
      await writeWindowsMeasurement(file, value, budget: budget);
      final bytes = await file.readAsBytes(); expect(bytes, orderedEquals(expected));
      final digest = crypto.sha256.convert(bytes).toString();
      // The encoded writer limit is not the retained graph's ordinary limit.
      final graphPrice = 4096 + 256 * 2 + 4 * (1 + (value['x']! as String).length);
      expect(graphPrice, greaterThan(WorkLimits.ordinaryAdmissionBytes));
      await expectLater(readWindowsMeasurementSnapshot(file,
        expectedSha256: digest, budget: budget), throwsA(isA<CapacityExceeded>()));
      expect(await file.readAsBytes(), orderedEquals(expected));
      expect(crypto.sha256.convert(await file.readAsBytes()).toString(), digest);
      expect(budget.reservedBytes, 0);
    });
  });
  test('Writer admitted small snapshot roundtrips with unchanged hash and graph prices', () async {
    await _root((root) async {
      final file = File('${root.path}/roundtrip.json');
      final value = <String, Object?>{'x': 'a' * 1024};
      final expected = utf8.encode('${jsonEncode(value)}\n');
      final graphPrice = 4096 + 256 * 2 + 4 * (1 + (value['x']! as String).length);
      expect(graphPrice, lessThan(WorkLimits.ordinaryAdmissionBytes));
      expect(AdmissionBudget.shared.capacityBytes - AdmissionBudget.shared.reservedBytes,
        greaterThanOrEqualTo(graphPrice));
      final budget = WorkBudgetController();
      await writeWindowsMeasurement(file, value, budget: budget);
      final bytes = await file.readAsBytes(); expect(bytes, orderedEquals(expected));
      final digest = crypto.sha256.convert(bytes).toString();
      final saved = await readWindowsMeasurementSnapshot(file, expectedSha256: digest, budget: budget);
      expect(saved.sha256, digest); expect(saved.value, value); expect(budget.reservedBytes, 0);
    });
  });
  test('Writer cap plus one refuses before whole encoder UTF8 or file effect', () async {
    await _root((root) async {
      final io = _WriterIo(), budget = WorkBudgetController();
      var encodes = 0, utf8s = 0;
      await expectLater(writeWindowsMeasurement(File('${root.path}/over.json'),
        {'x': 'a' * (windowsMeasurementRecordByteCap - 8)}, budget: budget, io: io,
        hooks: WindowsMeasurementWriterHooks(beforeEncode: () { encodes++; },
          beforeUtf8: () { utf8s++; })), throwsA(isA<CapacityExceeded>()));
      expect([encodes, utf8s, io.creates, io.opens], everyElement(0));
      expect(budget.reservedBytes, 0); expect(await root.list().toList(), isEmpty);
    });
  });
  test('Writer Unicode UTF16 and control escaping growth refuse before encoder', () async {
    await _root((root) async {
      for (final text in ['\u0000' * (windowsMeasurementRecordByteCap ~/ 6),
        '漢' * (windowsMeasurementRecordByteCap ~/ 3),
        '😀' * (windowsMeasurementRecordByteCap ~/ 4),
        'a' * (windowsMeasurementRecordByteCap + 1)]) {
        final io = _WriterIo(), budget = WorkBudgetController();
        var encoded = false;
        await expectLater(writeWindowsMeasurement(File('${root.path}/expand.json'), {'x': text},
          budget: budget, io: io, hooks: WindowsMeasurementWriterHooks(
            beforeEncode: () { encoded = true; })), throwsA(isA<CapacityExceeded>()));
        expect(encoded, isFalse); expect(io.creates, 0); expect(budget.reservedBytes, 0);
      }
    });
  });
  test('Writer member node depth cycle nonfinite unsupported inputs refuse without effects', () async {
    await _root((root) async {
      final cycle = <Object?>[]; cycle.add(cycle);
      Object? deep;
      for (var i = 0; i < WorkLimits.manifestDepth; i++) { deep = [deep]; }
      final cases = <Object?>[cycle, deep, double.nan, double.infinity, Object(), {1: true},
        List.filled(WorkLimits.parserMembers + 1, null),
        List.generate(9, (_) => List.filled(WorkLimits.parserMembers, null))];
      for (final value in cases) {
        final io = _WriterIo(), budget = WorkBudgetController();
        await expectLater(writeWindowsMeasurement(File('${root.path}/invalid.json'), {'x': value},
          budget: budget, io: io), throwsA(anything));
        expect(io.creates, 0); expect(budget.reservedBytes, 0);
      }
    });
  });
  test('Writer captured output remains stable after original alias mutations', () async {
    await _root((root) async {
      final child = <Object?>['captured'];
      final value = _ObservedMap({'nested': child}), budget = WorkBudgetController();
      var capturedReads = 0;
      final file = File('${root.path}/captured.json');
      await writeWindowsMeasurement(file, value, budget: budget,
        hooks: WindowsMeasurementWriterHooks(beforeEncode: () {
          capturedReads = value.reads;
          child[0] = 'late' * windowsMeasurementRecordByteCap;
          value.backing['new'] = Object();
        }));
      expect(jsonDecode(await file.readAsString()), {'nested': ['captured']});
      expect(value.reads, capturedReads); expect(budget.reservedBytes, 0);
    });
  });
  test('Writer original and readback remain paid through genuine held final drain', () async {
    await _root((root) async {
      final bytes = Uint8List.fromList([1, 2, 3, 4]), budget = WorkBudgetController();
      final file = File('${root.path}/drain.bin'), io = _WriterIo();
      final entered = Completer<void>(), gate = Completer<void>();
      var done = false;
      final running = writeFreshBytes(file, bytes, budget: budget, io: io,
        hooks: WindowsQaWriterHooks(beforeFinalDrain: (owner) {
          owner.registerPending(gate.future); entered.complete();
        })).then((_) { done = true; });
      try {
        await entered.future; await Future<void>.delayed(Duration.zero);
        expect(done, isFalse); expect(io.closes, 2);
        expect(budget.reservedBytes, 2 * bytes.length + 1);
        expect(await file.readAsBytes(), orderedEquals(bytes));
        gate.complete(); await running;
        expect(done, isTrue); expect(budget.reservedBytes, 0);
        expect(WindowsQaFileCustody.retainedCount, 0);
      } finally { if (!gate.isCompleted) gate.complete(); await running; }
    });
  });
  test('Measurement fresh output ownership stays paid through held final drain', () async {
    await _root((root) async {
      final value = <String, Object?>{'x': 'held'}, budget = WorkBudgetController();
      final expected = utf8.encode('${jsonEncode(value)}\n');
      final entered = Completer<void>(), gate = Completer<void>();
      final file = File('${root.path}/held.json');
      final running = writeWindowsMeasurement(file, value, budget: budget,
        hooks: WindowsMeasurementWriterHooks(writer: WindowsQaWriterHooks(beforeFinalDrain: (owner) {
          owner.registerPending(gate.future); entered.complete();
        })));
      try {
        await entered.future; await Future<void>.delayed(Duration.zero);
        expect(budget.reservedBytes, greaterThanOrEqualTo(2 * expected.length + 1));
        expect(await file.readAsBytes(), orderedEquals(expected));
        gate.complete(); await running; expect(budget.reservedBytes, 0);
      } finally { if (!gate.isCompleted) gate.complete(); await running; }
    });
  });
  test('Writer first write cause survives failed close held drain and exact reap', () async {
    await _root((root) async {
      final file = File('${root.path}/failed.json'), budget = WorkBudgetController();
      final io = _WriterIo(failWrite: true, failAllClose: true);
      final entered = Completer<void>(), gate = Completer<void>();
      final expected = utf8.encode('${jsonEncode({'x': 1})}\n');
      Object? cause;
      final running = writeWindowsMeasurement(file, {'x': 1}, budget: budget, io: io,
        hooks: WindowsMeasurementWriterHooks(writer: WindowsQaWriterHooks(beforeFinalDrain: (owner) {
          owner.registerPending(gate.future); entered.complete();
          owner.afterPending(() { throw StateError('inert drain failure'); });
        }))).then<void>((_) {}, onError: (Object error) { cause = error; });
      try {
        await entered.future; expect(budget.reservedBytes, greaterThanOrEqualTo(expected.length));
        expect(await WindowsQaFileCustody.reap(), isFalse);
        gate.complete(); await running;
        expect(cause, isA<OperationException>().having((e) => e.code, 'first', ProblemCode.invalidResource));
        expect(budget.reservedBytes, expected.length);
        expect(WindowsQaFileCustody.retainedCount, 1); expect(await file.exists(), isTrue);
        io.failAllClose = false; expect(await WindowsQaFileCustody.reap(), isTrue);
        expect(await file.exists(), isFalse); expect(budget.reservedBytes, 0);
      } finally { if (!gate.isCompleted) gate.complete(); await running; io.failAllClose = false; await WindowsQaFileCustody.reap(); }
    });
  });
  test('Writer first flush cause survives failed close and paid fresh output', () async {
    await _root((root) async {
      final file = File('${root.path}/flush.json'), budget = WorkBudgetController();
      final io = _WriterIo(failFlush: true, failAllClose: true);
      final expected = utf8.encode('${jsonEncode({'x': 1})}\n');
      try {
        await expectLater(writeWindowsMeasurement(file, {'x': 1}, budget: budget, io: io),
          throwsA(isA<OperationException>().having((e) => e.code, 'first', ProblemCode.invalidResource)));
        expect(budget.reservedBytes, expected.length);
        expect(await file.readAsBytes(), orderedEquals(expected));
        io.failAllClose = false; expect(await WindowsQaFileCustody.reap(), isTrue);
        expect(await file.exists(), isFalse); expect(budget.reservedBytes, 0);
      } finally { io.failAllClose = false; await WindowsQaFileCustody.reap(); }
    });
  });
  test('Writer failed readback close retains two paid buffers until physical reap', () async {
    await _root((root) async {
      final bytes = Uint8List.fromList([9, 8, 7]), budget = WorkBudgetController();
      final file = File('${root.path}/readclose.bin'), io = _WriterIo(failReadClose: true);
      try {
        await expectLater(writeFreshBytes(file, bytes, budget: budget, io: io),
          throwsA(isA<OperationException>()));
        expect(io.reads, greaterThan(0)); expect(budget.reservedBytes, 2 * bytes.length + 1);
        expect(WindowsQaFileCustody.retainedCount, 1);
        io.failReadClose = false; expect(await WindowsQaFileCustody.reap(), isTrue);
        expect(await file.exists(), isFalse); expect(budget.reservedBytes, 0);
      } finally { io.failReadClose = false; await WindowsQaFileCustody.reap(); }
    });
  });
  test('Writer final drain fault holds price then removes only exact owned effect', () async {
    await _root((root) async {
      final bytes = Uint8List.fromList([5, 6]), budget = WorkBudgetController();
      final file = File('${root.path}/drainfail.bin'), foreign = File('${root.path}/foreign');
      await foreign.writeAsBytes([77]);
      final gate = Completer<void>(), entered = Completer<void>();
      Object? failure;
      final running = writeFreshBytes(file, bytes, budget: budget,
        hooks: WindowsQaWriterHooks(beforeFinalDrain: (owner) {
          owner.registerPending(gate.future);
          owner.afterPending(() { throw StateError('inert final drain fault'); }); entered.complete();
        })).then<void>((_) {}, onError: (Object error) { failure = error; });
      try {
        await entered.future; expect(budget.reservedBytes, 2 * bytes.length + 1);
        gate.complete(); await running;
        expect(failure, isA<OperationException>()); expect(await file.exists(), isFalse);
        expect(await foreign.readAsBytes(), [77]); expect(budget.reservedBytes, 0);
      } finally { if (!gate.isCompleted) gate.complete(); await running; }
    });
  });
  test('Writer existing destination preserves original bytes and refunds workspace', () async {
    await _root((root) async {
      final file = File('${root.path}/existing.json'), budget = WorkBudgetController();
      await file.writeAsBytes([77, 88]);
      final io = _WriterIo();
      await expectLater(writeWindowsMeasurement(file, {'x': 1}, budget: budget, io: io), throwsA(anything));
      expect(await file.readAsBytes(), [77, 88]); expect(io.creates, 0);
      expect(budget.reservedBytes, 0); expect(WindowsQaFileCustody.retainedCount, 0);
    });
  });
}
