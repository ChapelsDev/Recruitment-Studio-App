import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/runtime/product_runtime.dart';
import 'package:recruitment_studio/features/documents/document_gateway.dart';
import 'package:recruitment_studio/features/storage/local_repository.dart';
import 'package:recruitment_studio/shared/admission_budget.dart';
import 'package:recruitment_studio/shared/problem.dart';
import 'package:recruitment_studio/shared/work_budget.dart';

import 'features/documents/windows_document_gateway_test.dart'
    show HostIo, HostPicker;
import 'correction01_shutdown_test.dart' show CloseFaultGateway;

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test('D22 opening rollback preserves first capacity cause and independently closes repository after gateway close rejection', () async {
    final root = await Directory.systemTemp.createTemp('d22-opening-');
    final budget = WorkBudgetController();
    final ordinary = AdmissionBudget.shared;
    AdmissionTicket? pressure;
    final next = FileLocalRepository(
      Directory('${root.path}/repository'),
      budget: budget,
    );
    try {
      await expectLater(
        ProductRuntime.open(root, (stage, domain) {
          final gateway = CloseFaultGateway(
            WindowsDocumentGateway(
              picker: HostPicker(null),
              io: HostIo(),
              stagingDirectory: stage,
              budget: domain,
            ),
          );
          gateway.release.complete();
          pressure = ordinary.reserve(
            ordinary.capacityBytes - ordinary.reservedBytes - 132 * 1024,
          );
          return gateway;
        }, budget: budget),
        throwsA(isA<CapacityExceeded>()),
      );
      pressure!.release();
      expect(await next.listProjects(), isA<List<ProjectSummary>>());
    } finally {
      pressure?.release();
      await next.close();
      await root.delete(recursive: true);
    }
  });
}
