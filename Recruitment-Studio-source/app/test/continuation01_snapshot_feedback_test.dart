import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/runtime/product_runtime.dart';
import 'package:recruitment_studio/features/documents/document_gateway.dart';
import 'package:recruitment_studio/features/storage/project_codec.dart';
import 'package:recruitment_studio/shared/work_budget.dart';

import 'continuation01_runtime_drain_test.dart' show GatedPicker;
import 'features/documents/windows_document_gateway_test.dart' show HostIo;

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test('C13 edit during actual native save preserves frozen bytes generation and honest newer-unsaved feedback', () async {
    final root = await Directory.systemTemp.createTemp('c13-capture-');
    final budget = WorkBudgetController();
    final picker = GatedPicker('${root.path}/chosen.recruitproj');
    final runtime = await ProductRuntime.open(
      root,
      (stage, domain) => WindowsDocumentGateway(
        picker: picker,
        io: HostIo(),
        stagingDirectory: stage,
        budget: domain,
      ),
      budget: budget,
    );
    Future<void>? saving;
    try {
      await runtime.create();
      runtime.host!.edit((s) => s.setName('Captured version'));
      final session = runtime.session!, generation = session.generation;
      saving = runtime.saveProject();
      await picker.entered.future;
      runtime.host!.edit((s) => s.setName('Newer manual version'));
      picker.release.complete();
      await saving;
      expect(session.project.name, 'Newer manual version');
      expect(session.generation, greaterThan(generation));
      expect(session.hasUnsavedChanges, isTrue);
      final saved = await ZipProjectCodec(budget: budget)
          .decodeEditorSession(File(picker.path));
      expect(saved.project.name, 'Captured version');
      saved.dispose();
      expect(
        runtime.message,
        contains('alterações posteriores'),
        reason: 'Verified old snapshot must not suggest current newer edits were saved',
      );
    } finally {
      if (!picker.release.isCompleted) picker.release.complete();
      await saving;
      await runtime.close();
      runtime.dispose();
      await root.delete(recursive: true);
    }
    expect(budget.reservedBytes, 0);
  });
}
