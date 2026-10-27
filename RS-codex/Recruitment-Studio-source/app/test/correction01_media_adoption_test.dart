import 'dart:async';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/runtime/product_documents.dart';
import 'package:recruitment_studio/features/documents/document_gateway.dart';
import 'package:recruitment_studio/features/projects/project.dart';
import 'package:recruitment_studio/features/storage/private_effect_custody.dart';
import 'package:recruitment_studio/features/storage/private_file_io.dart';
import 'package:recruitment_studio/shared/admission_budget.dart';
import 'package:recruitment_studio/shared/operation.dart';
import 'package:recruitment_studio/shared/problem.dart';
import 'package:recruitment_studio/shared/work_budget.dart';

import 'features/documents/windows_document_gateway_test.dart'
    show HostIo, HostPicker;

class HeldAdoptionIo extends PrivateFileIo {
  final entered = Completer<void>(), release = Completer<void>();
  RandomAccessFile? actual;
  AdmissionTicket? pressure;
  bool closed = false;
  @override
  Future<void> close(RandomAccessFile handle) async {
    actual = handle;
    if (!entered.isCompleted) entered.complete();
    await release.future;
    await super.close(handle);
    closed = true;
    final ordinary = AdmissionBudget.shared;
    pressure = ordinary.reserve(
      ordinary.capacityBytes - ordinary.reservedBytes,
    );
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test('D28 held actual media close precedes owned-result admission and adoption refusal leaves no hidden consumer or live residual', () async {
    final root = await Directory.systemTemp.createTemp('d28-media-adoption-');
    final source = File('test/fixtures/assets/logo.png').absolute;
    final budget = WorkBudgetController();
    final request = WorkOperation.create();
    final gateway = WindowsDocumentGateway(
      picker: HostPicker(source.path),
      io: HostIo(),
      stagingDirectory: root,
      budget: budget,
    );
    final io = HeldAdoptionIo();
    final documents = ProductDocuments(gateway, root, budget, io: io);
    final retained = PrivateEffectCustody.retainedCount;
    var published = false;
    final importing = documents.media(AssetKind.logo, request).then((result) {
      published = true;
      return result;
    });
    importing.ignore();
    try {
      await io.entered.future;
      expect(published, isFalse);
      expect(await io.actual!.length(), await source.length());
      expect(budget.reservedBytes, 2 * await source.length());
      expect(PrivateEffectCustody.retainedCount, retained + 1);
      io.release.complete();
      await expectLater(importing, throwsA(isA<CapacityExceeded>()));
      expect(io.closed, isTrue);
      expect(published, isFalse);
      expect(budget.reservedBytes, 0);
      expect(PrivateEffectCustody.retainedCount, retained);
      await expectLater(
        io.actual!.length(),
        throwsA(isA<FileSystemException>()),
      );
    } finally {
      if (!io.release.isCompleted) io.release.complete();
      io.pressure?.release();
      await gateway.close();
      await request.finish();
      await root.delete(recursive: true);
    }
  });
}
