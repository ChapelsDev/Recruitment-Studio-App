import 'dart:async';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/features/documents/document_gateway.dart';
import 'package:recruitment_studio/features/editor/leave_project_guard.dart';
import 'package:recruitment_studio/runtime/product_runtime.dart';

import 'features/documents/windows_document_gateway_test.dart' show HostIo;

class SaveThenOpenPicker implements WindowsDocumentPicker {
  SaveThenOpenPicker(this.path);
  final String path;
  final openRelease = Completer<void>();
  int opens = 0, saves = 0;
  @override
  Future<String?> open(Set<String> mimes) async {
    opens++;
    await openRelease.future;
    return null;
  }

  @override
  Future<String?> save(String name, String mime) async {
    saves++;
    return path;
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test('E07 close at save-before-open notification stops the real provisional open root before republish', () async {
    final root = await Directory.systemTemp.createTemp('e07-');
    final picker = SaveThenOpenPicker('${root.path}/saved.recruitproj');
    final runtime = await ProductRuntime.open(
      root,
      (stage, budget) => WindowsDocumentGateway(
        picker: picker,
        io: HostIo(),
        stagingDirectory: stage,
        budget: budget,
      ),
    );
    await runtime.create();
    runtime.host!.edit((s) => s.setName('manual save before replacement'));
    runtime.host!.preview.setPaused(true);
    await runtime.host!.preview.processingSettled;
    await runtime.scheduler!.checkpoint();
    final current = runtime.session!;
    Future<void>? closing;
    void stop() {
      if (runtime.busy &&
          runtime.message.startsWith('Projeto editável confirmado') &&
          closing == null) {
        closing = runtime.close();
      }
    }

    runtime.addListener(stop);
    final opening = runtime.openProject(decision: LeaveDecision.save);
    try {
      for (var i = 0; i < 200 && closing == null; i++) {
        await Future<void>.delayed(const Duration(milliseconds: 10));
      }
      expect(closing, isNotNull);
      expect(picker.saves, 1);
      expect(File(picker.path).existsSync(), isTrue);
      expect(
        picker.opens,
        0,
        reason: 'The held outer root must inherit close after the inner save unpublishes',
      );
      await opening.timeout(const Duration(seconds: 5));
      expect(identical(closing, runtime.close()), isTrue);
      await closing!.timeout(const Duration(seconds: 5));
      expect(current.isDisposed, isTrue);
      expect(runtime.canCancel, isFalse);
    } finally {
      runtime.removeListener(stop);
      if (!picker.openRelease.isCompleted) picker.openRelease.complete();
      await opening;
      await runtime.close();
      runtime.dispose();
      await root.delete(recursive: true);
    }
    expect(runtime.budget.reservedBytes, 0);
  });
}
