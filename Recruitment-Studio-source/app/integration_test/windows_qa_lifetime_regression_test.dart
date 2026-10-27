// SPECIFICATION-FIRST: inert until independent source approval + native grant.
// Owned-IO fault doubles never supply an engine/backend or native PASS.
import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import 'package:crypto/crypto.dart' as crypto;
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:recruitment_studio/features/composition/export_format.dart';
import 'package:recruitment_studio/features/projects/project.dart';
import 'package:recruitment_studio/shared/admission_budget.dart';
import 'package:recruitment_studio/shared/operation.dart';
import 'package:recruitment_studio/shared/problem.dart';
import 'package:recruitment_studio/shared/work_budget.dart';
import 'package:recruitment_studio/shared/work_limits.dart';

import 'support/windows_native_fixtures.dart';

final class _FaultIo extends WindowsQaFileIo {
  _FaultIo({this.writeFault = false, this.flushFault = false,
    this.openFault = false, this.closeFault = false, this.deleteFault = false, this.closeGate});
  final bool writeFault, flushFault, openFault;
  bool closeFault, deleteFault;
  final Completer<void>? closeGate;
  final closeEntered = Completer<void>();
  int opens = 0, closes = 0;
  @override
  Future<RandomAccessFile> open(File file, {FileMode mode = FileMode.read}) async {
    opens++;
    if (openFault) throw const OperationException(ProblemCode.invalidResource);
    return super.open(file, mode: mode);
  }
  @override
  Future<void> write(RandomAccessFile handle, Uint8List bytes) async {
    if (writeFault) throw const OperationException(ProblemCode.invalidResource);
    await super.write(handle, bytes);
  }
  @override
  Future<void> flush(RandomAccessFile handle) async {
    if (flushFault) throw const OperationException(ProblemCode.invalidResource);
    await super.flush(handle);
  }
  @override
  Future<void> deleteFile(File file) async {
    if (deleteFault) throw const OperationException(ProblemCode.ioFailure);
    await super.deleteFile(file);
  }
  @override
  Future<void> close(RandomAccessFile handle) async {
    closes++;
    if (!closeEntered.isCompleted) closeEntered.complete();
    await closeGate?.future;
    if (closeFault) throw const OperationException(ProblemCode.ioFailure);
    await super.close(handle);
  }
}

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  testWidgets('QA admission refusal independently deletes an already-created sandbox', (tester) async {
    requireWindowsDevice();
    final blockers = <WorkOperation>[];
    Directory? root;
    var refused = false;
    try {
      for (var i = 0; i < WorkLimits.liveOperations; i++) {
        try { blockers.add(WorkOperation.create()); }
        on CapacityExceeded { break; }
      }
      root = await windowsSandbox();
      WorkOperation? cleanupOperation;
      try {
        final operation = WorkOperation.create();
        cleanupOperation = operation;
        fail('Real operation admission must refuse at saturation');
      } on CapacityExceeded { refused = true; }
      finally {
        try { await cleanupOperation?.finish(); }
        finally { await root.delete(recursive: true); }
      }
      expect(refused, isTrue);
      expect(await root.exists(), isFalse);
    } finally {
      for (final operation in blockers) { await operation.finish(); }
      if (root != null && await root.exists()) await root.delete(recursive: true);
    }
  });

  testWidgets('QA ordinary operation and real sandbox retire without an orphan', (tester) async {
    final root = await windowsSandbox();
    WorkOperation? cleanupOperation;
    try { cleanupOperation = WorkOperation.create(); }
    finally {
      try { await cleanupOperation?.finish(); }
      finally { await root.delete(recursive: true); }
    }
    expect(await root.exists(), isFalse);
  });

  testWidgets('QA real output decode uses the same budget and preserves encoded SHA', (tester) async {
    final root = await windowsSandbox();
    WindowsFixture? fixture;
    try {
      fixture = await WindowsFixture.generate();
      final output = await renderPrivateImage(fixture, root, AppLocale.ptPT,
        ExportFormat.square, ImageEncoding.png, 'real-decode');
      final before = fixture.budget.reservedBytes;
      final result = await inspectImage(output, budget: fixture.budget, format: ExportFormat.square);
      expect([result.width, result.height], [ExportFormat.square.width, ExportFormat.square.height]);
      expect(result.hash, crypto.sha256.convert(await output.readAsBytes()).toString());
      expect(fixture.budget.reservedBytes, before);
      expect(WindowsQaImageCustody.retainedCount, 0);
    } finally { try { fixture?.dispose(); } finally { await root.delete(recursive: true); } }
  });

  testWidgets('QA heavy pressure blocks file read and engine decode until the real lease retires', (tester) async {
    final root = await windowsSandbox();
    WindowsFixture? fixture;
    final blocker = WorkOperation.create();
    WorkLease? held;
    try {
      fixture = await WindowsFixture.generate();
      final output = await renderPrivateImage(fixture, root, AppLocale.ptPT,
        ExportFormat.square, ImageEncoding.png, 'queued-decode');
      held = await fixture.budget.acquire(blocker, 1);
      final io = _FaultIo();
      var done = false;
      final pending = inspectImage(output, budget: fixture.budget, format: ExportFormat.square, io: io)
        .then((value) { done = true; return value; });
      await Future<void>.delayed(Duration.zero);
      expect(fixture.budget.queuedCount, 1);
      expect(io.opens, 0);
      expect(done, isFalse);
      held.release(); held = null;
      final result = await pending;
      expect(result.width, ExportFormat.square.width);
      expect(io.opens, 1);
    } finally {
      held?.release(); await blocker.finish();
      try { fixture?.dispose(); } finally { await root.delete(recursive: true); }
    }
  });

  testWidgets('QA zero-headroom decode refuses before any file allocation or codec', (tester) async {
    final root = await windowsSandbox();
    final budget = WorkBudgetController(capacityBytes: 0);
    final file = File('${root.path}/not-read.png');
    final io = _FaultIo();
    try {
      await file.writeAsBytes([1]);
      await expectLater(inspectImage(file, budget: budget, format: ExportFormat.square, io: io),
        throwsA(isA<CapacityExceeded>()));
      expect(io.opens, 0);
      expect(budget.reservedBytes, 0);
      expect(WindowsQaImageCustody.retainedCount, 0);
    } finally { await root.delete(recursive: true); }
  });

  testWidgets('QA wrong dimensions refuse before engine creation and normal decode recovers', (tester) async {
    final root = await windowsSandbox();
    WindowsFixture? fixture;
    var engineFrontiers = 0;
    try {
      fixture = await WindowsFixture.generate();
      final output = await renderPrivateImage(fixture, root, AppLocale.ptPT,
        ExportFormat.square, ImageEncoding.png, 'wrong-plan');
      await expectLater(inspectImage(output, budget: fixture.budget, format: ExportFormat.portrait,
        hooks: WindowsQaImageHooks(beforeEngine: () async { engineFrontiers++; })),
        throwsA(isA<OperationException>().having((e) => e.code, 'code', ProblemCode.invalidResource)));
      expect(engineFrontiers, 0);
      expect((await inspectImage(output, budget: fixture.budget, format: ExportFormat.square)).width,
        ExportFormat.square.width);
    } finally { try { fixture?.dispose(); } finally { await root.delete(recursive: true); } }
  });

  testWidgets('QA frame disposal failure retains the real lease until explicit physical retirement', (tester) async {
    final root = await windowsSandbox();
    WindowsFixture? fixture;
    var disposalFault = true;
    try {
      fixture = await WindowsFixture.generate();
      final output = await renderPrivateImage(fixture, root, AppLocale.ptPT,
        ExportFormat.square, ImageEncoding.png, 'dispose-fault');
      final before = fixture.budget.reservedBytes;
      await expectLater(inspectImage(output, budget: fixture.budget, format: ExportFormat.square,
        hooks: WindowsQaImageHooks(beforeFrameDispose: () {
          if (disposalFault) throw const OperationException(ProblemCode.ioFailure);
        })), throwsA(isA<OperationException>()));
      expect(WindowsQaImageCustody.retainedCount, 1);
      expect(fixture.budget.reservedBytes, greaterThan(before));
      disposalFault = false;
      expect(await WindowsQaImageCustody.reap(), isTrue);
      expect(WindowsQaImageCustody.retainedCount, 0);
      expect(fixture.budget.reservedBytes, before);
    } finally {
      disposalFault = false; await WindowsQaImageCustody.reap();
      try { fixture?.dispose(); } finally { await root.delete(recursive: true); }
    }
  });

  testWidgets('QA ordinary real file write closes and transfers exact bytes', (tester) async {
    final root = await windowsSandbox();
    final budget = WorkBudgetController();
    final bytes = Uint8List.fromList([1, 2, 3, 4]);
    final file = File('${root.path}/success.bin');
    try {
      await writeFreshBytes(file, bytes, budget: budget);
      expect(await file.readAsBytes(), orderedEquals(bytes));
      expect(WindowsQaFileCustody.retainedCount, 0);
      expect(budget.reservedBytes, 0);
    } finally { await root.delete(recursive: true); }
  });

  for (final phase in ['write', 'flush']) {
    testWidgets('QA $phase first cause survives rejected close with paid recoverable custody', (tester) async {
      final root = await windowsSandbox();
      final budget = WorkBudgetController();
      final io = _FaultIo(writeFault: phase == 'write', flushFault: phase == 'flush', closeFault: true);
      final file = File('${root.path}/failed.bin');
      final before = AdmissionBudget.shared.reservedBytes;
      try {
        await expectLater(writeFreshBytes(file, Uint8List.fromList([1, 2, 3]), budget: budget, io: io),
          throwsA(isA<OperationException>().having((e) => e.code, 'first code', ProblemCode.invalidResource)));
        expect(WindowsQaFileCustody.retainedCount, 1);
        expect(budget.reservedBytes, 3);
        expect(AdmissionBudget.shared.reservedBytes, greaterThan(before));
        expect(await file.exists(), isTrue);
        io.closeFault = false;
        expect(await WindowsQaFileCustody.reap(), isTrue);
        expect(await file.exists(), isFalse);
        expect(budget.reservedBytes, 0);
      } finally {
        io.closeFault = false; await WindowsQaFileCustody.reap();
        await root.delete(recursive: true);
      }
    });
  }

  testWidgets('QA real close gate forbids early write completion and refund', (tester) async {
    final root = await windowsSandbox();
    final budget = WorkBudgetController();
    final gate = Completer<void>();
    final io = _FaultIo(closeGate: gate);
    var done = false;
    final file = File('${root.path}/held.bin');
    final pending = writeFreshBytes(file, Uint8List.fromList([7, 8]), budget: budget, io: io)
      .then((_) { done = true; });
    try {
      await io.closeEntered.future;
      expect(done, isFalse);
      expect(budget.reservedBytes, 2);
      gate.complete(); await pending;
      expect(done, isTrue);
      expect(budget.reservedBytes, 0);
      expect(await file.readAsBytes(), orderedEquals([7, 8]));
    } finally {
      if (!gate.isCompleted) gate.complete();
      await pending; await root.delete(recursive: true);
    }
  });

  testWidgets('QA failed unlink retains created identity and never deletes a substituted file', (tester) async {
    final root = await windowsSandbox();
    final file = File('${root.path}/unlink-fault.bin');
    final io = _FaultIo(writeFault: true, deleteFault: true);
    try {
      await expectLater(writeFreshBytes(file, Uint8List.fromList([1]), io: io),
        throwsA(isA<OperationException>().having((e) => e.code, 'first code', ProblemCode.invalidResource)));
      expect(WindowsQaFileCustody.retainedCount, 1);
      await file.writeAsBytes([9, 9, 9, 9]);
      io.deleteFault = false;
      expect(await WindowsQaFileCustody.reap(), isFalse);
      expect(await file.readAsBytes(), orderedEquals([9, 9, 9, 9]));
      await file.delete();
      expect(await WindowsQaFileCustody.reap(), isTrue);
    } finally { io.deleteFault = false; if (await file.exists()) await file.delete();
      await WindowsQaFileCustody.reap(); await root.delete(recursive: true); }
  });

  testWidgets('QA existing destination refuses without truncation or deletion', (tester) async {
    final root = await windowsSandbox();
    final file = File('${root.path}/existing.bin');
    try {
      await file.writeAsBytes([9]);
      await expectLater(writeFreshBytes(file, Uint8List.fromList([1])), throwsA(anything));
      expect(await file.readAsBytes(), orderedEquals([9]));
      expect(WindowsQaFileCustody.retainedCount, 0);
    } finally { await root.delete(recursive: true); }
  });

  testWidgets('QA open failure after exclusive creation retires the actual created file', (tester) async {
    final root = await windowsSandbox();
    final file = File('${root.path}/open-fault.bin');
    try {
      await expectLater(writeFreshBytes(file, Uint8List.fromList([1]), io: _FaultIo(openFault: true)),
        throwsA(isA<OperationException>().having((e) => e.code, 'first code', ProblemCode.invalidResource)));
      expect(await file.exists(), isFalse);
      expect(WindowsQaFileCustody.retainedCount, 0);
    } finally { await root.delete(recursive: true); }
  });
}
