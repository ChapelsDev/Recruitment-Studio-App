import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/features/editor/editor_session.dart';
import 'package:recruitment_studio/shared/admission_budget.dart';
import 'package:recruitment_studio/shared/operation.dart';
import 'package:recruitment_studio/shared/problem.dart';
import 'package:recruitment_studio/shared/work_limits.dart';

import 'correction02_admission_test.dart' show stableRuntime, selection;

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  for (final action in ['open', 'export']) {
    test(
      'E04 $action live root pool refusal retires capture and leaves genuine retry',
      () async {
        final (root, runtime, picker) = await stableRuntime();
        final current = runtime.session!;
        final ordinary = AdmissionBudget.shared;
        final roots = <WorkOperation>[];
        final captures = <CapturedSnapshot>[];
        try {
          try {
            while (true) {
              roots.add(WorkOperation.create());
            }
          } on CapacityExceeded {
            /* actual live pool, not a synthetic throw */
          }
          // The valid runtime already owns resource operations. Exhaust only
          // the actually available slots, and prove the next creation refuses.
          expect(roots.length, inInclusiveRange(1, WorkLimits.liveOperations));
          expect(
            () => WorkOperation.create(),
            throwsA(isA<CapacityExceeded>()),
          );
          expect(
            ordinary.capacityBytes - ordinary.reservedBytes,
            greaterThan(1024 * 1024),
          );
          final before = ordinary.reservedBytes;
          if (action == 'open') {
            await runtime.openProject();
          } else {
            await runtime.exportSelected(
              selection,
              approveContent: (_) async => false,
              approveDestination: (_) async => true,
            );
          }
          expect(runtime.message, contains('Limite de capacidade'));
          expect(ordinary.reservedBytes, before);
          expect(picker.opens + picker.saves, 0);
          for (var i = 0; i < WorkLimits.capturedSnapshots; i++) {
            captures.add(current.captureSnapshot());
          }
          expect(
            () => current.captureSnapshot(),
            throwsA(isA<CapacityExceeded>()),
          );
          for (final capture in captures) {
            capture.release();
          }
          captures.clear();
          final permit = current.beginLeaveAttempt();
          expect(permit, isNotNull);
          permit!.end();
          for (final operation in roots) {
            await operation.finish();
          }
          roots.clear();
          if (action == 'open') {
            await runtime.openProject();
            expect(picker.opens, 1);
          } else {
            await runtime.exportSelected(
              selection,
              approveContent: (_) async => false,
              approveDestination: (_) async => true,
            );
            expect(picker.saves, 1);
          }
          expect(current.project.name, 'manual retained value');
          expect(identical(runtime.session, current), isTrue);
          expect(current.hasUnsavedChanges, isTrue);
          expect(runtime.canCancel, isFalse);
        } finally {
          for (final capture in captures) {
            capture.release();
          }
          for (final operation in roots) {
            await operation.finish();
          }
          await runtime.close();
          runtime.dispose();
          await root.delete(recursive: true);
        }
        expect(runtime.budget.reservedBytes, 0);
        await Future<void>.delayed(Duration.zero);
        try {
          for (var i = 0; i < WorkLimits.liveOperations; i++) {
            roots.add(WorkOperation.create());
          }
          expect(
            () => WorkOperation.create(),
            throwsA(isA<CapacityExceeded>()),
          );
        } finally {
          for (final operation in roots) {
            await operation.finish();
          }
        }
      },
    );
  }
}
