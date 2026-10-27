import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/shared/admission_budget.dart';

import 'correction02_admission_test.dart' show stableRuntime;

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test('E08 logo service birth refusal retires the real already admitted root before provider effects', () async {
    final (root, runtime, picker) = await stableRuntime();
    final ordinary = AdmissionBudget.shared;
    final pressure = ordinary.reserve(
      ordinary.capacityBytes - ordinary.reservedBytes - 4096,
    );
    try {
      await runtime.importProfileLogo();
      expect(runtime.message, contains('Limite de capacidade'));
      expect(ordinary.capacityBytes - ordinary.reservedBytes, 4096);
      expect(runtime.canCancel, isFalse);
      expect(picker.opens, 0);
      expect(runtime.session!.project.name, 'manual retained value');
    } finally {
      pressure.release();
      await runtime.close();
      runtime.dispose();
      await root.delete(recursive: true);
    }
    expect(runtime.budget.reservedBytes, 0);
  });
}
