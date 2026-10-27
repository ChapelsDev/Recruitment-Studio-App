import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/runtime/product_runtime.dart';
import 'package:recruitment_studio/features/documents/document_gateway.dart';
import 'package:recruitment_studio/features/storage/private_effect_custody.dart';

import 'features/documents/windows_document_gateway_test.dart'
    show HostIo, HostPicker;
import 'correction01_custody_test.dart' show RetirementFaultIo;
import 'correction01_shutdown_test.dart' show CloseFaultGateway;

import 'package:recruitment_studio/shared/operation.dart';

class FinishFaultGateway extends CloseFaultGateway {
  FinishFaultGateway(super.real);
  @override
  Future<void> close() => real.close();
  @override
  Future<WriteReceipt> writePrepared(
    File source,
    PreparedDestination destination,
    String name, {
    Operation? operation,
  }) async {
    final receipt = await real.writePrepared(
      source,
      destination,
      name,
      operation: operation,
    );
    (operation! as WorkOperation).registerDrainFinalizer(() {
      throw const FileSystemException(
        'private finish cause',
        '/private/finish',
      );
    });
    return receipt;
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test('D16 actual verified receipt survives root finish rejection without a clean editor or no-file feedback', () async {
    final root = await Directory.systemTemp.createTemp('d16-finish-');
    final target = File('${root.path}/actual.recruitproj');
    final runtime = await ProductRuntime.open(
      root,
      (stage, budget) => FinishFaultGateway(
        WindowsDocumentGateway(
          picker: HostPicker(target.path),
          io: HostIo(),
          stagingDirectory: stage,
          budget: budget,
        ),
      ),
    );
    try {
      await runtime.create();
      runtime.host!.edit((s) => s.setName('saved but failed final drain'));
      await runtime.saveProject();
      expect(await target.exists(), isTrue);
      expect(runtime.session!.hasUnsavedChanges, isTrue);
      expect(runtime.message, contains('confirmado'));
      expect(runtime.message, contains('limpeza'));
      expect(
        runtime.documents.lastSaveOutcome!.receipt!.confirmedBytes,
        await target.length(),
      );
    } finally {
      await runtime.close();
      runtime.dispose();
      await root.delete(recursive: true);
    }
  });
  test('D15 production save displays verified external effect but keeps dirty editor after private cleanup rejection', () async {
    final root = await Directory.systemTemp.createTemp('d15-save-');
    final target = File('${root.path}/actual.recruitproj');
    final io = RetirementFaultIo()..failDirectory = true;
    final runtime = await ProductRuntime.open(
      root,
      (stage, budget) => WindowsDocumentGateway(
        picker: HostPicker(target.path),
        io: HostIo(),
        stagingDirectory: stage,
        budget: budget,
      ),
      fileIo: io,
    );
    try {
      await runtime.create();
      runtime.host!.edit(
        (s) => s.setName('manual confirmed file with cleanup fault'),
      );
      await runtime.saveProject();
      expect(await target.exists(), isTrue);
      expect(
        runtime.session!.hasUnsavedChanges,
        isTrue,
        reason: 'Confirmed native commit is not clean overall save after failed retirement',
      );
      expect(runtime.message, contains('confirmado'));
      expect(runtime.message, contains('limpeza'));
      final receipt = runtime.documents.lastSaveOutcome!.receipt!;
      final bytes = await target.readAsBytes();
      expect(receipt.confirmedBytes, bytes.length);
      expect(receipt.confirmedSha256, sha256.convert(bytes).toString());
      expect(PrivateEffectCustody.retainedCount, 1);
    } finally {
      io.failDirectory = false;
      expect(await PrivateEffectCustody.reap(), isTrue);
      await runtime.close();
      runtime.dispose();
      await root.delete(recursive: true);
    }
  });
}
