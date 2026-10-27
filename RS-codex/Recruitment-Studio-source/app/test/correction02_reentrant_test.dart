import 'dart:async';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/features/documents/document_gateway.dart';
import 'package:recruitment_studio/features/editor/editor_session.dart';
import 'package:recruitment_studio/runtime/product_runtime.dart';

import 'features/documents/windows_document_gateway_test.dart' show HostIo;
import 'correction02_admission_test.dart' show selection;
import 'support/project_fixtures.dart';

class StopPicker implements WindowsDocumentPicker {
  final release = Completer<void>();
  int opens = 0, saves = 0;
  @override
  Future<String?> open(Set<String> mimes) async {
    opens++;
    await release.future;
    return null;
  }

  @override
  Future<String?> save(String name, String mime) async {
    saves++;
    await release.future;
    return null;
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  for (final action in ['save', 'open', 'export', 'logo']) {
    test(
      'E06 $action busy-start reentrant close forbids later picker admission and joins one close',
      () async {
        final root = await Directory.systemTemp.createTemp('e06-');
        final picker = StopPicker();
        final runtime = await ProductRuntime.open(
          root,
          (stage, budget) => WindowsDocumentGateway(
            picker: picker,
            io: HostIo(),
            stagingDirectory: stage,
            budget: budget,
          ),
        );
        await runtime.adoptSession(
          EditorSession.fromBundle(
            await fixtureBundle(),
            budget: runtime.budget,
          ),
        );
        runtime.host!.edit((s) => s.setName('manual reentrant close'));
        runtime.host!.preview.setPaused(true);
        await runtime.host!.preview.processingSettled;
        await runtime.scheduler!.checkpoint();
        final current = runtime.session!;
        Future<void>? closing;
        var joins = false;
        void stop() {
          if (runtime.busy && closing == null) {
            closing = runtime.close();
            joins = identical(closing, runtime.close());
          }
        }

        runtime.addListener(stop);
        var approvals = 0;
        final saving = switch (action) {
          'save' => runtime.saveProject(),
          'open' => runtime.openProject(),
          'logo' => runtime.importProfileLogo(),
          _ => runtime.exportSelected(
            selection,
            approveContent: (_) async {
              approvals++;
              return false;
            },
            approveDestination: (_) async {
              approvals++;
              return true;
            },
          ),
        };
        try {
          await Future<void>.delayed(const Duration(milliseconds: 40));
          expect(closing, isNotNull);
          expect(joins, isTrue);
          expect(
            picker.saves,
            0,
            reason: 'Close already swept stop before the root existed',
          );
          expect(picker.opens, 0);
          expect(approvals, 0);
          await saving.timeout(const Duration(seconds: 5));
          await closing!.timeout(const Duration(seconds: 5));
          expect(current.isDisposed, isTrue);
          expect(runtime.busy, isFalse);
          expect(runtime.canCancel, isFalse);
        } finally {
          runtime.removeListener(stop);
          if (!picker.release.isCompleted) picker.release.complete();
          await saving;
          await runtime.close();
          runtime.dispose();
          await root.delete(recursive: true);
        }
        expect(runtime.budget.reservedBytes, 0);
      },
    );
  }
}
