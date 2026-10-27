import 'dart:async';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/features/documents/document_gateway.dart';
import 'package:recruitment_studio/features/editor/editor_session.dart';
import 'package:recruitment_studio/runtime/product_runtime.dart';

import 'features/documents/windows_document_gateway_test.dart'
    show HostIo, HostPicker;
import 'correction02_admission_test.dart' show selection;
import 'support/project_fixtures.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  for (final phase in ['content', 'destination']) {
    test(
      'E11 close during held $phase approval joins actual consumer without new write publication',
      () async {
        final root = await Directory.systemTemp.createTemp('e11-');
        final output = File('${root.path}/not-created.png');
        final io = HostIo();
        final runtime = await ProductRuntime.open(
          root,
          (stage, budget) => WindowsDocumentGateway(
            picker: HostPicker(output.path),
            io: io,
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
        final entered = Completer<void>(), release = Completer<void>();
        final exporting = runtime.exportSelected(
          selection,
          approveContent: (_) async {
            if (phase == 'content') {
              entered.complete();
              await release.future;
            }
            return false;
          },
          approveDestination: (_) async {
            if (phase == 'destination') {
              entered.complete();
              await release.future;
            }
            return true;
          },
        );
        await entered.future.timeout(const Duration(seconds: 5));
        var closed = false;
        final closing = runtime.close();
        closing.then((_) => closed = true);
        try {
          expect(identical(closing, runtime.close()), isTrue);
          await Future<void>.delayed(const Duration(milliseconds: 30));
          expect(
            closed,
            isFalse,
            reason: 'Actual callback still borrows the captured model',
          );
          expect(current.isDisposed, isFalse);
          release.complete();
          await exporting.timeout(const Duration(seconds: 5));
          await closing.timeout(const Duration(seconds: 5));
          expect(io.writes, 0);
          expect(output.existsSync(), isFalse);
          expect(current.isDisposed, isTrue);
          expect(runtime.canCancel, isFalse);
        } finally {
          if (!release.isCompleted) release.complete();
          await exporting;
          await closing;
          runtime.dispose();
          await root.delete(recursive: true);
        }
        expect(runtime.budget.reservedBytes, 0);
      },
    );
  }
}
