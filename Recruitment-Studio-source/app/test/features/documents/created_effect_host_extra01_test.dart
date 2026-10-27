import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/features/documents/document_gateway.dart';
import 'package:recruitment_studio/shared/admission_budget.dart';
import 'package:recruitment_studio/shared/operation.dart';
import 'package:recruitment_studio/shared/problem.dart';
import 'package:recruitment_studio/shared/work_limits.dart';

import 'document_causal_fix01_test.dart' show SafState;
import 'native_argument_owner_fix02_test.dart' show Heap;

// Real ordinary-host controls: actual libc pointers, Linux files, admission,
// WorkOperation and Linux gateway stage owners. No invented Win32 returns,
// native fault injection or Windows custody acceptance. These are independent
// positive conservation controls; causal RED lives in the SOURCE suite.
void main() {
  for (final closeRefused in [false, true]) {
    test(
      'EXTRA01 HOST lost argument-owner return keeps real created file paid closeRefused=$closeRefused',
      () async {
        final root = await Directory.systemTemp.createTemp('extra01-effect-');
        final file = File('${root.path}/owned');
        final gate = Completer<void>();
        final budget = AdmissionBudget.shared;
        final before = budget.reservedBytes;
        var cleanupStarted = false;
        final op = WorkOperation.create(
          deleteStaging: (owned) async {
            cleanupStarted = true;
            await gate.future;
            await owned.delete();
          },
        );
        RandomAccessFile? handle;
        AdmissionTicket? pressure;
        final heap = Heap()..failFree = 1;
        final arguments = heap.owner();
        File? returned;
        try {
          expect(() {
            returned = arguments.run(() {
              for (var i = 0; i < 5; i++) {
                arguments.allocate(48);
              }
              handle = file.openSync(mode: FileMode.write);
              op.ownStaging(
                file,
              ); // real owner captures effect before late free
              return file;
            });
          }, throwsA(same(heap.safeIo)));
          expect(returned, isNull);
          expect(file.existsSync(), isTrue);
          expect(heap.live, isEmpty);
          expect(heap.frees, hasLength(5));
          if (closeRefused) {
            // Language callback refusal BEFORE actual close, not a native fault.
            expect(
              () => throw const OperationException(ProblemCode.ioFailure),
              throwsA(isA<OperationException>()),
            );
            expect(handle, isNotNull);
            expect(file.existsSync(), isTrue);
          }
          handle!.closeSync();
          handle = null;
          expect(
            file.existsSync(),
            isTrue,
            reason: 'handle close is not file deletion',
          );
          expect(
            budget.reservedBytes,
            before + 4096 + 512 + 4 * WorkLimits.stagingPathUnits,
          );
          pressure = budget.reserve(
            budget.capacityBytes - budget.reservedBytes,
          );
          final finish = op.finish();
          expect(identical(op.finish(), finish), isTrue);
          await Future<void>.delayed(Duration.zero);
          expect(cleanupStarted, isTrue);
          expect(file.existsSync(), isTrue);
          expect(
            budget.reservedBytes,
            budget.capacityBytes,
            reason: 'prepaid cleanup owns the held effect at zero headroom',
          );
          gate.complete();
          await finish;
          expect(file.existsSync(), isFalse);
          pressure.release();
          pressure = null;
          expect(budget.reservedBytes, before);
        } finally {
          if (!gate.isCompleted) gate.complete();
          handle?.closeSync();
          pressure?.release();
          await op.finish();
          await root.delete(recursive: true);
        }
      },
    );
  }
  test('EXTRA01 HOST real gateway late publication refusal retains paid residual across close and operation drain', () async {
    final root = await Directory.systemTemp.createTemp('extra01-residual-');
    final budget = AdmissionBudget.shared;
    final worker = WorkerAdmission.acquire();
    final pressure = budget.reserve(4 * 1024 * 1024);
    final op = Operation.create();
    final native = SafState()..bytes = Uint8List.fromList([1]);
    final gateway = AndroidDocumentGateway(native, stagingDirectory: root);
    try {
      for (var i = 0; i < WorkLimits.stagingFiles; i++) {
        op.ownStaging(await File('${root.path}/owned-$i').writeAsBytes([0]));
      }
      final ref = (await gateway.pickOpen({'image/png'}, operation: op))!;
      final paidBefore = budget.reservedBytes;
      await expectLater(
        gateway.stageRead(ref, 1, operation: op),
        throwsA(
          isA<DocumentGatewayException>()
              .having(
                (e) => e.problem.code,
                'first cause',
                ProblemCode.capacityExceeded,
              )
              .having((e) => e.residualPlaceholder, 'honest residual', true),
        ),
      );
      final producerPrice = 64 * (512 + 4 * WorkLimits.stagingPathUnits);
      expect(
        budget.reservedBytes,
        greaterThanOrEqualTo(paidBefore + producerPrice),
      );
      final stages = (await root.list().toList())
          .whereType<File>()
          .where((f) => f.path.endsWith('.stage'))
          .toList();
      expect(stages, hasLength(1));
      expect(await stages.single.readAsBytes(), [1]);
      final close = gateway.close();
      await expectLater(close, throwsA(isA<DocumentGatewayException>()));
      expect(identical(gateway.close(), close), isTrue);
      await op.finish();
      final paidAfterDrain = budget.reservedBytes;
      expect(
        paidAfterDrain,
        greaterThanOrEqualTo(producerPrice + pressure.bytes),
      );
      await expectLater(
        gateway.close(),
        throwsA(isA<DocumentGatewayException>()),
      );
      expect(budget.reservedBytes, paidAfterDrain);
      expect(await stages.single.readAsBytes(), [1]);
    } finally {
      try {
        await gateway.close();
      } catch (_) {
        /* expected paid residual */
      }
      await op.finish();
      pressure.release();
      worker.release();
      // Test fixture retirement is not a product refund or Windows cleanup.
      await root.delete(recursive: true);
    }
  },
    // Linux linkat publication cannot be safely rolled back by pathname.
    skip: !Platform.isLinux,
  );
  test('EXTRA01 HOST precreate missing root has no effect and refunds producer under held pressure', () async {
    final root = await Directory.systemTemp.createTemp('extra01-no-create-');
    final missing = Directory('${root.path}/absent');
    final budget = AdmissionBudget.shared;
    final pressure = budget.reserve(4 * 1024 * 1024);
    final op = Operation.create();
    final native = SafState()..bytes = Uint8List.fromList([1]);
    final gateway = AndroidDocumentGateway(native, stagingDirectory: missing);
    try {
      final ref = (await gateway.pickOpen({'image/png'}, operation: op))!;
      await Future<void>.delayed(Duration.zero);
      final paidBefore = budget.reservedBytes;
      await expectLater(
        gateway.stageRead(ref, 1, operation: op),
        throwsA(isA<DocumentGatewayException>()),
      );
      await Future<void>.delayed(Duration.zero);
      expect(budget.reservedBytes, paidBefore);
      expect(await root.list().toList(), isEmpty);
      expect(native.methods, isNot(contains('beginRead')));
    } finally {
      await gateway.close();
      await op.finish();
      pressure.release();
      await root.delete(recursive: true);
    }
  });
}
