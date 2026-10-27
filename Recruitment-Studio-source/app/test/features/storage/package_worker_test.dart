import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/features/storage/package_worker.dart';
import 'package:recruitment_studio/features/storage/package_zip_io.dart';
import 'package:recruitment_studio/shared/operation.dart';
import 'package:recruitment_studio/shared/work_budget.dart';
import 'package:recruitment_studio/shared/problem.dart';

import 'package_test_fixtures.dart';

void main() {
  late Directory sandbox;
  late WorkBudgetController budget;
  setUp(() {
    sandbox = Directory.systemTemp.createTempSync('t06-worker-');
    budget = WorkBudgetController();
  });
  tearDown(() {
    sandbox.deleteSync(recursive: true);
    expect(budget.reservedBytes, 0);
  });
  for (final raw in [
    <int>[],
    [1, 2, 3, 4],
    List<int>.filled(100000, 65),
    List<int>.generate(65536, (i) => i % 256),
  ]) {
    for (final level in [0, 1, 6, 9]) {
      test('bounded RFC1951 control ${raw.length} level $level', () {
        final compressed = Uint8List.fromList(
          ZLibCodec(raw: true, level: level).encode(raw),
        );
        expect(expandDeflate(compressed, raw.length), raw);
        expect(
          () => expandDeflate(
            Uint8List.fromList([...compressed, 0, 1]),
            raw.length,
          ),
          throwsA(isA<FormatException>()),
        );
        expect(
          () => expandDeflate(
            Uint8List.sublistView(compressed, 0, compressed.length - 1),
            raw.length,
          ),
          throwsA(isA<FormatException>()),
        );
        if (raw.isNotEmpty) {
          expect(
            () => expandDeflate(compressed, raw.length - 1),
            throwsA(isA<CapacityExceeded>()),
          );
        }
      });
    }
  }
  for (final malformed in [
    [7],
    [1, 0, 0, 0, 0],
    [3],
    [255, 255, 255],
  ]) {
    test('invalid DEFLATE structural ${malformed.join('-')}', () {
      expect(
        () => expandDeflate(Uint8List.fromList(malformed), 1),
        throwsA(isA<FormatException>()),
      );
    });
  }
  test(
    'worker refuses uncharged expansion before allocating or spawning',
    () async {
      final file = await writePackage(
        sandbox,
        packageZip({'manifest.json': jsonBytes('{}')}),
      );
      final op = WorkOperation.create(),
          lease = await budget.acquire(op, 0),
          phases = <String>[];
      final index = await PackageZipIO.readIndex(file, operation: op);
      await expectLater(
        PackageWorker(onPhase: phases.add).readEntry(
          file,
          index.entries['manifest.json']!,
          operation: op,
          lease: lease,
        ),
        throwsA(isA<CapacityExceeded>()),
      );
      lease.release();
      await op.finish();
      expect(phases, isEmpty);
    },
  );
  for (final phase in ['read', 'expansion']) {
    test(
      'cancel real worker during $phase waits drain before FIFO admission',
      () async {
        final file = await writePackage(
          sandbox,
          packageZip({'manifest.json': jsonBytes(' ' * 100000)}, deflate: true),
        );
        final op = WorkOperation.create(), next = WorkOperation.create();
        final lease = await budget.acquire(op, 2 * 1024 * 1024);
        final index = await PackageZipIO.readIndex(file, operation: op);
        final phases = <String>[];
        final worker = PackageWorker(
          holdAt: phase,
          onPhase: (p) {
            phases.add(p);
            if (p == phase) {
              op.cancel();
            }
          },
        );
        final future = worker.readEntry(
          file,
          index.entries['manifest.json']!,
          operation: op,
          lease: lease,
        );
        final queued = budget.acquire(next, 1);
        await expectLater(future, throwsA(isA<OperationException>()));
        lease.release();
        await op.finish();
        final admitted = await queued;
        expect(phases.indexOf('exited'), greaterThan(phases.indexOf(phase)));
        expect(phases.last, 'drained');
        admitted.release();
        await next.finish();
        expect(file.existsSync(), true);
      },
    );
  }
  test(
    'worker timeout kills isolate and drains without main-thread blocking',
    () async {
      final file = await writePackage(
        sandbox,
        packageZip({'manifest.json': jsonBytes('{}')}, deflate: true),
      );
      final op = WorkOperation.create(),
          lease = await budget.acquire(op, 1024 * 1024);
      final index = await PackageZipIO.readIndex(file, operation: op),
          phases = <String>[];
      final worker = PackageWorker(
        holdAt: 'expansion',
        timeout: const Duration(milliseconds: 100),
        onPhase: phases.add,
      );
      await expectLater(
        worker.readEntry(
          file,
          index.entries['manifest.json']!,
          operation: op,
          lease: lease,
        ),
        throwsA(isA<PackageFailure>()),
      );
      expect(
        phases,
        containsAllInOrder(['expansion', 'killRequested', 'exited', 'drained']),
      );
      lease.release();
      await op.finish();
    },
  );
  test('foreign and released lease refused before worker spawn', () async {
    final file = await writePackage(
      sandbox,
      packageZip({'manifest.json': jsonBytes('{}')}),
    );
    final op = WorkOperation.create(), foreign = WorkOperation.create();
    final lease = await budget.acquire(op, 1024 * 1024),
        index = await PackageZipIO.readIndex(file, operation: op),
        phases = <String>[];
    final worker = PackageWorker(onPhase: phases.add);
    await expectLater(
      worker.readEntry(
        file,
        index.entries['manifest.json']!,
        operation: foreign,
        lease: lease,
      ),
      throwsArgumentError,
    );
    lease.release();
    await expectLater(
      worker.readEntry(
        file,
        index.entries['manifest.json']!,
        operation: op,
        lease: lease,
      ),
      throwsStateError,
    );
    expect(phases, isEmpty);
    await op.finish();
    await foreign.finish();
  });
  test(
    'package read handle closes before expansion and before drain on cancel',
    () async {
      final file = await writePackage(
        sandbox,
        packageZip({'manifest.json': jsonBytes('abc')}, deflate: true),
      );
      for (final cancel in [false, true]) {
        final op = WorkOperation.create();
        final ownLease = await budget.acquire(op, 1024 * 1024);
        final index = await PackageZipIO.readIndex(file, operation: op),
            phases = <String>[];
        final worker = PackageWorker(
          onPhase: (p) {
            phases.add(p);
            if (cancel && p == 'read') {
              op.cancel();
            }
          },
        );
        final task = worker.readEntry(
          file,
          index.entries['manifest.json']!,
          operation: op,
          lease: ownLease,
        );
        if (cancel) {
          await expectLater(task, throwsA(isA<OperationException>()));
        } else {
          expect(await task, jsonBytes('abc'));
        }
        ownLease.release();
        await op.finish();
        expect(phases, contains('inputClosed'));
        expect(
          phases.indexOf('inputClosed'),
          lessThan(phases.indexOf('drained')),
        );
        if (!cancel) {
          expect(
            phases.indexOf('inputClosed'),
            lessThan(phases.indexOf('expansion')),
          );
        }
      }
    },
  );
}
