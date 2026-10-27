import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/features/editor/editor_session.dart';
import 'package:recruitment_studio/shared/admission_budget.dart';
import 'package:recruitment_studio/shared/problem.dart';
import 'package:recruitment_studio/shared/work_limits.dart';

import 'correction02_admission_test.dart' show stableRuntime, selection;

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test('E03 export ordinary root refusal retires capture without losing current manual editor', () async {
    final (root, runtime, picker) = await stableRuntime();
    final current = runtime.session!;
    final generation = current.generation;
    final ordinary = AdmissionBudget.shared;
    final before = ordinary.reservedBytes;
    final resourceBefore = runtime.budget.reservedBytes;
    final pressure = ordinary.reserve(ordinary.capacityBytes - before - 1024);
    final captures = <CapturedSnapshot>[];
    try {
      expect(ordinary.capacityBytes - ordinary.reservedBytes, 1024);
      await runtime.exportSelected(
        selection,
        approveContent: (_) async => false,
        approveDestination: (_) async => true,
      );
      expect(runtime.message, contains('Limite de capacidade'));
      expect(picker.saves, 0);
      expect(
        ordinary.capacityBytes - ordinary.reservedBytes,
        1024,
        reason: 'Capture admission cannot survive refused export root',
      );
      pressure.release();
      expect(runtime.budget.reservedBytes, resourceBefore);
      for (var i = 0; i < WorkLimits.capturedSnapshots; i++) {
        captures.add(current.captureSnapshot());
      }
      expect(() => current.captureSnapshot(), throwsA(isA<CapacityExceeded>()));
      for (final capture in captures) {
        capture.release();
      }
      captures.clear();
      final retry = current.beginLeaveAttempt();
      expect(retry, isNotNull);
      retry!.end();
      await runtime.exportSelected(
        selection,
        approveContent: (_) async => false,
        approveDestination: (_) async => true,
      );
      expect(picker.saves, 1);
      expect(identical(runtime.session, current), isTrue);
      expect(current.project.name, 'manual retained value');
      expect(current.generation, generation);
      expect(current.hasUnsavedChanges, isTrue);
      expect(runtime.canCancel, isFalse);
    } finally {
      pressure.release();
      for (final capture in captures) {
        capture.release();
      }
      await runtime.close();
      runtime.dispose();
      await root.delete(recursive: true);
    }
    expect(runtime.budget.reservedBytes, 0);
  });
}
