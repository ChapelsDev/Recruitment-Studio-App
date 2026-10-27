import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/features/documents/document_gateway.dart';
import 'package:recruitment_studio/shared/operation.dart';
import 'package:recruitment_studio/shared/work_budget.dart';

import 'features/documents/windows_document_gateway_test.dart'
    show HostIo, HostPicker;

void main() {
  test('D25 current prepared binding refuses a finishing real owner before any new producer admission', () async {
    final root = await Directory.systemTemp.createTemp('d25-binding-stop-');
    final budget = WorkBudgetController();
    final request = WorkOperation.create();
    final gateway = WindowsDocumentGateway(
      picker: HostPicker('${root.path}/actual.png'),
      io: HostIo(),
      stagingDirectory: root,
      budget: budget,
    );
    final destination = (await gateway.prepareSave(
      ['actual.png'],
      'image/png',
      operation: request,
    ))!;
    final finishing = request.finish();
    finishing.ignore();
    try {
      expect(
        () => preparedOperationFor(gateway, destination),
        throwsA(isA<Exception>()),
        reason: 'Literal object affinity is not permission to adopt a finishing capability lifetime',
      );
    } finally {
      await gateway.close();
      await finishing;
      await root.delete(recursive: true);
    }
  });
}
