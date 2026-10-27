// Preparação specification-first; sem RED/GREEN observado.
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/features/storage/package_working_set.dart';
import 'package:recruitment_studio/features/storage/package_zip_io.dart';
import 'package:recruitment_studio/features/storage/package_worker.dart';
import 'package:recruitment_studio/shared/operation.dart';
import 'package:recruitment_studio/shared/work_budget.dart';
import 'package:recruitment_studio/shared/work_limits.dart';
import 'package:recruitment_studio/shared/problem.dart';
import 'package:recruitment_studio/shared/admission_budget.dart';

PackageZipEntry entry(String name, int expanded, int compressed,
    {int method = 8}) => PackageZipEntry(name: name, offset: 0,
      expandedSize: expanded, compressedSize: compressed, method: method,
      crc32: 0);

void main() {
  late Directory sandbox;
  setUp(() { sandbox = Directory.systemTemp.createTempSync('t06-accounting-owned-'); });
  tearDown(() { sandbox.deleteSync(recursive: true); });
  test('reserva conservadora não afirma uma terceira backing materialize', () {
    final e = entry('manifest.json', 100, 50);
    expect(PackageWorkingSet.entryReservation(e), 400);
    expect(PackageWorkingSet.workerBackingUpperBound(e), 300);
  });
  test('limites por nome inclusivos e primeiro byte excedente', () {
    final names = <String, int>{
      'manifest.json': WorkLimits.manifestUtf8Bytes,
      'thumbnail.png': WorkLimits.thumbnailBytes,
      'assets/${'a' * 64}.png': WorkLimits.photoBytes,
    };
    for (final pair in names.entries) {
      expect(() => PackageWorkingSet.entryReservation(
          entry(pair.key, pair.value, 1)), returnsNormally);
      expect(() => PackageWorkingSet.entryReservation(
          entry(pair.key, pair.value + 1, 1)),
          throwsA(isA<CapacityExceeded>()));
    }
  });
  test('nomes inválidos não são normalizados nem reparados', () {
    for (final name in ['../manifest.json', 'MANIFEST.JSON', 'assets/x.png']) {
      expect(() => PackageWorkingSet.entryReservation(entry(name, 1, 1)),
          throwsA(isA<PackageFailure>()));
    }
  });
  test('STORE divergente e dimensões negativas são recusados', () {
    expect(() => PackageWorkingSet.entryReservation(
        entry('manifest.json', 2, 1, method: 0)),
        throwsA(isA<PackageFailure>()));
    expect(() => PackageWorkingSet.entryReservation(
        entry('manifest.json', -1, 1)), throwsA(isA<CapacityExceeded>()));
    expect(() => PackageWorkingSet.entryReservation(
        entry('manifest.json', 1, -1)), throwsA(isA<CapacityExceeded>()));
  });
  test('reserva index e lease coexistem com buffers retidos', () async {
    final budget = WorkBudgetController();
    final op = WorkOperation.create();
    final retained = budget.reserve(op, 10);
    final index = AdmissionBudget.shared.reserve(PackageWorkingSet.metadataEnvelope);
    final e = entry('manifest.json', 100, 50);
    final lease = await budget.acquire(op,
        PackageWorkingSet.inspectionReservation(ZipContainer(
            {'manifest.json': e}, 100, 50)));
    expect(budget.reservedBytes,
        10 + 400);
    lease.release(); index.release(); retained.release();
    await op.finish();
    expect(budget.reservedBytes, 0);
  });
  test('metadata ordinária não reduz o cap de buffers próprios', () async {
    final budget = WorkBudgetController();
    final op = WorkOperation.create();
    final index = AdmissionBudget.shared.reserve(PackageWorkingSet.metadataEnvelope);
    try {
      final lease = await budget.acquire(op, WorkLimits.ownedBufferBytes);
      expect(budget.reservedBytes, WorkLimits.ownedBufferBytes);
      lease.release();
    } finally { index.release(); await op.finish(); }
    expect(budget.reservedBytes, 0);
  });
  test('container fabricado com total divergente é recusado', () {
    final e = entry('manifest.json', 100, 50);
    expect(() => PackageWorkingSet.inspectionReservation(
        ZipContainer({'manifest.json': e}, 101, 50)),
        throwsA(isA<PackageFailure>()));
  });
  test('worker direto recusa entrada acima do cap por nome antes de IO', () async {
    final budget = WorkBudgetController();
    final op = WorkOperation.create();
    final lease = await budget.acquire(op, 8 * 1024 * 1024);
    final phases = <String>[];
    await expectLater(PackageWorker(onPhase: phases.add).readEntry(
        File('${sandbox.path}/never-created'),
        entry('manifest.json', WorkLimits.manifestUtf8Bytes + 1, 1),
        operation: op, lease: lease), throwsA(isA<CapacityExceeded>()));
    expect(phases, isEmpty);
    lease.release(); await op.finish();
  });
}
