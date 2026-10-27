import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:recruitment_studio/features/documents/document_gateway.dart';
import 'package:recruitment_studio/features/editor/editor_session.dart';
import 'package:recruitment_studio/features/editor/preview_owner.dart';
import 'package:recruitment_studio/runtime/product_runtime.dart';
import 'package:recruitment_studio/shared/operation.dart';
import 'package:recruitment_studio/shared/problem.dart';
import 'package:recruitment_studio/shared/work_limits.dart';

import 'features/documents/windows_document_gateway_test.dart'
    show HostIo, HostPicker;
import 'correction02_admission_test.dart' show selection;
import 'support/project_fixtures.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test('E09 verified PNG outcome survives unrelated real root finalizer rejection and independent snapshot cleanup', () async {
    final root = await Directory.systemTemp.createTemp('e09-');
    final output = File('${root.path}/confirmed.png');
    final runtime = await ProductRuntime.open(
      root,
      (stage, budget) => WindowsDocumentGateway(
        picker: HostPicker(output.path),
        io: HostIo(),
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
    WorkOperation? actual;
    final captures = <CapturedSnapshot>[];
    try {
      await runtime.exportSelected(
        selection,
        approveContent: (_) async => false,
        approveDestination: (last) async {
          actual = preparedOperationFor(
            runtime.gateway,
            last.destination!,
          )!.operation;
          actual!.registerDrainFinalizer(() {
            throw const FileSystemException('synthetic-private-finalizer');
          });
          return true;
        },
      );
      final bytes = await output.readAsBytes();
      final decoded = img.decodePng(bytes)!;
      expect(decoded.width, 1080);
      expect(decoded.height, 1080);
      expect(runtime.message, contains('Exportação confirmada: confirmed.png'));
      expect(runtime.message, contains('limpeza não confirmada'));
      expect(runtime.message, isNot(contains('nenhum ficheiro')));
      expect(runtime.message, isNot(contains('synthetic-private')));
      expect(runtime.canCancel, isFalse);
      await expectLater(
        actual!.finish(),
        throwsA(
          isA<OperationException>().having(
            (e) => e.code,
            'finite root cause',
            ProblemCode.ioFailure,
          ),
        ),
      );
      await runtime.host!.preview.processingSettled;
      expect(runtime.host!.preview.status, PreviewStatus.ready);
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
      final evidence = Platform.environment['CONTINUATION_EVIDENCE'];
      if (evidence != null) {
        await Directory(evidence).create(recursive: true);
        await output.copy('$evidence/confirmed.png');
      }
    } finally {
      for (final capture in captures) {
        capture.release();
      }
      await runtime.close();
      runtime.dispose();
      await root.delete(recursive: true);
    }
    expect(runtime.budget.reservedBytes, 0);
  });
}
