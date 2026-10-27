import 'dart:async';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/features/documents/document_gateway.dart';
import 'package:recruitment_studio/features/editor/editor_session.dart';
import 'package:recruitment_studio/features/editor/preview_owner.dart';
import 'package:recruitment_studio/runtime/product_runtime.dart';
import 'package:recruitment_studio/shared/admission_budget.dart';
import 'package:recruitment_studio/shared/problem.dart';
import 'package:recruitment_studio/shared/work_limits.dart';

import 'correction02_admission_test.dart' show selection;
import 'support/project_fixtures.dart';

class HeldReleaseChannel implements DocumentChannel {
  final entered = Completer<void>(), release = Completer<void>();
  final methods = <String>[];
  final roots = <String>[];
  bool fail = true;
  @override
  Future<Map<String, Object?>> invoke(
    String method,
    Map<String, Object?> args,
  ) async {
    methods.add(method);
    roots.add(args['operationId'] as String);
    switch (method) {
      case 'prepareSave':
        return {
          'status': 'prepared',
          'operationId': args['operationId'],
          'opaqueId': 'held-real-destination',
          'displayName': 'held.png',
          'canReadBack': true,
          'ownsReservedPlaceholder': true,
        };
      case 'abortPrepared':
        return {'status': 'aborted', 'commitState': 'reserved'};
      case 'abortWrite':
        if (!entered.isCompleted) entered.complete();
        await release.future;
        if (fail) throw const FileSystemException('synthetic-private-release');
        return {'status': 'released'};
      default:
        throw StateError('Unexpected boundary method $method');
    }
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test('E05 cancelled export joins failed native release then retires independent capture and preview', () async {
    final root = await Directory.systemTemp.createTemp('e05-');
    final channel = HeldReleaseChannel();
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
    runtime.host!.edit((s) => s.setName('manual export after refused cleanup'));
    runtime.host!.preview.setPaused(true);
    await runtime.host!.preview.processingSettled;
    await runtime.scheduler!.checkpoint();
    final ordinary = AdmissionBudget.shared;
    final before = ordinary.reservedBytes;
    final captures = <CapturedSnapshot>[];
    var settled = false;
    final exporting = runtime
        .exportSelected(
          selection,
          approveContent: (_) async => false,
          approveDestination: (_) async {
            runtime.cancel();
            return true;
          },
        )
        .whenComplete(() => settled = true);
    try {
      await channel.entered.future.timeout(const Duration(seconds: 5));
      await Future<void>.delayed(const Duration(milliseconds: 30));
      expect(
        settled,
        isFalse,
        reason: 'Real native release is still consuming its paid tail',
      );
      expect(current.isDisposed, isFalse);
      expect(ordinary.reservedBytes, greaterThan(before + 1024));
      channel.release.complete();
      await exporting.timeout(const Duration(seconds: 5));
      expect(
        runtime.canCancel,
        isFalse,
        reason:
            'Rejected cached finish must not strand a terminal active request',
      );
      expect(runtime.message, contains('residual'));
      expect(runtime.message, contains('confirmados:'));
      expect(runtime.message, contains('limpeza'));
      expect(channel.roots.toSet().length, 1);
      expect(
        ordinary.reservedBytes,
        greaterThanOrEqualTo(before + 32768),
        reason: 'Real failed native key remains paid in gateway, not refunded',
      );
      runtime.host!.preview.setPaused(true);
      await runtime.host!.preview.processingSettled;
      for (var i = 0; i < WorkLimits.capturedSnapshots; i++) {
        captures.add(current.captureSnapshot());
      }
      expect(() => current.captureSnapshot(), throwsA(isA<CapacityExceeded>()));
      for (final capture in captures) {
        capture.release();
      }
      captures.clear();
      expect(current.project.name, 'manual export after refused cleanup');
      runtime.host!.preview.setPaused(false);
      runtime.host!.refresh();
      await runtime.host!.preview.processingSettled;
      expect(runtime.host!.preview.status, PreviewStatus.ready);
      channel.fail = false;
      await runtime.exportSelected(
        selection,
        approveContent: (_) async => null,
        approveDestination: (_) async => false,
      );
      expect(runtime.message, contains('cancelada'));
    } finally {
      if (!channel.release.isCompleted) channel.release.complete();
      channel.fail = false;
      for (final capture in captures) {
        capture.release();
      }
      await exporting;
      await runtime.close();
      runtime.dispose();
      await root.delete(recursive: true);
    }
    expect(runtime.budget.reservedBytes, 0);
    expect(ordinary.reservedBytes, lessThan(before - 2 * 1024 * 1024));
  });
}
