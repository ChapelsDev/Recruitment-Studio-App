import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/runtime/product_documents.dart';
import 'package:recruitment_studio/features/documents/document_gateway.dart';
import 'package:recruitment_studio/features/editor/editor_session.dart';
import 'package:recruitment_studio/features/projects/project.dart';
import 'package:recruitment_studio/features/storage/project_codec.dart';
import 'package:recruitment_studio/shared/admission_budget.dart';
import 'package:recruitment_studio/shared/operation.dart';
import 'package:recruitment_studio/shared/problem.dart';
import 'package:recruitment_studio/shared/work_budget.dart';
import 'package:recruitment_studio/shared/work_limits.dart';

import 'features/documents/windows_document_gateway_test.dart'
    show HostIo, HostPicker;
import 'correction01_shutdown_test.dart' show CloseFaultGateway;

class HeadroomGateway extends CloseFaultGateway
    implements OpenCapabilityRetirementDelegate {
  HeadroomGateway(super.real);
  @override
  DocumentGateway get openCapabilityDelegate => real;
  AdmissionTicket? pressure;
  int before = 0;
  @override
  Future<void> close() => real.close();
  @override
  Future<File> stageRead(
    DocumentRef ref,
    int maximum, {
    Operation? operation,
  }) async {
    final file = await real.stageRead(ref, maximum, operation: operation);
    await Future<void>.delayed(
      Duration.zero,
    ); // settle actual gateway observation before exact headroom
    final ordinary = AdmissionBudget.shared;
    before = ordinary.reservedBytes;
    pressure = ordinary.reserve(
      ordinary.capacityBytes - ordinary.reservedBytes - 4096,
    );
    return file;
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test('D19 stop listener admission refusal cannot strand newly created open producer or operation pool slot', () async {
    final root = await Directory.systemTemp.createTemp('d19-link-');
    final budget = WorkBudgetController();
    final input = File('${root.path}/input.recruitproj');
    final setup = EditorSession(Project.blank(id: 'setup'), budget: budget);
    await ZipProjectCodec(budget: budget).encode(setup.bundle, input);
    setup.dispose();
    await Future<void>.delayed(Duration.zero);
    final request = WorkOperation.create();
    final gateway = HeadroomGateway(
      WindowsDocumentGateway(
        picker: HostPicker(input.path),
        io: HostIo(),
        stagingDirectory: root,
        budget: budget,
      ),
    );
    final documents = ProductDocuments(gateway, root, budget);
    final probes = <WorkOperation>[];
    try {
      await expectLater(
        documents.open(request),
        throwsA(isA<CapacityExceeded>()),
      );
      gateway.pressure!.release();
      expect(
        AdmissionBudget.shared.reservedBytes,
        gateway.before,
        reason:
            'The created producer must retire even when link admission refuses',
      );
      try {
        while (true) {
          probes.add(WorkOperation.create());
        }
      } on CapacityExceeded {
        /* real finite pool frontier */
      }
      expect(
        probes.length,
        WorkLimits.liveOperations - 1,
        reason: 'Only the actual supplied request remains live',
      );
    } finally {
      gateway.pressure?.release();
      for (final operation in probes) {
        await operation.finish();
      }
      await gateway.close();
      await request.finish();
      await root.delete(recursive: true);
    }
  });
}
