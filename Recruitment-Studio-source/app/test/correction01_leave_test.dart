import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/runtime/product_runtime.dart';
import 'package:recruitment_studio/features/documents/document_gateway.dart';
import 'package:recruitment_studio/features/editor/leave_project_guard.dart';
import 'package:recruitment_studio/shared/work_budget.dart';

import 'features/documents/windows_document_gateway_test.dart' show HostIo;
import 'continuation01_runtime_drain_test.dart' show GatedPicker;

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test('D04 leave save prepublishes action barrier and close joins held native picker before session retirement', () async {
    final root = await Directory.systemTemp.createTemp('d04-leave-');
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
    Future<bool>? leaving;
    Future<void>? closing;
    try {
      await runtime.create();
      final session = runtime.session!;
      runtime.host!.edit((s) => s.setName('manual leave save'));
      leaving = runtime.leave(LeaveDecision.save);
      await picker.entered.future;
      final busyDuringLeave = runtime.busy;
      await runtime.create();
      expect(identical(runtime.session, session), isTrue);
      closing = runtime.close();
      await Future<void>.delayed(const Duration(milliseconds: 30));
      expect(
        session.isDisposed,
        isFalse,
        reason: 'Leave save and guard have not settled',
      );
      expect(
        busyDuringLeave,
        isTrue,
        reason: 'Leave is a serialized action, not a separate unchecked lane',
      );
      expect(await runtime.leave(LeaveDecision.discard), isFalse);
      picker.release.complete();
      expect(await leaving, isFalse);
      await closing;
      expect(session.isDisposed, isTrue);
      expect(await File(picker.path).exists(), isFalse);
    } finally {
      if (!picker.release.isCompleted) picker.release.complete();
      await leaving;
      await closing;
      await runtime.close();
      runtime.dispose();
      await root.delete(recursive: true);
    }
    expect(budget.reservedBytes, 0);
  });
}
