import 'dart:async';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/features/documents/document_gateway.dart';
import 'package:recruitment_studio/features/editor/editor_session.dart';
import 'package:recruitment_studio/features/projects/project.dart';
import 'package:recruitment_studio/features/storage/project_codec.dart';
import 'package:recruitment_studio/shared/operation.dart';
import 'package:recruitment_studio/shared/work_budget.dart';

import 'features/documents/windows_document_gateway_test.dart'
    show HostIo, HostPicker;

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test('D08 direct same-root decoded editor must publish before downstream capability retirement', () async {
    final root = await Directory.systemTemp.createTemp('d08-decode-');
    final budget = WorkBudgetController();
    final codec = ZipProjectCodec(budget: budget);
    final setup = EditorSession(Project.blank(id: 'prepared'), budget: budget);
    final input = File('${root.path}/input.recruitproj');
    await codec.encode(setup.bundle, input);
    final request = WorkOperation.create();
    final gateway = WindowsDocumentGateway(
      picker: HostPicker(input.path),
      io: HostIo(),
      stagingDirectory: root,
      budget: budget,
    );
    Future<EditorSession>? decoding;
    EditorSession? decoded;
    try {
      final ref = (await gateway.pickOpen({
        'application/zip',
      }, operation: request))!;
      final staged = await gateway.stageRead(
        ref,
        24 * 1024 * 1024,
        operation: request,
      );
      decoding = codec.decodeEditorSession(staged, operation: request);
      decoding.ignore();
      await gateway.retireOpen(ref, operation: request);
      decoded = await decoding
          .then<EditorSession?>((value) => value)
          .timeout(const Duration(milliseconds: 500), onTimeout: () => null);
      expect(
        decoded,
        isNotNull,
        reason: 'A real explicit read capability remains pending until later gateway retirement; aggregate afterPending cannot be the producer publication barrier',
      );
      expect(request.isFinishing, isFalse);
    } finally {
      request.cancel();
      await gateway.close();
      try {
        final value = await decoding;
        if (!identical(value, decoded)) value?.dispose();
      } catch (_) {}
      decoded?.dispose();
      await request.finish();
      setup.dispose();
      await root.delete(recursive: true);
    }
  });
}
