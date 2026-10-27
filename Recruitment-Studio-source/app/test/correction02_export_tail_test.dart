import 'dart:async';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/features/documents/document_gateway.dart';
import 'package:recruitment_studio/features/editor/editor_session.dart';
import 'package:recruitment_studio/runtime/product_runtime.dart';
import 'package:recruitment_studio/shared/admission_budget.dart';
import 'package:recruitment_studio/shared/operation.dart';
import 'package:recruitment_studio/shared/work_limits.dart';

import 'correction02_export_settlement_test.dart' show HeldReleaseChannel;
import 'correction02_admission_test.dart' show selection;
import 'support/project_fixtures.dart';

class WriteGateChannel extends HeldReleaseChannel {
  final writeEntered = Completer<void>(), writeRelease = Completer<void>();
  @override
  Future<Map<String, Object?>> invoke(
    String method,
    Map<String, Object?> args,
  ) async {
    if (method == 'beginWrite') {
      methods.add(method);
      roots.add(args['operationId'] as String);
      writeEntered.complete();
      await writeRelease.future;
      return {'status': 'ready', 'transferId': 'actual-held-write'};
    }
    return super.invoke(method, args);
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  for (final phase in ['approval-abort', 'write-cancel']) {
    test(
      'E10 $phase real held failed release settles independent capture without false native refund',
      () async {
        final root = await Directory.systemTemp.createTemp('e10-');
        final channel = WriteGateChannel();
        final runtime = await ProductRuntime.open(
          root,
          (stage, budget) => AndroidDocumentGateway(
            channel,
            stagingDirectory: stage,
            budget: budget,
          ),
        );
        final current = EditorSession.fromBundle(
          await fixtureBundle(),
          budget: runtime.budget,
        );
        await runtime.adoptSession(current);
        runtime.host!.preview.setPaused(true);
        await runtime.host!.preview.processingSettled;
        await runtime.scheduler!.checkpoint();
        final before = AdmissionBudget.shared.reservedBytes;
        final captures = <CapturedSnapshot>[];
        WorkOperation? actual;
        var settled = false;
        final exporting = runtime
            .exportSelected(
              selection,
              approveContent: (_) async => false,
              approveDestination: (last) async {
                actual = preparedOperationFor(
                  runtime.gateway,
                  last.destination!,
                )!.operation;
                return phase == 'write-cancel';
              },
            )
            .whenComplete(() => settled = true);
        try {
          if (phase == 'write-cancel') {
            await channel.writeEntered.future.timeout(
              const Duration(seconds: 5),
            );
            expect(runtime.budget.reservedBytes, greaterThan(512 * 1024));
            runtime.cancel();
            expect(actual!.isCancelled, isTrue);
            expect(
              actual!.isFinishing,
              isTrue,
              reason: 'The owning export stop must join its real root before a busy native failed tail settles',
            );
            channel.writeRelease.complete();
          }
          await channel.entered.future.timeout(const Duration(seconds: 5));
          await Future<void>.delayed(const Duration(milliseconds: 30));
          expect(settled, isFalse);
          expect(current.isDisposed, isFalse);
          channel.release.complete();
          await exporting.timeout(const Duration(seconds: 5));
          expect(runtime.message, contains('residual'));
          expect(runtime.message, contains('limpeza não confirmada'));
          if (phase == 'approval-abort') {
            expect(runtime.message, contains('Destino não aprovado'));
            expect(channel.methods, isNot(contains('beginWrite')));
          } else {
            expect(runtime.message, contains('confirmados:'));
            expect(channel.methods, contains('beginWrite'));
            expect(channel.methods, isNot(contains('writePrepared')));
          }
          expect(runtime.canCancel, isFalse);
          expect(
            AdmissionBudget.shared.reservedBytes,
            greaterThanOrEqualTo(before + 32768),
          );
          runtime.host!.preview.setPaused(true);
          await runtime.host!.preview.processingSettled;
          for (var i = 0; i < WorkLimits.capturedSnapshots; i++) {
            captures.add(current.captureSnapshot());
          }
          for (final capture in captures) {
            capture.release();
          }
          captures.clear();
          expect(channel.roots.toSet().length, 1);
        } finally {
          channel.fail = false;
          if (!channel.writeRelease.isCompleted) {
            channel.writeRelease.complete();
          }
          if (!channel.release.isCompleted) channel.release.complete();
          for (final capture in captures) {
            capture.release();
          }
          // A baseline assertion failure still retires the real native key; this
          // is cleanup, not the expected success path or a synthetic completion.
          if (!settled) {
            await runtime.gateway.close().timeout(const Duration(seconds: 5));
          }
          await exporting.timeout(const Duration(seconds: 5));
          await runtime.close().timeout(const Duration(seconds: 5));
          runtime.dispose();
          await root.delete(recursive: true);
        }
        expect(runtime.budget.reservedBytes, 0);
        expect(
          AdmissionBudget.shared.reservedBytes,
          lessThan(before - 2 * 1024 * 1024),
        );
      },
    );
  }
}
