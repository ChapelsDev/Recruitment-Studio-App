import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/features/documents/document_gateway.dart';
import 'package:recruitment_studio/shared/admission_budget.dart';
import 'package:recruitment_studio/shared/operation.dart';
import 'package:recruitment_studio/shared/problem.dart';
import 'package:recruitment_studio/shared/work_budget.dart';
import 'package:recruitment_studio/shared/work_limits.dart';

import 'document_causal_fix01_test.dart' show SafState;

const fee = 512 + 4 * WorkLimits.stagingPathUnits;
Future<void> settle() => Future<void>.delayed(Duration.zero);
void main() {
  WorkBudget.shared();
  for (final implicit in [false, true]) {
    test(
      'ordinary per-path payment refusal precedes producer effects implicit=$implicit',
      () async {
        final root = await Directory.systemTemp.createTemp('t08-path-refusal-');
        final op = implicit ? null : Operation.create();
        final channel = SafState()..bytes = Uint8List.fromList([3]);
        final gateway = AndroidDocumentGateway(channel, stagingDirectory: root);
        AdmissionTicket? pressure;
        try {
          final ref = (await gateway.pickOpen({'image/png'}, operation: op))!;
          await settle();
          final budget = AdmissionBudget.shared;
          // Existing call/pending/producer prices fit; only the per-path ticket is
          // one byte short. This is admission pressure, not physical RAM pressure.
          pressure = budget.reserve(
            budget.capacityBytes -
                budget.reservedBytes -
                256 * 1024 -
                (implicit ? 0 : 1024) -
                64 * fee -
                fee +
                1,
          );
          await expectLater(
            gateway.stageRead(ref, 1, operation: op),
            throwsA(isA<CapacityExceeded>()),
          );
          expect(channel.methods, isNot(contains('beginRead')));
          expect(await root.list().toList(), isEmpty);
          if (implicit) expect(channel.live, isFalse);
        } finally {
          pressure?.release();
          await gateway.close();
          await op?.finish();
          await root.delete(recursive: true);
        }
      },
    );
  }
  test(
    'unpublished failed copy refunds scalar and producer payment independently',
    () async {
      final root = await Directory.systemTemp.createTemp('t08-path-rollback-');
      final op = Operation.create();
      final channel = SafState()..bytes = Uint8List.fromList([3]);
      final gateway = AndroidDocumentGateway(channel, stagingDirectory: root);
      try {
        final ref = (await gateway.pickOpen({'image/png'}, operation: op))!;
        await settle();
        final before = AdmissionBudget.shared.reservedBytes;
        await expectLater(
          gateway.stageRead(ref, 0, operation: op),
          throwsA(isA<CapacityExceeded>()),
        );
        await settle();
        expect(await root.list().toList(), isEmpty);
        expect(AdmissionBudget.shared.reservedBytes, before);
        expect(channel.methods, contains('endRead'));
      } finally {
        await gateway.close();
        await op.finish();
        await root.delete(recursive: true);
      }
    },
  );
  test(
    'separate operations retain distinct scalar fees after complete drains',
    () async {
      final before = AdmissionBudget.shared.reservedBytes;
      final root = await Directory.systemTemp.createTemp('t08-multiple-ops-');
      final paths = <String>[];
      try {
        for (var i = 0; i < 3; i++) {
          final op = Operation.create();
          final gateway = AndroidDocumentGateway(
            SafState()..bytes = Uint8List.fromList([i]),
            stagingDirectory: root,
          );
          try {
            final ref = (await gateway.pickOpen({'image/png'}, operation: op))!;
            paths.add((await gateway.stageRead(ref, 1, operation: op)).path);
            await gateway.close();
            await op.finish();
            await settle();
            expect(
              AdmissionBudget.shared.reservedBytes - before,
              (i + 1) * (8192 + fee),
            );
          } finally {
            await gateway.close();
            await op.finish();
          }
        }
        expect(paths.toSet(), hasLength(3));
        expect(await root.list().toList(), isEmpty);
      } finally {
        await root.delete(recursive: true);
      }
    },
  );
  for (final boundary in ['pathUnits', 'ancestors']) {
    test(
      'real Linux maximum legal $boundary staging retains paid scalar',
      () async {
        final base = await Directory.systemTemp.createTemp(
          't08-path-boundary-',
        );
        var path = base.path;
        if (boundary == 'pathUnits') {
          final target = WorkLimits.stagingPathUnits - 64;
          while (path.length < target) {
            final remaining = target - path.length;
            // Avoid a one-unit remainder (slash alone) by shortening this component.
            var n = (remaining - 1).clamp(1, 220);
            if (remaining - n - 1 == 1) n--;
            path += '/${'a' * n}';
          }
          expect(path.length, target);
        } else {
          while (path.split('/').where((s) => s.isNotEmpty).length < 63) {
            path += '/a';
          }
          expect(path.split('/').where((s) => s.isNotEmpty), hasLength(63));
        }
        final root = await Directory(path).create(recursive: true);
        final op = Operation.create();
        final channel = SafState()..bytes = Uint8List.fromList([4, 5]);
        final gateway = AndroidDocumentGateway(channel, stagingDirectory: root);
        final before = AdmissionBudget.shared.reservedBytes;
        try {
          final ref = (await gateway.pickOpen({'image/png'}, operation: op))!;
          final scalar = (await gateway.stageRead(ref, 2, operation: op)).path;
          expect(scalar.length, lessThanOrEqualTo(WorkLimits.stagingPathUnits));
          expect(await File(scalar).readAsBytes(), [4, 5]);
          await gateway.close();
          await op.finish();
          await settle();
          expect(await root.list().toList(), isEmpty);
          // before includes the newly created gateway+operation, both now drained.
          expect(
            AdmissionBudget.shared.reservedBytes - before,
            8192 + fee - 8192,
          );
          expect(scalar, startsWith(root.path));
        } finally {
          await gateway.close();
          await op.finish();
          await base.delete(recursive: true);
        }
      },
      // Slash-counted ancestry and long-path enumeration are Linux witnesses.
      skip: !Platform.isLinux,
    );
  }
  test('overlong Linux staging root refuses before copy and refunds unpublished tickets', () async {
    final base = await Directory.systemTemp.createTemp('t08-over-path-');
    final op = Operation.create();
    final channel = SafState()..bytes = Uint8List.fromList([2]);
    final gateway = AndroidDocumentGateway(
      channel,
      stagingDirectory: Directory('${base.path}/${'a' * 4096}'),
    );
    try {
      final ref = (await gateway.pickOpen({'image/png'}, operation: op))!;
      await settle();
      final before = AdmissionBudget.shared.reservedBytes;
      await expectLater(
        gateway.stageRead(ref, 1, operation: op),
        throwsA(isA<CapacityExceeded>()),
      );
      await settle();
      expect(channel.methods, isNot(contains('beginRead')));
      expect(await base.list().toList(), isEmpty);
      expect(AdmissionBudget.shared.reservedBytes, before);
    } finally {
      await gateway.close();
      await op.finish();
      await base.delete(recursive: true);
    }
  });
}
