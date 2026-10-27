import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/features/composition/export_format.dart';
import 'package:recruitment_studio/features/documents/document_gateway.dart';
import 'package:recruitment_studio/features/projects/project.dart';
import 'package:recruitment_studio/shared/operation.dart';
import 'package:recruitment_studio/shared/problem.dart';
import 'package:recruitment_studio/shared/work_budget.dart';

import 'read_retirement_delegate01_test.dart' show BoundReadGateway;
import 'features/documents/windows_document_gateway_test.dart'
    show HostIo, HostPicker;

class TypedGetterGateway extends BoundReadGateway {
  TypedGetterGateway(DocumentGateway real, this.error) : super(real, real);
  final Object error;
  @override
  DocumentGateway get openCapabilityDelegate {
    resolutions++;
    throw error;
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  final errors = <String, Object>{
    'document': const DocumentGatewayException(
      Problem(
        code: ProblemCode.permissionDenied,
        severity: ProblemSeverity.info,
        locale: AppLocale.deDE,
        format: ExportFormat.story,
        sectionId: 'synthetic-private-section',
        field: 'synthetic-private-field',
        actionLabel: 'synthetic-private-action',
      ),
      residualPlaceholder: true,
    ),
    'operation': const OperationException(ProblemCode.operationCancelled),
    'capacity': const CapacityExceeded(),
  };
  for (final entry in errors.entries) {
    test(
      'E01 ${entry.key} getter cannot publish caller Problem fields or claims',
      () async {
        final root = await Directory.systemTemp.createTemp('e01-');
        final source = await File('${root.path}/input.bin')
            .writeAsBytes([1, 2]);
        final budget = WorkBudgetController();
        final real = WindowsDocumentGateway(
          picker: HostPicker(source.path),
          io: HostIo(),
          stagingDirectory: root,
          budget: budget,
        );
        final request = WorkOperation.create();
        final wrapper = TypedGetterGateway(real, entry.value);
        try {
          final ref = (await real.pickOpen({
            'application/octet-stream',
          }, operation: request))!;
          final stage = await real.stageRead(ref, 1024, operation: request);
          DocumentGatewayException? observed;
          try {
            await wrapper.retireOpen(ref, operation: request);
          } on DocumentGatewayException catch (error) {
            observed = error;
          }
          expect(observed, isNotNull);
          final problem = observed!.problem;
          expect(problem.code, ProblemCode.ioFailure);
          expect(problem.severity, ProblemSeverity.error);
          expect(problem.locale, isNull);
          expect(problem.format, isNull);
          expect(problem.sectionId, isNull);
          expect(problem.field, isNull);
          expect(problem.actionLabel, 'Tentar novamente');
          expect(observed.residualPlaceholder, isFalse);
          expect(wrapper.resolutions, 1);
          expect(request.isFinishing, isFalse);
          await real.retireOpen(ref, operation: request);
          expect(await stage.readAsBytes(), [1, 2]);
          expect(await source.readAsBytes(), [1, 2]);
        } finally {
          await real.close();
          await request.finish();
          await root.delete(recursive: true);
        }
      },
    );
  }
}
