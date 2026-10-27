import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/features/documents/document_gateway.dart';
import 'package:recruitment_studio/shared/admission_budget.dart';
import 'package:recruitment_studio/shared/operation.dart';
import 'package:recruitment_studio/shared/work_limits.dart';
import 'package:recruitment_studio/shared/work_budget.dart';

import 'document_causal_fix01_test.dart' show SafState;

const pathFee = 512 + 4 * WorkLimits.stagingPathUnits;
Future<void> settle() => Future<void>.delayed(Duration.zero);

void main() {
  WorkBudget.shared(); // initialize process controller before delta observations
  for (final implicit in [false, true]) {
    test(
      'escaped File.path remains paid after physical drain implicit=$implicit',
      () async {
        final before = AdmissionBudget.shared.reservedBytes;
        final root = await Directory.systemTemp.createTemp('t08-path-payment-');
        final op = implicit ? null : Operation.create();
        final channel = SafState()..bytes = Uint8List.fromList([7, 8, 9]);
        final gateway = AndroidDocumentGateway(channel, stagingDirectory: root);
        String? path;
        try {
          final ref = (await gateway.pickOpen({'image/png'}, operation: op))!;
          // Only the scalar escapes this expression, never a retained File wrapper.
          path = (await gateway.stageRead(ref, 3, operation: op)).path;
          expect(await File(path).readAsBytes(), [7, 8, 9]);
          await gateway.close();
          await op?.finish();
          if (implicit) await File(path).delete();
          await settle();
          expect(channel.live, isFalse);
          expect(await root.list().toList(), isEmpty);
          expect(
            AdmissionBudget.shared.reservedBytes - before,
            8192 + pathFee,
            reason: 'per-capability scalar credit cannot pay a generated per-stage path',
          );
          expect(path, endsWith('.stage'));
        } finally {
          await gateway.close();
          await op?.finish();
          await root.delete(recursive: true);
        }
      },
    );
  }
  test('one capability pays 64 distinct staged scalar paths through operation finish', () async {
    final before = AdmissionBudget.shared.reservedBytes;
    final root = await Directory.systemTemp.createTemp('t08-64-paths-');
    final op = Operation.create();
    final channel = SafState()..bytes = Uint8List.fromList([1]);
    final gateway = AndroidDocumentGateway(channel, stagingDirectory: root);
    final paths = <String>[];
    try {
      final ref = (await gateway.pickOpen({'image/png'}, operation: op))!;
      await settle();
      final issued = AdmissionBudget.shared.reservedBytes;
      for (var i = 0; i < WorkLimits.stagingFiles; i++) {
        paths.add((await gateway.stageRead(ref, 1, operation: op)).path);
        await settle();
        expect(
          AdmissionBudget.shared.reservedBytes - issued,
          (i + 1) * (pathFee + pathFee),
          reason:
              'separate physical operation record and escaped scalar custody',
        );
      }
      expect(paths.toSet(), hasLength(64));
      expect(await root.list().toList(), hasLength(64));
      await gateway.close();
      await op.finish();
      await settle();
      expect(await root.list().toList(), isEmpty);
      expect(
        AdmissionBudget.shared.reservedBytes - before,
        8192 + 64 * pathFee,
      );
      expect(paths.every((p) => p.endsWith('.stage')), isTrue);
    } finally {
      await gateway.close();
      await op.finish();
      await root.delete(recursive: true);
    }
  });
}
