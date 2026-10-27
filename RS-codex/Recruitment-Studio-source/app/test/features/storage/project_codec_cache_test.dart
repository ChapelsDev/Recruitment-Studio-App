import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/features/projects/project.dart';
import 'package:recruitment_studio/features/projects/project_bundle.dart';
import 'package:recruitment_studio/features/storage/package_preflight.dart';
import 'package:recruitment_studio/features/storage/project_codec.dart';
import 'package:recruitment_studio/shared/operation.dart';
import 'package:recruitment_studio/shared/problem.dart';
import 'package:recruitment_studio/shared/work_budget.dart';

import '../media/media_test_fixtures.dart';
import 'package_test_fixtures.dart';

void main() {
  late Directory sandbox;
  late WorkBudgetController budget;
  late List<String> phases;
  var sequence = 0;

  setUp(() {
    sandbox = Directory.systemTemp.createTempSync('t06-finite-cache-');
    budget = WorkBudgetController();
    phases = [];
    sequence = 0;
  });
  tearDown(() {
    expect(budget.reservedBytes, 0);
    expect(budget.queuedCount, 0);
    sandbox.deleteSync(recursive: true);
  });

  File freshOutput() =>
      File('${sandbox.path}/output-${sequence++}.recruitproj');

  void expectWork(int digest, int media) {
    expect(phases.where((p) => p == 'digest').length, digest);
    expect(phases.where((p) => p == 'mediaAdmission').length, media);
  }

  Future<void> expectUsableSlot() async {
    expect(budget.reservedBytes, 0);
    expect(budget.queuedCount, 0);
    final op = WorkOperation.create();
    try {
      final lease = await budget.acquire(op, 0);
      lease.release();
    } finally {
      await op.finish();
    }
    expect(budget.reservedBytes, 0);
  }

  Future<void> verifyOutput(File file, ProjectBundle expected) async {
    final index = await PackagePreflight(budget: budget).inspect(file);
    expect(index.project.toManifest(), expected.project.toManifest());
    for (final ref in [expected.project.photo, expected.project.logo]) {
      if (ref != null) {
        expect(
          index.resources[ref.id],
          orderedEquals(expected.resources[ref.id]!),
        );
        expect(index.entries.containsKey(assetPath(ref)), true);
      }
    }
  }

  Future<void> waitQueue(int expected) async {
    final deadline = DateTime.now().add(const Duration(seconds: 10));
    while (budget.queuedCount < expected && DateTime.now().isBefore(deadline)) {
      await Future<void>.delayed(const Duration(milliseconds: 1));
    }
    expect(budget.queuedCount, expected);
  }

  test(
    'FC-01 old live role identities are evicted without relying on GC',
    () async {
      final pairs = [
        await fixtureBundle(),
        await fixtureBundle(),
        await fixtureBundle(),
      ];
      final held = [for (final pair in pairs) ...pair.resources.values];
      for (final pair in pairs) {
        expect(pair.project.photo!.kind, AssetKind.photo);
        expect(pair.project.logo!.kind, AssetKind.logo);
        expect(pair.project.photo!.id, isNot(pair.project.logo!.id));
      }
      for (var i = 0; i < pairs.length; i++) {
        for (var j = i + 1; j < pairs.length; j++) {
          expect(
            identical(pairs[i].resources['photo'], pairs[j].resources['photo']),
            false,
          );
          expect(
            identical(pairs[i].resources['logo'], pairs[j].resources['logo']),
            false,
          );
        }
      }
      final codec = ZipProjectCodec(budget: budget, onPhase: phases.add);
      for (final pair in pairs) {
        phases.clear();
        await codec.encode(pair, freshOutput());
        expectWork(2, 2);
      }
      final warmCurrent = pairs.last.withProject(
        pairs.last.project.withName('warm current'),
      );
      phases.clear();
      await codec.encode(warmCurrent, freshOutput());
      expectWork(0, 0);

      final revisited = freshOutput();
      phases.clear();
      await codec.encode(pairs.first, revisited);
      // Sole intended RED: the old Expando remembers all still-live identities.
      expectWork(2, 2);

      final warmReturned = pairs.first.withProject(
        pairs.first.project.withName('warm returned'),
      );
      phases.clear();
      await codec.encode(warmReturned, freshOutput());
      expectWork(0, 0);
      await verifyOutput(revisited, pairs.first);
      expect(held.length, 6);
      for (var i = 0; i < pairs.length; i++) {
        expect(held[i * 2], same(pairs[i].resources['photo']));
        expect(held[i * 2 + 1], same(pairs[i].resources['logo']));
      }
      await expectUsableSlot();
    },
  );

  test(
    'FC-02 copied decoded candidate seeds consecutive text-only warmth',
    () async {
      final source = await fixtureBundle();
      final input = await writePackage(
        sandbox,
        packageZip(packagePayload(source)),
      );
      final codec = ZipProjectCodec(budget: budget, onPhase: phases.add);
      final decoded = await codec.decode(input);
      expect(decoded.project.toManifest(), source.project.toManifest());
      for (final id in ['photo', 'logo']) {
        expect(decoded.resources[id], orderedEquals(source.resources[id]!));
        expect(identical(decoded.resources[id], source.resources[id]), false);
      }
      for (var i = 0; i < 2; i++) {
        final edit = decoded.withProject(
          decoded.project.withName('decoded edit $i'),
        );
        final output = freshOutput();
        phases.clear();
        await codec.encode(edit, output);
        expectWork(0, 0);
        await verifyOutput(output, edit);
      }
      await expectUsableSlot();
    },
  );

  test('FC-03 identity and metadata both remain necessary for reuse', () async {
    final original = await fixtureBundle();
    final codec = ZipProjectCodec(budget: budget, onPhase: phases.add);
    await codec.encode(original, freshOutput());
    final ref = original.project.photo!;
    final wrong = [
      AssetRef(
        id: ref.id,
        kind: ref.kind,
        mediaType: ref.mediaType,
        width: ref.width + 1,
        height: ref.height,
        sha256: ref.sha256,
      ),
      AssetRef(
        id: ref.id,
        kind: ref.kind,
        mediaType: MediaType.jpeg,
        width: ref.width,
        height: ref.height,
        sha256: ref.sha256,
      ),
    ];
    for (final changed in wrong) {
      final invalid = original.withProject(original.project.withPhoto(changed));
      expect(invalid.resources[ref.id], same(original.resources[ref.id]));
      final output = freshOutput();
      phases.clear();
      await expectLater(
        codec.encode(invalid, output),
        throwsA(
          isA<OperationException>().having(
            (e) => e.code,
            'code',
            ProblemCode.invalidResource,
          ),
        ),
      );
      expectWork(1, 0);
      expect(output.existsSync(), false);
    }
    final copied = ProjectBundle(original.project, original.resources);
    for (final id in ['photo', 'logo']) {
      expect(copied.resources[id], orderedEquals(original.resources[id]!));
      expect(identical(copied.resources[id], original.resources[id]), false);
    }
    phases.clear();
    final output = freshOutput();
    await codec.encode(copied, output);
    expectWork(2, 2);
    await verifyOutput(output, copied);
    await expectUsableSlot();
  });

  test(
    'FC-04 queued encode retains detached proof across decode eviction',
    () async {
      final original = await fixtureBundle();
      final other = await fixtureBundle();
      final input = await writePackage(
        sandbox,
        packageZip(packagePayload(other)),
      );
      final codec = ZipProjectCodec(budget: budget, onPhase: phases.add);
      await codec.encode(original, freshOutput());
      final png = realPng(width: 5);
      final entry = ResourceEntry(
        ref: packageRef(png, AssetKind.logo, width: 5),
        bytes: png,
      );
      final outer = original.withResource(
        entry,
        project: original.project.withLogo(entry.ref),
      );
      expect(outer.resources['photo'], same(original.resources['photo']));
      expect(
        identical(outer.resources['logo'], original.resources['logo']),
        false,
      );

      final blocker = WorkOperation.create();
      final decodeOp = WorkOperation.create();
      final encodeOp = WorkOperation.create();
      final lease = await budget.acquire(blocker, 0);
      Future<void>? decodeDone;
      Future<void>? encodeDone;
      Object? decodeError;
      Object? encodeError;
      ProjectBundle? decoded;
      final output = freshOutput();
      phases.clear();
      try {
        decodeDone = codec
            .decode(input, operation: decodeOp)
            .then<void>(
              (value) {
                decoded = value;
              },
              onError: (Object error, StackTrace stack) {
                decodeError = error;
              },
            );
        await waitQueue(1);
        encodeDone = codec
            .encode(outer, output, operation: encodeOp)
            .then<void>(
              (_) {},
              onError: (Object error, StackTrace stack) {
                encodeError = error;
              },
            );
        await waitQueue(2);
        lease.release();
        await blocker.finish();
        await Future.wait([decodeDone, encodeDone]);
        expect(decodeError, isNull);
        expect(encodeError, isNull);
        expect(decoded, isNotNull);
        expect(decodeOp.isFinishing, false);
        expect(encodeOp.isFinishing, false);
        expect(phases.where((p) => p == 'beforePublication').length, 1);
        expectWork(1, 1);
      } finally {
        decodeOp.cancel();
        encodeOp.cancel();
        lease.release();
        await blocker.finish();
        await Future.wait<void>([?decodeDone, ?encodeDone]);
        await decodeOp.finish();
        await encodeOp.finish();
      }
      await verifyOutput(output, outer);
      await expectUsableSlot();
    },
  );

  test('FC-05 failed authentication stays cold and failed output keeps valid proof', () async {
    final original = await fixtureBundle();
    final fault = StateError('synthetic cache phase fault');
    String? failPhase = 'digest';
    final codec = ZipProjectCodec(
      budget: budget,
      onPhase: (phase) {
        phases.add(phase);
        if (phase == failPhase) {
          failPhase = null;
          throw fault;
        }
      },
    );
    final failed = freshOutput();
    await expectLater(codec.encode(original, failed), throwsA(same(fault)));
    expectWork(1, 0);
    expect(failed.existsSync(), false);
    await expectUsableSlot();

    phases.clear();
    await codec.encode(original, freshOutput());
    expectWork(2, 2);
    phases.clear();
    failPhase = 'outputClosed';
    final failedOutput = freshOutput();
    await expectLater(
      codec.encode(original, failedOutput),
      throwsA(same(fault)),
    );
    expectWork(0, 0);
    expect(phases.where((p) => p == 'outputClosed').length, 1);
    expect(phases.where((p) => p == 'outputDiscarded').length, 1);
    expect(failedOutput.existsSync(), false);
    await expectUsableSlot();

    phases.clear();
    final output = freshOutput();
    await codec.encode(original, output);
    expectWork(0, 0);
    await verifyOutput(output, original);
    await expectUsableSlot();
  });
}
