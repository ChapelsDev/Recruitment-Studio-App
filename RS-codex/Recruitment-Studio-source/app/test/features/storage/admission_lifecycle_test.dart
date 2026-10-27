// Candidate-only real worker/media lifecycle controls; inert until approval.
import 'dart:async';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/shared/operation.dart';
import 'package:recruitment_studio/shared/work_budget.dart';
import 'package:recruitment_studio/shared/problem.dart';
import 'package:recruitment_studio/features/storage/package_worker.dart';
import 'package:recruitment_studio/features/storage/package_zip_io.dart';
import 'package:recruitment_studio/features/media/resource_service.dart';
import 'package:recruitment_studio/features/media/media_worker.dart';
import 'package:recruitment_studio/features/projects/project.dart';
import 'package:recruitment_studio/features/projects/project_bundle.dart';
import '../media/media_test_fixtures.dart';
import 'package_test_fixtures.dart';

void main() {
  late Directory sandbox;
  setUp(() { sandbox = Directory.systemTemp.createTempSync('t06-lifecycle-owned-'); });
  tearDown(() { sandbox.deleteSync(recursive: true); });
  test('worker setup admission failure drains registry and allows real next work', () async {
    final budget = WorkBudgetController();
    final op = WorkOperation.create();
    final lease = await budget.acquire(op, 2 * 1024 * 1024);
    final file = await writePackage(sandbox, packageZip({'manifest.json': jsonBytes('{}')}));
    final index = await PackageZipIO.readIndex(file, operation: op);
    final barrier = Completer<void>();
    for (var i = 0; i < 64; i++) { op.registerPending(barrier.future); }
    try {
      await expectLater(PackageWorker().readEntry(file, index.entries['manifest.json']!,
          operation: op, lease: lease), throwsA(isA<CapacityExceeded>()));
      expect(budget.reservedBytes, 2 * 1024 * 1024);
      barrier.complete();
      await Future<void>.delayed(Duration.zero);
      expect(await PackageWorker().readEntry(file, index.entries['manifest.json']!,
          operation: op, lease: lease), jsonBytes('{}'));
    } finally {
      if (!barrier.isCompleted) { barrier.complete(); }
      lease.release(); await op.finish();
    }
    expect(budget.reservedBytes, 0);
    expect(file.existsSync(), isTrue);
  });
  test('real retained media capacity inclusive and deterministic release recovery', () async {
    final budget = WorkBudgetController();
    final service = ResourceService(budget: budget);
    final entries = <ResourceEntry>[];
    try {
      for (var i = 0; i < 32; i++) {
        entries.add(await service.importImage(realPng(), AssetKind.photo));
      }
      final retained = budget.reservedBytes;
      await expectLater(service.importImage(realPng(), AssetKind.photo),
          throwsA(isA<CapacityExceeded>()));
      expect(budget.reservedBytes, retained);
      await service.release(entries.removeLast());
      entries.add(await service.importImage(realPng(), AssetKind.photo));
      expect(service.previewFor(entries.last), isNotEmpty);
    } finally {
      for (final entry in entries) { await service.release(entry); }
    }
    expect(budget.reservedBytes, 0);
  });
  test('real import observer failure drains actual worker and permits recovery', () async {
    final budget = WorkBudgetController();
    final worker = MediaWorker(onPhase: (phase) {
      // Injecting an observer failure exercises real killed/drained worker work;
      // the observer cannot manufacture a result or replace codecs.
      if (phase == 'result') { throw StateError('synthetic admission fault'); }
    });
    final service = ResourceService(budget: budget, worker: worker);
    await expectLater(service.importImage(realPng(), AssetKind.photo), throwsA(anything));
    expect(budget.reservedBytes, 0);
    final recovery = ResourceService(budget: budget);
    final entry = await recovery.importImage(realPng(), AssetKind.photo);
    await recovery.release(entry);
    expect(budget.reservedBytes, 0);
  });

}
