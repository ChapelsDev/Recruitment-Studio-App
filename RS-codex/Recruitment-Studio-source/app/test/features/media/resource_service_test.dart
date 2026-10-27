import 'dart:async';
import 'dart:isolate';

import 'package:recruitment_studio/features/editor/editor_session.dart';

import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:crypto/crypto.dart' as crypto;
import 'package:image/image.dart' as img;
import 'package:recruitment_studio/features/media/resource_service.dart';
import 'package:recruitment_studio/features/media/image_header_probe.dart';
import 'package:recruitment_studio/features/media/media_worker.dart';
import 'package:recruitment_studio/features/projects/project.dart';
import 'package:recruitment_studio/shared/operation.dart';
import 'package:recruitment_studio/shared/problem.dart';
import 'package:recruitment_studio/shared/work_budget.dart';
import 'package:recruitment_studio/shared/work_limits.dart';

import 'media_test_fixtures.dart';

void main() {
  test('strict JPEG actual entropy truncation cannot be laundered by tolerant decoder', () async {
    final budget = WorkBudgetController();
    final service = ResourceService(budget: budget);
    final valid = realJpeg();
    var p = 2;
    final v = ByteData.sublistView(valid);
    while (valid[p + 1] != 218) {
      p += 2 + v.getUint16(p + 2);
    }
    final scan = p + 2 + v.getUint16(p + 2);
    final truncated = Uint8List.fromList([...valid.take(scan + 1), 255, 217]);
    final ref = AssetRef(
      id: 'entropy',
      kind: AssetKind.photo,
      mediaType: MediaType.jpeg,
      width: 24,
      height: 16,
      sha256: crypto.sha256.convert(truncated).toString(),
    );
    expect(ImageHeaderProbe().inspect(truncated).width, 24);
    await expectLater(
      service.validateEmbedded(truncated, ref),
      throwsA(isA<OperationException>()),
    );
    await expectLater(
      service.importImage(truncated, AssetKind.photo),
      throwsA(isA<OperationException>()),
    );
    final control = await service.importImage(valid, AssetKind.photo);
    await service.release(control);
    expect(budget.reservedBytes, 0);
  });
  test('two default-budget services serialize real worker imports with FIFO recovery', () async {
    final budget = WorkBudget.shared() as WorkBudgetController;
    expect(budget.reservedBytes, 0);
    final ready = Completer<SendPort>(), phases = <String>[];
    final first = ResourceService(
      worker: MediaWorker(
        mode: MediaWorkerMode.holdBeforeDecode,
        onReady: ready.complete,
        onPhase: phases.add,
      ),
    );
    final second = ResourceService();
    final a = first.importImage(realPng(), AssetKind.logo);
    final control = await ready.future;
    var published = false;
    final b = second.importImage(realPng(), AssetKind.logo).then((entry) {
      published = true;
      return entry;
    });
    await Future<void>.delayed(Duration.zero);
    expect(budget.queuedCount, 1);
    expect(published, isFalse);
    control.send(true);
    final aa = await a, bb = await b;
    expect(
      phases,
      containsAllInOrder(['spawned', 'ready', 'result', 'exited', 'drained']),
    );
    expect(budget.queuedCount, 0);
    await first.release(aa);
    await second.release(bb);
    expect(budget.reservedBytes, 0);
    expect(() => first.previewFor(aa), throwsArgumentError);
    await first.release(aa);
    expect(budget.reservedBytes, 0);
  });
  test('strict refusal leaves previously valid editor resources project and charges untouched', () async {
    final budget = WorkBudgetController(),
        service = ResourceService(budget: WorkBudgetController());
    final entry = await service.importImage(realPng(), AssetKind.photo);
    final editor = EditorSession(
      Project.blank(id: 'synthetic').withPhoto(entry.ref),
      resources: {entry.ref.id: entry.bytes},
      budget: budget,
    );
    final before = editor.bundle,
        digest = crypto.sha256
            .convert(editor.bundle.resources[entry.ref.id]!)
            .toString(),
        charge = budget.reservedBytes;
    await expectLater(
      service.validateEmbedded(
        insertPngChunk(entry.bytes, 'tEXt', [97, 0, 98]),
        entry.ref,
      ),
      throwsA(isA<OperationException>()),
    );
    expect(identical(editor.bundle, before), isTrue);
    expect(editor.project.revision, before.project.revision);
    expect(
      crypto.sha256.convert(editor.bundle.resources[entry.ref.id]!).toString(),
      digest,
    );
    expect(budget.reservedBytes, charge);
    editor.dispose();
    await service.release(entry);
    expect(budget.reservedBytes, 0);
  });
  test('actual service late finish at worker drain refuses publication and frees all accounting', () async {
    final budget = WorkBudgetController();
    final op = WorkOperation.create();
    Future<void>? finish;
    final phases = <String>[];
    final service = ResourceService(
      budget: budget,
      worker: MediaWorker(
        onPhase: (p) {
          phases.add(p);
          if (p == 'drained') finish = op.finish();
        },
      ),
    );
    await expectLater(
      service.importImage(realPng(), AssetKind.photo, operation: op),
      throwsA(
        isA<OperationException>().having(
          (e) => e.code,
          'late finish',
          ProblemCode.operationCancelled,
        ),
      ),
    );
    await finish!;
    expect(phases, ['spawned', 'result', 'exited', 'drained']);
    expect(budget.reservedBytes, 0);
  });
  test('concrete borrowed live parent lease adds paid scratch without recursion finish or slot release', () async {
    final budget = WorkBudgetController();
    final op = WorkOperation.create();
    addTearDown(op.finish);
    final parent = await budget.acquire(op, 1);
    final charges = <int>[];
    final service = ResourceService(
      budget: budget,
      worker: MediaWorker(
        onPhase: (p) {
          if (p == 'verified') charges.add(budget.reservedBytes);
        },
      ),
    );
    final b = realPng(), h = ImageHeaderProbe().inspect(realPng());
    final ref = AssetRef(
      id: 'borrowed',
      kind: AssetKind.logo,
      mediaType: MediaType.png,
      width: 3,
      height: 2,
      sha256: crypto.sha256.convert(b).toString(),
    );
    await service.validateEmbeddedWithLease(
      b,
      ref,
      operation: op,
      lease: parent,
    );
    expect(charges, [
      1 + b.length * 2 + 1048576 + mediaAllocationEstimate(h, b.length),
    ]);
    expect(budget.reservedBytes, 1);
    expect(budget.queuedCount, 0);
    expect(op.isFinishing, isFalse);
    expect(identical(parent.forChild(op), parent), isTrue);
    final foreign = WorkOperation.create();
    addTearDown(foreign.finish);
    await expectLater(
      service.validateEmbeddedWithLease(
        b,
        ref,
        operation: foreign,
        lease: parent,
      ),
      throwsArgumentError,
    );
    expect(budget.reservedBytes, 1);
    parent.release();
    await expectLater(
      service.validateEmbeddedWithLease(b, ref, operation: op, lease: parent),
      throwsStateError,
    );
    expect(budget.reservedBytes, 0);
  });
  test('kind byte pixel and thumbnail admission refuses before worker with valid controls', () async {
    final budget = WorkBudgetController(), phases = <String>[];
    final service = ResourceService(
      budget: budget,
      worker: MediaWorker(onPhase: phases.add),
    );
    for (final kind in AssetKind.values) {
      final limit = switch (kind) {
        AssetKind.photo => WorkLimits.photoBytes,
        AssetKind.logo => WorkLimits.logoBytes,
        AssetKind.thumbnail => WorkLimits.thumbnailBytes,
      };
      await expectLater(
        service.importImage(Uint8List(limit + 1), kind),
        throwsA(isA<CapacityExceeded>()),
      );
    }
    await expectLater(
      service.importImage(
        pngWithRaw([0, 0, 0, 0, 0], width: 2500, height: 1601),
        AssetKind.logo,
      ),
      throwsA(isA<CapacityExceeded>()),
    );
    await expectLater(
      service.importImage(
        pngWithRaw([0, 0, 0, 0, 0], width: 513),
        AssetKind.thumbnail,
      ),
      throwsA(isA<CapacityExceeded>()),
    );
    expect(phases, isEmpty);
    expect(budget.reservedBytes, 0);
    final control = await service.importImage(realPng(), AssetKind.thumbnail);
    await service.release(control);
    expect(budget.reservedBytes, 0);
  });
  test('queued import owns immutable admitted snapshot and cancellation retires snapshot without spawning', () async {
    final budget = WorkBudgetController();
    final parent = WorkOperation.create(),
        caller = WorkOperation.create(),
        cancelled = WorkOperation.create();
    addTearDown(parent.finish);
    addTearDown(caller.finish);
    addTearDown(cancelled.finish);
    final lease = await budget.acquire(parent, 1);
    final phases = <String>[];
    final service = ResourceService(
      budget: budget,
      worker: MediaWorker(onPhase: phases.add),
    );
    final input = realPng();
    final result = service.importImage(
      input,
      AssetKind.logo,
      operation: caller,
    );
    input.fillRange(0, input.length, 0);
    final rejected = expectLater(
      service.importImage(realPng(), AssetKind.logo, operation: cancelled),
      throwsA(isA<OperationException>()),
    );
    cancelled.cancel();
    await rejected;
    expect(phases, isEmpty);
    expect(budget.queuedCount, 1);
    lease.release();
    final entry = await result;
    expect(ImageHeaderProbe().inspect(entry.bytes).width, 3);
    await service.release(entry);
    expect(budget.reservedBytes, 0);
  });
  test('strict embedded real photo logo thumbnail decode without normalization or mutation', () async {
    final budget = WorkBudgetController();
    final phases = <String>[];
    final service = ResourceService(
      budget: budget,
      worker: MediaWorker(onPhase: phases.add),
    );
    for (final kind in AssetKind.values) {
      final b = kind == AssetKind.photo ? realJpeg() : realPng();
      final before = Uint8List.fromList(b);
      final h = ImageHeaderProbe().inspect(b);
      final expected = AssetRef(
        id: 'embedded',
        kind: kind,
        mediaType: h.mediaType,
        width: h.width,
        height: h.height,
        sha256: crypto.sha256.convert(b).toString(),
      );
      await service.validateEmbedded(b, expected);
      expect(b, before);
      expect(budget.reservedBytes, 0);
    }
    expect(phases.where((p) => p == 'verified').length, 3);
    expect(phases, isNot(contains('result')));
  });
  test('strict embedded refuses true-hash privacy and MIME dimensions digest corruption without laundering', () async {
    final budget = WorkBudgetController();
    final phases = <String>[];
    final service = ResourceService(
      budget: budget,
      worker: MediaWorker(onPhase: phases.add),
    );
    final plain = realPng();
    for (final mode in [
      'digest',
      'mime',
      'dimensions',
      'text',
      'exif',
      'xmp',
      'bomb',
      'short',
      'corrupt',
    ]) {
      final b = switch (mode) {
        'text' => insertPngChunk(plain, 'tEXt', [97, 0, 98]),
        'exif' => withExif(realJpeg(), 6, gps: true),
        'xmp' => Uint8List.fromList([
          255,
          216,
          ...jpegSegment(225, 'private-XMP'.codeUnits),
          ...realJpeg().skip(2),
        ]),
        'bomb' => pngWithRaw(List.filled(50000, 0)),
        'short' => pngWithRaw([0, 1, 2, 3]),
        'corrupt' => Uint8List.fromList(plain)..[plain.length - 5] ^= 1,
        _ => plain,
      };
      final before = Uint8List.fromList(b);
      final jpeg = ['exif', 'xmp'].contains(mode);
      final expected = AssetRef(
        id: 'embedded',
        kind: AssetKind.photo,
        mediaType: jpeg || mode == 'mime' ? MediaType.jpeg : MediaType.png,
        width: jpeg
            ? 24
            : mode == 'dimensions'
            ? 4
            : ['bomb', 'short'].contains(mode)
            ? 1
            : 3,
        height: jpeg
            ? 16
            : ['bomb', 'short'].contains(mode)
            ? 1
            : 2,
        sha256: mode == 'digest'
            ? '0' * 64
            : crypto.sha256.convert(b).toString(),
      );
      await expectLater(
        service.validateEmbedded(b, expected),
        mode == 'bomb'
            ? throwsA(isA<CapacityExceeded>())
            : throwsA(isA<OperationException>()),
      );
      expect(b, before);
      expect(budget.reservedBytes, 0);
    }
    expect(phases.where((p) => p == 'verified'), isEmpty);
  });
  test('default service actual isolate imports normalized readonly photo logo and thumbnail with retained preview accounting', () async {
    final budget = WorkBudgetController();
    final phases = <String>[];
    final service = ResourceService(
      budget: budget,
      worker: MediaWorker(onPhase: phases.add),
    );
    for (final kind in AssetKind.values) {
      final input = kind == AssetKind.photo
          ? withExif(realJpeg(), 6, gps: true)
          : realPng();
      final before = Uint8List.fromList(input);
      final entry = await service.importImage(input, kind);
      final h = ImageHeaderProbe().inspect(entry.bytes);
      expect([
        entry.ref.width,
        entry.ref.height,
      ], kind == AssetKind.photo ? [16, 24] : [3, 2]);
      expect(entry.ref.mediaType, MediaType.png);
      expect(entry.ref.kind, kind);
      expect(entry.ref.sha256, crypto.sha256.convert(entry.bytes).toString());
      expect(h.hasPrivateMetadata, isFalse);
      expect(input, before);
      expect(() => entry.bytes[0] = 0, throwsUnsupportedError);
      final preview = service.previewFor(entry);
      expect(() => preview[0] = 0, throwsUnsupportedError);
      expect(budget.reservedBytes, entry.bytes.length + preview.length);
      if (kind == AssetKind.photo) {
        expect(entry.warnings.single.code, ProblemCode.insufficientResolution);
      }
      if (kind == AssetKind.logo) {
        expect(img.decodePng(entry.bytes)!.getPixel(1, 1).a, 130);
      }
      await service.release(entry);
      expect(budget.reservedBytes, 0);
    }
    expect(phases.where((p) => p == 'exited').length, 3);
  });
  test('service borrowed operation remains live and capacity refusal precedes any spawn with legitimate headroom control', () async {
    final op = WorkOperation.create();
    addTearDown(op.finish);
    final budget = WorkBudgetController();
    final phases = <String>[];
    final service = ResourceService(
      budget: budget,
      worker: MediaWorker(onPhase: phases.add),
    );
    final bytes = realPng();
    final estimate = mediaAllocationEstimate(
      ImageHeaderProbe().inspect(bytes),
      bytes.length,
    );
    final foreign = budget.reserve(op, budget.capacityBytes - estimate + 1);
    await expectLater(
      service.importImage(bytes, AssetKind.logo, operation: op),
      throwsA(isA<CapacityExceeded>()),
    );
    expect(phases, isEmpty);
    foreign.release();
    final entry = await service.importImage(
      bytes,
      AssetKind.logo,
      operation: op,
    );
    expect(op.isFinishing, isFalse);
    expect(op.isCancelled, isFalse);
    expect(phases, contains('exited'));
    await service.release(entry);
    expect(budget.reservedBytes, 0);
  });
}
