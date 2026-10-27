import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/runtime/product_runtime.dart';
import 'package:recruitment_studio/features/documents/document_gateway.dart';
import 'package:recruitment_studio/features/editor/editor_session.dart';
import 'package:recruitment_studio/features/projects/project.dart';
import 'package:recruitment_studio/shared/admission_budget.dart';
import 'package:recruitment_studio/shared/problem.dart';
import 'package:recruitment_studio/shared/work_budget.dart';

import 'features/documents/windows_document_gateway_test.dart'
    show HostIo, HostPicker;

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test(
    'D09 failed runtime construction refunds all newly paid controller tickets',
    () async {
      final root = await Directory.systemTemp.createTemp('d09-construction-');
      final budget = WorkBudgetController();
      final ordinary = AdmissionBudget.shared;
      AdmissionTicket? pressure;
      var before = 0;
      try {
        await expectLater(
          ProductRuntime.open(root, (stage, domain) {
            final gateway = WindowsDocumentGateway(
              picker: HostPicker(null),
              io: HostIo(),
              stagingDirectory: stage,
              budget: domain,
            );
            before = ordinary.reservedBytes;
            pressure = ordinary.reserve(
              ordinary.capacityBytes - ordinary.reservedBytes - 132 * 1024,
            );
            return gateway;
          }, budget: budget),
          throwsA(isA<CapacityExceeded>()),
        );
        pressure!.release();
        expect(
          ordinary.reservedBytes,
          lessThanOrEqualTo(before - 2 * 1024 * 1024 - 4096 + 16 * 1024),
          reason: 'Failed construction cannot strand the root/library explicit control credits',
        );
      } finally {
        pressure?.release();
        await root.delete(recursive: true);
      }
    },
  );
  test('D10 failed real editor attachment never publishes or abandons its provisional session', () async {
    final root = await Directory.systemTemp.createTemp('d10-adoption-');
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
      Project.blank(id: 'unadopted'),
      budget: runtime.budget,
    );
    final ordinary = AdmissionBudget.shared;
    final pressure = ordinary.reserve(
      ordinary.capacityBytes - ordinary.reservedBytes,
    );
    try {
      await expectLater(
        runtime.adoptSession(next),
        throwsA(isA<CapacityExceeded>()),
      );
      expect(
        runtime.session,
        isNull,
        reason: 'No partial editor may be published at host admission failure',
      );
      expect(runtime.host, isNull);
      expect(runtime.scheduler, isNull);
      expect(
        next.isDisposed,
        isTrue,
        reason: 'Unadopted session remains in cleanup custody',
      );
    } finally {
      pressure.release();
      next.dispose();
      await runtime.close();
      runtime.dispose();
      await root.delete(recursive: true);
    }
  });
}
