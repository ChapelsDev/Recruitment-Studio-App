import 'dart:typed_data';
import 'dart:async';
import 'dart:isolate';

import 'package:recruitment_studio/shared/work_limits.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/features/media/media_worker.dart';
import 'package:recruitment_studio/shared/operation.dart';
import 'package:recruitment_studio/shared/problem.dart';
import 'package:image/image.dart' as img;
import 'package:crypto/crypto.dart' as crypto;
import 'package:recruitment_studio/features/media/image_header_probe.dart';
import 'package:recruitment_studio/shared/work_budget.dart';

import 'media_test_fixtures.dart';

void main() {
  test('real baseline JPEG minimal entropy and restart controls plus structural corruption', () async {
    final op = WorkOperation.create();
    addTearDown(op.finish);
    final lease = await WorkBudgetController().acquire(op, 30 * 1024 * 1024);
    Uint8List minimal({bool restart = false, int? rstMarker}) =>
        Uint8List.fromList([
          255,
          216,
          ...jpegSegment(219, [0, ...List.filled(64, 1)]),
          ...jpegSegment(192, [8, 0, 16, 0, 8, 1, 1, 17, 0]),
          ...jpegSegment(196, [
            0,
            1,
            ...List.filled(15, 0),
            0,
            16,
            1,
            ...List.filled(15, 0),
            0,
          ]),
          if (restart) ...jpegSegment(221, [0, 1]),
          ...jpegSegment(218, [1, 1, 0, 0, 63, 0]),
          ...restart ? [63, 255, rstMarker ?? 208, 63] : [15],
          255,
          217,
        ]);
    var controlIndex = 0;
    for (final b in [
      minimal(),
      minimal(restart: true),
      realJpeg(width: 7, height: 9),
      realJpeg(width: 33, height: 17),
      realJpeg(width: 33, height: 17, chroma: img.JpegChroma.yuv420),
    ]) {
      expect(
        () => normalizeMedia(b, lease: lease, operation: op),
        returnsNormally,
        reason: 'JPEG positive control ${controlIndex++}',
      );
      final result = normalizeMedia(b, lease: lease, operation: op);
      expect(img.decodePng(result.bytes), isNotNull);
    }
    final valid = minimal();
    for (final b in [
      minimal(restart: true, rstMarker: 209),
      Uint8List.fromList([...valid.take(valid.length - 2), 0, 255, 217]),
    ]) {
      expect(
        () => normalizeMedia(b, lease: lease, operation: op),
        throwsA(isA<OperationException>()),
      );
    }
  });
  test('audited PNG channels and grayscale JPEG decode normalize real pixels positively', () async {
    final op = WorkOperation.create();
    addTearDown(op.finish);
    final lease = await WorkBudgetController().acquire(op, 30 * 1024 * 1024);
    for (final input in [
      for (final c in [1, 2, 3, 4]) realPng(channels: c),
      realJpeg(gray: true),
    ]) {
      final baseline = img.decodeImage(input)!,
          result = normalizeMedia(input, lease: lease, operation: op);
      final pixels = img.decodePng(result.bytes)!;
      expect([pixels.width, pixels.height], [baseline.width, baseline.height]);
      final a = pixels.getPixel(1, 1), b = baseline.getPixel(1, 1);
      expect(
        [a.r, a.g, a.b, a.a],
        baseline.numChannels == 1 ? [b.r, b.r, b.r, 255] : [b.r, b.g, b.b, b.a],
      );
      expect(
        ImageHeaderProbe().inspect(result.bytes).hasPrivateMetadata,
        isFalse,
      );
    }
  });
  test(
    'one borrowed heavy slot cannot start two real codec workers concurrently',
    () async {
      final op = WorkOperation.create();
      addTearDown(op.finish);
      final budget = WorkBudgetController(), ready = Completer<SendPort>();
      final lease = await budget.acquire(op, 30 * 1024 * 1024);
      final phases = <String>[];
      final first = MediaWorker(
        mode: MediaWorkerMode.holdBeforeDecode,
        onReady: ready.complete,
      ).run(realPng(), operation: op, lease: lease);
      final control = await ready.future;
      try {
        await expectLater(
          MediaWorker(onPhase: phases.add)
              .run(realPng(), operation: op, lease: lease),
          throwsStateError,
        );
        expect(phases, isEmpty);
      } finally {
        control.send(true);
        await first;
        lease.release();
      }
      expect(budget.reservedBytes, 0);
    },
  );
  test('every real worker publication path fences cancel and finish at actual drain', () async {
    for (final path in ['run', 'verify', 'borrowed']) {
      for (final finish in [false, true]) {
        final op = WorkOperation.create(), budget = WorkBudgetController();
        final lease = await budget.acquire(op, 30 * 1024 * 1024);
        Future<void>? finishing;
        final phases = <String>[];
        final worker = MediaWorker(
          onPhase: (p) {
            phases.add(p);
            if (p == 'drained') {
              if (finish) {
                finishing = op.finish();
              } else {
                op.cancel();
              }
            }
          },
        );
        final result = switch (path) {
          'run' => worker.run(realPng(), operation: op, lease: lease),
          'verify' => worker.verify(realPng(), operation: op, lease: lease),
          _ => worker.verifyBorrowed(realPng(), operation: op, lease: lease),
        };
        await expectLater(
          result,
          throwsA(
            isA<OperationException>().having(
              (e) => e.code,
              'drain fence',
              ProblemCode.operationCancelled,
            ),
          ),
        );
        lease.release();
        await (finishing ?? op.finish());
        expect(phases, containsAllInOrder(['spawned', 'exited', 'drained']));
        expect(budget.reservedBytes, 0);
      }
    }
  });
  test('real held-after-result timeout rejects late publication and drains only after exit', () async {
    final op = WorkOperation.create();
    addTearDown(op.finish);
    final budget = WorkBudgetController();
    final lease = await budget.acquire(op, 30 * 1024 * 1024);
    final phases = <String>[], charges = <int>[];
    void Function()? expire;
    final durations = <Duration>[];
    final worker = MediaWorker(
      mode: MediaWorkerMode.holdAfterResult,
      timeout: const Duration(milliseconds: 80),
      deadline: (duration, callback) {
        durations.add(duration);
        expire = callback;
        return Timer(const Duration(days: 1), callback);
      },
      onPhase: (p) {
        phases.add(p);
        if (p == 'result') expire!();
        if (p == 'killRequested') {
          lease.release();
          charges.add(budget.reservedBytes);
        }
      },
    );
    await expectLater(
      worker.run(realPng(), operation: op, lease: lease),
      throwsA(
        isA<MediaWorkerFailure>().having((e) => e.reason, 'timeout', 'timeout'),
      ),
    );
    expect(
      phases,
      containsAllInOrder([
        'spawned',
        'result',
        'killRequested',
        'exited',
        'drained',
      ]),
    );
    expect(charges, [lease.bytes]);
    expect(budget.reservedBytes, 0);
    expect(durations, [const Duration(milliseconds: 80)]);
    expect(MediaWorker().timeout, WorkLimits.decodeTimeout);
    expect(
      const MediaWorkerFailure('timeout').problem.code,
      ProblemCode.ioFailure,
    );
    expect(
      const MediaWorkerFailure('timeout').problem.severity,
      ProblemSeverity.error,
    );
    expect(
      const MediaWorkerFailure('timeout').toString(),
      'Media worker failed: timeout',
    );
  });
  test(
    'actual default deadline timer kills held isolate and waits actual exit',
    () async {
      final op = WorkOperation.create();
      addTearDown(op.finish);
      final budget = WorkBudgetController(), phases = <String>[];
      final lease = await budget.acquire(op, 30 * 1024 * 1024);
      await expectLater(
        MediaWorker(
          mode: MediaWorkerMode.holdBeforeDecode,
          timeout: const Duration(milliseconds: 80),
          onPhase: phases.add,
        ).run(realPng(), operation: op, lease: lease),
        throwsA(
          isA<MediaWorkerFailure>().having(
            (e) => e.reason,
            'actual timer',
            'timeout',
          ),
        ),
      );
      expect(
        phases,
        containsAllInOrder(['spawned', 'killRequested', 'exited', 'drained']),
      );
      expect(phases, isNot(contains('result')));
      lease.release();
      expect(budget.reservedBytes, 0);
    },
  );
  test(
    'real held-before-decode cancellation drains before finish releases lease',
    () async {
      final op = WorkOperation.create();
      final budget = WorkBudgetController(), ready = Completer<SendPort>();
      final lease = await budget.acquire(op, 30 * 1024 * 1024);
      final phases = <String>[];
      final run = MediaWorker(
        mode: MediaWorkerMode.holdBeforeDecode,
        onReady: ready.complete,
        onPhase: phases.add,
      ).run(realPng(), operation: op, lease: lease);
      final failure = expectLater(run, throwsA(isA<OperationException>()));
      await ready.future;
      op.cancel();
      lease.release();
      expect(budget.reservedBytes, lease.bytes);
      await failure;
      await op.finish();
      expect(budget.reservedBytes, 0);
      expect(
        phases,
        containsAllInOrder([
          'spawned',
          'ready',
          'killRequested',
          'exited',
          'drained',
        ]),
      );
    },
  );
  for (final mode in [
    MediaWorkerMode.crash,
    MediaWorkerMode.exitWithoutResult,
  ]) {
    test('real isolate $mode failure exits and releases safely', () async {
      final op = WorkOperation.create();
      addTearDown(op.finish);
      final budget = WorkBudgetController(), phases = <String>[];
      final lease = await budget.acquire(op, 30 * 1024 * 1024);
      await expectLater(
        MediaWorker(
          mode: mode,
          onPhase: phases.add,
        ).run(realPng(), operation: op, lease: lease),
        throwsA(
          isA<MediaWorkerFailure>().having(
            (e) => e.code,
            'existing code',
            ProblemCode.ioFailure,
          ),
        ),
      );
      lease.release();
      expect(budget.reservedBytes, 0);
      expect(phases, containsAllInOrder(['spawned', 'exited', 'drained']));
    });
  }
  test('spawn rejection registers no termination fiction and cleans ports and pending', () async {
    final op = WorkOperation.create();
    final budget = WorkBudgetController();
    final lease = await budget.acquire(op, 30 * 1024 * 1024),
        phases = <String>[];
    await expectLater(
      MediaWorker(
        onPhase: phases.add,
        spawn: (_, _, _) async =>
            throw IsolateSpawnException('synthetic startup'),
      ).run(realPng(), operation: op, lease: lease),
      throwsA(
        isA<MediaWorkerFailure>().having((e) => e.reason, 'startup', 'startup'),
      ),
    );
    lease.release();
    await op.finish();
    expect(budget.reservedBytes, 0);
    expect(phases, ['drained']);
  });
  for (final stop in ['cancel-spawn', 'cancel-result', 'finish-result']) {
    test(
      'real worker $stop fences publication and holds bytes until onExit',
      () async {
        final op = WorkOperation.create();
        final budget = WorkBudgetController();
        final lease = await budget.acquire(op, 30 * 1024 * 1024);
        final phases = <String>[], observed = <int>[];
        Future<void>? finish;
        final worker = MediaWorker(
          onPhase: (p) {
            phases.add(p);
            if ((stop == 'cancel-spawn' && p == 'spawned') ||
                (stop != 'cancel-spawn' && p == 'result')) {
              if (stop.startsWith('cancel')) {
                op.cancel();
              } else {
                finish = op.finish();
              }
              lease.release();
              observed.add(budget.reservedBytes);
            }
          },
        );
        await expectLater(
          worker.run(realPng(), operation: op, lease: lease),
          throwsA(
            isA<OperationException>().having(
              (e) => e.code,
              'cancel or finish fence',
              ProblemCode.operationCancelled,
            ),
          ),
        );
        await (finish ?? op.finish());
        expect(observed, [lease.bytes]);
        expect(
          phases,
          containsAllInOrder(['spawned', 'killRequested', 'exited', 'drained']),
        );
        expect(budget.reservedBytes, 0);
      },
    );
  }
  test('default worker runs real isolate and returns only after actual exit drain while borrowing operation', () async {
    final op = WorkOperation.create();
    addTearDown(op.finish);
    final budget = WorkBudgetController();
    final lease = await budget.acquire(op, 30 * 1024 * 1024);
    final phases = <String>[];
    final result = await MediaWorker(onPhase: phases.add)
        .run(realPng(), operation: op, lease: lease);
    expect(img.decodePng(result.bytes)!.width, 3);
    expect(phases, ['spawned', 'result', 'exited', 'drained']);
    expect(op.isFinishing, isFalse);
    expect(op.isCancelled, isFalse);
    expect(budget.reservedBytes, lease.bytes);
    lease.release();
    expect(budget.reservedBytes, 0);
  });
  test('JPEG normalizes every orientation and mirror axis exactly once without GPS EXIF XMP or comments', () async {
    final op = WorkOperation.create();
    addTearDown(op.finish);
    final lease = await WorkBudgetController().acquire(op, 200 * 1024 * 1024);
    final jpeg = realJpeg();
    final baseline = img.decodeJpg(jpeg)!;
    for (var o = 1; o <= 8; o++) {
      final input = withExif(jpeg, o, gps: true);
      final copy = Uint8List.fromList(input);
      final out = normalizeMedia(input, lease: lease, operation: op);
      final pixels = img.decodePng(out.bytes)!;
      expect([pixels.width, pixels.height], o >= 5 ? [16, 24] : [24, 16]);
      for (var y = 0; y < 16; y++) {
        for (var x = 0; x < 24; x++) {
          final pos = switch (o) {
            1 => [x, y],
            2 => [23 - x, y],
            3 => [23 - x, 15 - y],
            4 => [x, 15 - y],
            5 => [y, x],
            6 => [15 - y, x],
            7 => [15 - y, 23 - x],
            _ => [y, 23 - x],
          };
          final actual = pixels.getPixel(pos[0], pos[1]),
              original = baseline.getPixel(x, y);
          expect(
            [actual.r, actual.g, actual.b],
            [original.r, original.g, original.b],
          );
        }
      }
      expect(ImageHeaderProbe().inspect(out.bytes).hasPrivateMetadata, isFalse);
      expect(input, copy);
    }
    final private = Uint8List.fromList([
      255,
      216,
      ...jpegSegment(225, 'http://invalid.test/xmp'.codeUnits),
      ...jpegSegment(254, 'synthetic-private'.codeUnits),
      ...jpeg.skip(2),
    ]);
    expect(
      ImageHeaderProbe()
          .inspect(normalizeMedia(private, lease: lease, operation: op).bytes)
          .hasPrivateMetadata,
      isFalse,
    );
  });
  test('JPEG single scan refuses postscan metadata that could reach codec EXIF parser', () {
    final jpeg = realJpeg();
    final b = Uint8List.fromList([
      ...jpeg.take(jpeg.length - 2),
      ...jpegSegment(254, 'private'.codeUnits),
      255,
      217,
    ]);
    expect(
      () => ImageHeaderProbe().inspect(b),
      throwsA(isA<OperationException>()),
    );
  });
  test('actual PNG normalization strips private text preserves alpha aspect and bounded preview without upscale', () async {
    final op = WorkOperation.create();
    addTearDown(op.finish);
    final budget = WorkBudgetController();
    final lease = await budget.acquire(op, 200 * 1024 * 1024);
    final input = insertPngChunk(realPng(width: 600, height: 300), 'tEXt', [
      97,
      0,
      98,
    ]);
    final saved = Uint8List.fromList(input);
    final result = normalizeMedia(input, lease: lease, operation: op);
    final h = ImageHeaderProbe().inspect(result.bytes);
    expect([h.width, h.height], [600, 300]);
    expect(h.hasPrivateMetadata, isFalse);
    expect(result.sha256, crypto.sha256.convert(result.bytes).toString());
    final original = img.decodePng(input)!;
    final actual = img.decodePng(result.bytes)!;
    expect(actual.getPixel(1, 1).a, original.getPixel(1, 1).a);
    final preview = ImageHeaderProbe().inspect(result.preview);
    expect([preview.width, preview.height], [512, 256]);
    expect(result.preview.length, lessThanOrEqualTo(1048576));
    expect(input, saved);
    final small = normalizeMedia(realPng(), lease: lease, operation: op);
    expect(
      [
        ImageHeaderProbe().inspect(small.preview).width,
        ImageHeaderProbe().inspect(small.preview).height,
      ],
      [3, 2],
    );
    expect(
      () => normalizeMedia(
        pngWithRaw(List.filled(10000, 0)),
        lease: lease,
        operation: op,
      ),
      throwsA(isA<CapacityExceeded>()),
    );
  });
  test(
    'PNG capped DEFLATE validates stored fixed dynamic real channel controls',
    () {
      for (final level in [0, 6]) {
        for (final strategy in [0, 4]) {
          expect(
            validatePngExpansion(
              pngWithRaw(
                List.filled(1025 * 4, 0),
                width: 256,
                height: 4,
                level: level,
                strategy: strategy,
              ),
            ),
            4100,
          );
        }
      }
      for (final c in [1, 2, 3, 4]) {
        expect(validatePngExpansion(realPng(channels: c)), 2 * (3 * c + 1));
      }
    },
  );
  test('tiny declared PNG excessive real IDAT refuses before materializing expansion', () {
    expect(
      () => validatePngExpansion(pngWithRaw(List.filled(100000, 0))),
      throwsA(isA<CapacityExceeded>()),
    );
    expect(
      () => validatePngExpansion(pngWithRaw([0, 1, 2, 3])),
      throwsA(isA<OperationException>()),
    );
    expect(
      () => validatePngExpansion(pngWithRaw([5, 1, 2, 3, 4])),
      throwsA(isA<OperationException>()),
    );
    final png = realPng();
    final payload = Uint8List.fromList(png.sublist(41, png.length - 16));
    payload[payload.length - 1] ^= 1;
    final corrupt = Uint8List.fromList([
      ...png.take(33),
      ...pngChunk('IDAT', payload),
      ...pngChunk('IEND', []),
    ]);
    expect(
      () => validatePngExpansion(corrupt),
      throwsA(isA<OperationException>()),
    );
  });
}
