import 'dart:async';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/runtime/product_runtime.dart';
import 'package:recruitment_studio/features/documents/document_gateway.dart';
import 'package:recruitment_studio/shared/work_budget.dart';

import 'features/documents/windows_document_gateway_test.dart' show HostIo;

final class GatedPicker implements WindowsDocumentPicker {
  GatedPicker(this.path);
  final String path;
  final entered = Completer<void>(), release = Completer<void>();
  @override
  Future<String?> open(Set<String> mimes) async => path;
  @override
  Future<String?> save(String name, String mime) async {
    entered.complete();
    await release.future;
    return path;
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test('C08 closing the actual runtime cancels and joins native save before retiring captured editor ownership', () async {
    final root = await Directory.systemTemp.createTemp('c08-drain-');
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
    Future<void>? saving, closing;
    try {
      await runtime.create();
      final session = runtime.session!;
      runtime.host!.edit((s) => s.setName('Captured manual draft'));
      saving = runtime.saveProject();
      await picker.entered.future;
      closing = runtime.close();
      await Future<void>.delayed(const Duration(milliseconds: 50));
      expect(
        session.isDisposed,
        isFalse,
        reason: 'Captured ownership stays live until the actual provider tail and request drain settle',
      );
      picker.release.complete();
      await saving;
      await closing;
      expect(session.isDisposed, isTrue);
      expect(
        await File(picker.path).exists(),
        isFalse,
        reason: 'Close cancels before native commit, never publishes captured bytes afterward',
      );
    } finally {
      if (!picker.release.isCompleted) picker.release.complete();
      await saving;
      await closing;
      await runtime.close();
      runtime.dispose();
      await root.delete(recursive: true);
    }
    expect(budget.reservedBytes, 0);
  });
}
