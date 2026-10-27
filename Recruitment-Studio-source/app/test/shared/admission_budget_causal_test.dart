// Frozen specification-first target. Existing APIs only; no SDK run by author.
import 'dart:async';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/shared/operation.dart';
import 'package:recruitment_studio/shared/work_budget.dart';
import 'package:recruitment_studio/shared/problem.dart';
import 'package:recruitment_studio/shared/work_limits.dart';
import 'package:recruitment_studio/features/storage/package_worker.dart';
import 'package:recruitment_studio/features/storage/package_zip_io.dart';
import 'package:recruitment_studio/features/storage/project_codec.dart';
import '../features/storage/package_test_fixtures.dart';
import '../features/media/media_test_fixtures.dart';
import 'package:recruitment_studio/features/media/resource_service.dart';
import 'package:recruitment_studio/features/projects/project.dart';

void main() {
  late Directory sandbox;
  setUp(() {
    sandbox = Directory.systemTemp.createTempSync('t06-admission-owned-');
  });
  tearDown(() {
    sandbox.deleteSync(recursive: true);
  });
  test('pending capacity inclusive and refusal before enrollment', () async {
    final op = WorkOperation.create();
    final barrier = Completer<void>();
    try {
      for (var i = 0; i < 64; i++) {
        op.registerPending(barrier.future);
      }
      expect(() => op.registerPending(barrier.future),
          throwsA(isA<CapacityExceeded>()));
    } finally {
      barrier.complete();
      await op.finish();
    }
  });
  test('idle capacity refuses excess without dropping accepted callbacks', () async {
    final op = WorkOperation.create();
    final barrier = Completer<void>();
    var called = 0;
    op.registerPending(barrier.future);
    try {
      for (var i = 0; i < 128; i++) {
        op.afterPending(() { called++; });
      }
      expect(() => op.afterPending(() { called += 1000; }),
          throwsA(isA<CapacityExceeded>()));
    } finally {
      barrier.complete();
      await op.finish();
    }
    expect(called, 128);
  });
  test('finalizer capacity and sequential removal reclamation', () async {
    final op = WorkOperation.create();
    final removals = <void Function()>[];
    try {
      for (var i = 0; i < 128; i++) {
        removals.add(op.registerDrainFinalizer(() { if (i < 0) { throw StateError('synthetic'); } }));
      }
      expect(() => op.registerDrainFinalizer(() {}),
          throwsA(isA<CapacityExceeded>()));
      for (final remove in removals) { remove(); }
      for (var i = 0; i < 1000; i++) {
        op.registerDrainFinalizer(() {})();
      }
    } finally { await op.finish(); }
  });
  test('stop-listener capacity and removal reclamation', () async {
    final op = WorkOperation.create();
    final removals = <void Function()>[];
    try {
      for (var i = 0; i < 128; i++) {
        removals.add(op.addStopListener(() { if (i < 0) { throw StateError('synthetic'); } }));
      }
      expect(() => op.addStopListener(() {}),
          throwsA(isA<CapacityExceeded>()));
      for (final remove in removals) { remove(); }
      for (var i = 0; i < 1000; i++) { op.addStopListener(() {})(); }
    } finally { await op.finish(); }
  });
  test('staging capacity refuses extra owned file and preserves it', () async {
    final op = WorkOperation.create();
    final extra = File('${sandbox.path}/extra');
    extra.writeAsStringSync('synthetic');
    try {
      for (var i = 0; i < 64; i++) {
        final file = File('${sandbox.path}/owned-$i');
        file.writeAsStringSync('synthetic');
        op.ownStaging(file);
      }
      expect(() => op.ownStaging(extra), throwsA(isA<CapacityExceeded>()));
    } finally { await op.finish(); }
    expect(extra.readAsStringSync(), 'synthetic');
    for (var i = 0; i < 64; i++) {
      expect(File('${sandbox.path}/owned-$i').existsSync(), isFalse);
    }
  });
  test('reservation capacity rollback and sequential zero-byte reclamation', () async {
    final budget = WorkBudgetController(capacityBytes: 1);
    final op = WorkOperation.create();
    final claims = <WorkReservation>[];
    try {
      for (var i = 0; i < 128; i++) { claims.add(budget.reserve(op, 0)); }
      expect(() => budget.reserve(op, 1), throwsA(isA<CapacityExceeded>()));
      expect(budget.reservedBytes, 0);
      for (final claim in claims) { claim.release(); }
      for (var i = 0; i < 1000; i++) { budget.reserve(op, 1).release(); }
      expect(budget.reservedBytes, 0);
    } finally { await op.finish(); }
  });
  test('constructor admission rollback retains no heavy payment', () async {
    final budget = WorkBudgetController(capacityBytes: 10);
    final op = WorkOperation.create();
    try {
      for (var i = 0; i < 128; i++) { op.registerDrainFinalizer(() { if (i < 0) { throw StateError('synthetic'); } }); }
      WorkLease? unexpected;
      try {
        await expectLater(budget.acquire(op, 10).then((value) {
          unexpected = value;
          return value;
        }), throwsA(isA<CapacityExceeded>()));
      } finally { unexpected?.release(); }
      expect(budget.reservedBytes, 0);
    } finally { await op.finish(); }
  });
  test('mandatory releases survive optional idle exhaustion', () async {
    final budget = WorkBudgetController(capacityBytes: 10);
    final op = WorkOperation.create();
    final a = Completer<void>();
    final lease = await budget.acquire(op, 6);
    final claim = budget.reserve(op, 4);
    op.registerPending(a.future);
    for (var i = 0; i < 128; i++) { op.afterPending(() {}); }
    try {
      expect(() => op.afterPending(() {}), throwsA(isA<CapacityExceeded>()));
      expect(lease.release, returnsNormally);
      expect(claim.release, returnsNormally);
      expect(budget.reservedBytes, 10);
    } finally {
      a.complete();
      await op.finish();
    }
    expect(budget.reservedBytes, 0);
  });
  test('reentrant pending release follows current last drain', () async {
    final budget = WorkBudgetController(capacityBytes: 10);
    final op = WorkOperation.create();
    final a = Completer<void>(), b = Completer<void>(), enrolled = Completer<void>();
    final lease = await budget.acquire(op, 6);
    final claim = budget.reserve(op, 4);
    op.registerPending(a.future);
    op.afterPending(() {
      op.registerPending(b.future);
      enrolled.complete();
    });
    lease.release(); claim.release();
    a.complete();
    await enrolled.future;
    expect(budget.reservedBytes, 10);
    final finishing = op.finish();
    b.complete(); await finishing;
    expect(budget.reservedBytes, 0);
  });
  test('owned-buffer cap inclusive and first excess independent of metadata', () async {
    final budget = WorkBudgetController();
    final op = WorkOperation.create();
    final lease = await budget.acquire(op, WorkLimits.ownedBufferBytes);
    try {
      expect(() => budget.reserve(op, 1), throwsA(isA<CapacityExceeded>()));
      expect(budget.reservedBytes, WorkLimits.ownedBufferBytes);
    } finally { lease.release(); await op.finish(); }
    expect(budget.reservedBytes, 0);
  });
  for (final unsafe in [true, false]) {
    test('worker direct ${unsafe ? 'name' : 'manifest-size'} refused before IO', () async {
      final budget = WorkBudgetController();
      final op = WorkOperation.create();
      final lease = await budget.acquire(op, 4 * 1024 * 1024);
      final phases = <String>[];
      final absent = File('${sandbox.path}/never-created');
      expect(absent.existsSync(), isFalse);
      try {
        await expectLater(PackageWorker(onPhase: phases.add).readEntry(absent,
          PackageZipEntry(name: unsafe ? '../manifest.json' : 'manifest.json',
            offset: 0, compressedSize: 1,
            expandedSize: unsafe ? 1 : WorkLimits.manifestUtf8Bytes + 1,
            crc32: 0, method: 8), operation: op, lease: lease),
          throwsA(unsafe ? isA<PackageFailure>() : isA<CapacityExceeded>()));
        expect(phases, isEmpty);
      } finally { lease.release(); await op.finish(); }
      expect(budget.reservedBytes, 0);
    });
  }
  test('real STORE DEFLATE rich package paths preserve manual data', () async {
    final bundle = await fixtureBundle(identicalRoles: true);
    final budget = WorkBudgetController();
    final codec = ZipProjectCodec(budget: budget);
    final output = File('${sandbox.path}/output.recruitproj');
    await codec.encode(bundle, output);
    expect((await codec.decode(output)).project.toManifest(), bundle.project.toManifest());
    final compressed = File('${sandbox.path}/deflate.recruitproj');
    compressed.writeAsBytesSync(packageZip(packagePayload(bundle), deflate: true));
    expect((await codec.decode(compressed)).project.toManifest(), bundle.project.toManifest());
  });
  test('real intended media import and explicit retention handoff', () async {
    final budget = WorkBudgetController();
    final service = ResourceService(budget: budget);
    final entry = await service.importImage(realPng(), AssetKind.photo);
    expect(entry.ref.kind, AssetKind.photo);
    expect(service.previewFor(entry), isNotEmpty);
    await service.release(entry);
    expect(budget.reservedBytes, 0);
  });
}
