import 'dart:async';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/features/documents/document_gateway.dart';
import 'package:recruitment_studio/features/editor/editor_session.dart';
import 'package:recruitment_studio/runtime/product_runtime.dart';
import 'package:recruitment_studio/shared/admission_budget.dart';
import 'package:recruitment_studio/shared/work_limits.dart';

import 'features/documents/android_document_gateway_test.dart'
    show MemoryDocuments;
import 'joint_lifecycle_extra01_busy_logo_test.dart'
    show closeOutcome, ioCloseFailure, joinKnownClose;
import 'support/project_fixtures.dart';

class HeldEditableSave implements DocumentChannel {
  final native = MemoryDocuments();
  List<String> get methods => native.methods;
  final entered = Completer<void>(), resume = Completer<void>();
  bool failAbort = true, aborted = false, targetLive = false;
  final roots = <String>[];
  @override
  Future<Map<String, Object?>> invoke(
    String method,
    Map<String, Object?> args,
  ) async {
    roots.add(args['operationId'] as String);
    if (method == 'beginWrite') {
      methods.add(method);
      entered.complete();
      await resume.future;
      return {'status': 'ready', 'transferId': 'held-editable-write'};
    }
    if (method == 'prepareSave') targetLive = true;
    if (method == 'abortPrepared') {
      methods.add(method);
      if (failAbort) {
        return {
          'status': 'failed',
          'problem': 'ioFailure',
          'residualPlaceholder': true,
        };
      }
      aborted = true;
      return {'status': 'aborted', 'commitState': 'reserved'};
    }
    if (method == 'abortWrite' && args['releaseTarget'] == true) {
      expect(aborted, isTrue);
      targetLive = false;
    }
    return native.invoke(method, args);
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  for (final stop in ['cancel', 'close']) {
    test(
      'J04 $stop editable save settles actual busy write failure and preserves custody',
      () async {
        final root = await Directory.systemTemp.createTemp('joint-save-');
        final provider = HeldEditableSave();
        final runtime = await ProductRuntime.open(
          root,
          (stage, budget) => AndroidDocumentGateway(
            provider,
            stagingDirectory: stage,
            budget: budget,
          ),
        );
        final current = EditorSession.fromBundle(
          await fixtureBundle(),
          budget: runtime.budget,
        );
        await runtime.adoptSession(current);
        runtime.host!.edit((s) => s.setName('manual save remains dirty'));
        runtime.host!.preview.setPaused(true);
        await runtime.host!.preview.processingSettled;
        await runtime.scheduler!.checkpoint();
        var settled = false;
        final saving = runtime.saveProject().whenComplete(() => settled = true);
        Future<void>? closing;
        try {
          await provider.entered.future.timeout(const Duration(seconds: 5));
          if (stop == 'cancel') {
            runtime.cancel();
          } else {
            closing = runtime.close();
          }
          await Future<void>.delayed(const Duration(milliseconds: 20));
          expect(settled, isFalse);
          expect(current.isDisposed, isFalse);
          expect(provider.targetLive, isTrue);
          provider.resume.complete();
          final terminal = await closeOutcome(saving);
          expect(
            terminal,
            isNull,
            reason: 'The action reports its failed receipt without stranding its real root',
          );
          expect(settled, isTrue);
          expect(runtime.canCancel, isFalse);
          expect(provider.targetLive, isTrue);
          expect(provider.roots.toSet().length, 1);
          expect(
            AdmissionBudget.shared.reservedBytes,
            greaterThanOrEqualTo(32768),
          );
          if (stop == 'cancel') {
            expect(current.hasUnsavedChanges, isTrue);
            expect(runtime.message, contains('residual'));
            final captures = <CapturedSnapshot>[];
            try {
              for (var i = 0; i < WorkLimits.capturedSnapshots; i++) {
                captures.add(current.captureSnapshot());
              }
            } finally {
              for (final c in captures) {
                c.release();
              }
            }
          } else {
            expect(await closeOutcome(closing!), ioCloseFailure);
            expect(runtime.unresolvedCleanup, isTrue);
          }
        } finally {
          if (!provider.resume.isCompleted) provider.resume.complete();
          provider.failAbort = false;
          // Only an as-yet unissued gateway close can perform genuine recovery.
          await joinKnownClose(runtime.gateway.close());
          await saving.timeout(const Duration(seconds: 5));
          await joinKnownClose(closing ?? runtime.close());
          runtime.dispose();
          await root.delete(recursive: true);
        }
      },
    );
  }
}
