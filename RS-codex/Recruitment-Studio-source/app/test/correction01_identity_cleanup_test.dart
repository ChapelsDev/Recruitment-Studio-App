import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/features/storage/private_effect_custody.dart';
import 'package:recruitment_studio/features/storage/private_file_io.dart';
import 'package:recruitment_studio/shared/admission_budget.dart';

void main() {
  test('D26 residual reap cannot retire a live producer descriptor before its actual ownership handoff', () async {
    final root = await Directory.systemTemp.createTemp('d26-live-');
    final before = PrivateEffectCustody.retainedCount;
    final custody = PrivateEffectCustody(const PrivateFileIo());
    final file = await custody.createStage(root, 'export-', 'payload');
    await file.create(exclusive: true);
    custody.trackCreatedFile();
    final handle = await file.open(mode: FileMode.write);
    custody.handle = handle;
    await handle.writeFrom([7, 8, 9]);
    await handle.flush();
    custody.sealProducedFile();
    try {
      await PrivateEffectCustody.reap();
      expect(
        PrivateEffectCustody.retainedCount,
        before + 1,
        reason: 'Only an actually transferred residual may be reaped; the real producer still holds this descriptor',
      );
      expect(await handle.length(), 3);
      await handle.writeFrom([10]);
      await handle.flush();
      custody.sealProducedFile();
    } finally {
      await custody.retire();
      await root.delete(recursive: true);
    }
  });
  test('D24 foreign stage replacement and external export are never deleted or used to refresh owned identity', () async {
    final root = await Directory.systemTemp.createTemp('d24-foreign-');
    final external = await File('${root.path}/external-export.png')
        .writeAsBytes([1, 2, 3]);
    final before = AdmissionBudget.shared.reservedBytes;
    final custody = PrivateEffectCustody(const PrivateFileIo());
    final file = await custody.createStage(root, 'export-', 'payload');
    await file.create(exclusive: true);
    custody.trackCreatedFile();
    await file.writeAsBytes([4, 5, 6]);
    custody.sealProducedFile();
    await file.rename('${file.path}.original');
    await File(file.path).writeAsBytes([99, 98, 97, 96]);
    try {
      expect(await custody.retire(), isFalse);
      expect(await File(file.path).readAsBytes(), [99, 98, 97, 96]);
      expect(await external.readAsBytes(), [1, 2, 3]);
      expect(custody.problem!.code.name, 'ioFailure');
      expect(PrivateEffectCustody.retainedCount, 1);
      expect(
        AdmissionBudget.shared.reservedBytes,
        before + 64 * 1024,
        reason: 'Unknown identity remains in a paid unresolved record, never refreshed or silently refunded',
      );
    } finally {
      // Explicit fixture teardown, not production cleanup or a custody refund.
      await root.delete(recursive: true);
    }
  });
}
