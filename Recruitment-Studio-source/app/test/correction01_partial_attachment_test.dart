import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/runtime/product_runtime.dart';
import 'package:recruitment_studio/features/documents/document_gateway.dart';
import 'package:recruitment_studio/features/editor/editor_session.dart';
import 'package:recruitment_studio/features/projects/project.dart';
import 'package:recruitment_studio/shared/admission_budget.dart';
import 'package:recruitment_studio/shared/problem.dart';

import 'features/documents/windows_document_gateway_test.dart'
    show HostIo, HostPicker;

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test('D20 partial-attachment headroom refuses before any host scheduler publication and disposes provisional session', () async {
    final root = await Directory.systemTemp.createTemp('d20-partial-');
    final runtime = await ProductRuntime.open(
      root,
      (stage, budget) => WindowsDocumentGateway(
        picker: HostPicker(null),
        io: HostIo(),
        stagingDirectory: stage,
        budget: budget,
      ),
    );
    final next = EditorSession(
      Project.blank(id: 'partial'),
      budget: runtime.budget,
    );
    final ordinary = AdmissionBudget.shared;
    final pressure = ordinary.reserve(
      ordinary.capacityBytes - ordinary.reservedBytes - 8192,
    );
    try {
      await expectLater(
        runtime.adoptSession(next),
        throwsA(isA<CapacityExceeded>()),
      );
      expect(next.isDisposed, isTrue);
      expect(runtime.session, isNull);
      expect(runtime.host, isNull);
      expect(runtime.scheduler, isNull);
    } finally {
      pressure.release();
      next.dispose();
      await runtime.close();
      runtime.dispose();
      await root.delete(recursive: true);
    }
  });
}
