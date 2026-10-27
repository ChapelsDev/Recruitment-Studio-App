import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/runtime/product_documents.dart';
import 'package:recruitment_studio/features/documents/document_gateway.dart';
import 'package:recruitment_studio/features/editor/editor_session.dart';
import 'package:recruitment_studio/features/projects/project.dart';
import 'package:recruitment_studio/features/storage/private_file_io.dart';
import 'package:recruitment_studio/features/storage/private_effect_custody.dart';
import 'package:recruitment_studio/features/storage/project_codec.dart';
import 'package:recruitment_studio/features/projects/project_bundle.dart';
import 'package:recruitment_studio/shared/operation.dart';
import 'package:recruitment_studio/shared/work_budget.dart';

import 'features/documents/windows_document_gateway_test.dart'
    show HostIo, HostPicker;

class RetirementFaultIo extends PrivateFileIo {
  bool failClose = false, failDirectory = false;
  RandomAccessFile? held;
  Directory? remaining;
  @override
  Future<RandomAccessFile> open(
    File file, {
    FileMode mode = FileMode.read,
  }) async => held = await super.open(file, mode: mode);
  @override
  Future<void> close(RandomAccessFile handle) async {
    if (failClose) {
      throw const FileSystemException('held real handle', '/private/source');
    }
    await super.close(handle);
  }

  @override
  Future<void> deleteDirectory(Directory directory) async {
    remaining = directory;
    if (failDirectory) {
      throw const FileSystemException('owned directory held', '/private/stage');
    }
    await super.deleteDirectory(directory);
  }
}

class EncoderIdentity implements ProjectCodec {
  EncoderIdentity(this.real);
  final ZipProjectCodec real;
  Operation? seen;
  @override
  Future<void> encode(
    ProjectBundle bundle,
    File output, {
    Operation? operation,
  }) {
    seen = operation;
    return real.encode(bundle, output, operation: operation);
  }

  @override
  Future<ProjectBundle> decode(File input, {Operation? operation}) =>
      real.decode(input, operation: operation);
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test('D12 media source close failure retires unpublished owned result but retains actual handle payment', () async {
    final root = await Directory.systemTemp.createTemp('d12-media-');
    final budget = WorkBudgetController();
    final request = WorkOperation.create();
    final source = File('test/fixtures/assets/logo.png').absolute;
    final length = await source.length();
    final gateway = WindowsDocumentGateway(
      picker: HostPicker(source.path),
      io: HostIo(),
      stagingDirectory: root,
      budget: budget,
    );
    final io = RetirementFaultIo()..failClose = true;
    final documents = ProductDocuments(gateway, root, budget, io: io);
    try {
      await expectLater(
        documents.media(AssetKind.logo, request),
        throwsA(isA<Exception>()),
      );
      expect(
        await io.held!.length(),
        length,
        reason: 'The failed close really leaves a live descriptor',
      );
      expect(
        budget.reservedBytes,
        2 * length,
        reason: 'Only unclosed source temporary credit remains; unpublished result must be released',
      );
      expect(PrivateEffectCustody.retainedCount, 1);
    } finally {
      io.failClose = false;
      expect(await PrivateEffectCustody.reap(), isTrue);
      expect(budget.reservedBytes, 0);
      await gateway.close();
      await request.finish();
      await root.delete(recursive: true);
    }
  });
  test('D14 editable encoder uses literal native prepared request and never finishes supplied caller', () async {
    final root = await Directory.systemTemp.createTemp('d14-identity-');
    final budget = WorkBudgetController();
    final request = WorkOperation.create();
    final gateway = WindowsDocumentGateway(
      picker: HostPicker('${root.path}/chosen.recruitproj'),
      io: HostIo(),
      stagingDirectory: root,
      budget: budget,
    );
    final encoder = EncoderIdentity(ZipProjectCodec(budget: budget));
    final documents = ProductDocuments(gateway, root, budget, encoder: encoder);
    final session = EditorSession(Project.blank(id: 'manual'), budget: budget);
    final snapshot = session.captureSnapshot();
    try {
      final receipt = await documents.save(snapshot, request);
      expect(receipt!.status, WriteStatus.completed);
      expect(identical(encoder.seen, request), isTrue);
      expect(request.isFinishing, isFalse);
    } finally {
      snapshot.release();
      session.dispose();
      await gateway.close();
      await request.finish();
      await root.delete(recursive: true);
    }
  });
  test('D13 verified editable receipt survives later private stage deletion rejection', () async {
    final root = await Directory.systemTemp.createTemp('d13-receipt-');
    final budget = WorkBudgetController();
    final request = WorkOperation.create();
    final target = File('${root.path}/chosen.recruitproj');
    final gateway = WindowsDocumentGateway(
      picker: HostPicker(target.path),
      io: HostIo(),
      stagingDirectory: root,
      budget: budget,
    );
    final io = RetirementFaultIo()..failDirectory = true;
    final documents = ProductDocuments(gateway, root, budget, io: io);
    final session = EditorSession(Project.blank(id: 'manual'), budget: budget);
    final snapshot = session.captureSnapshot();
    WriteReceipt? receipt;
    try {
      try {
        receipt = await documents.save(snapshot, request);
      } catch (_) {}
      expect(await target.exists(), isTrue);
      expect(
        receipt,
        isNotNull,
        reason: 'Cleanup vetoes clean success, never the actual verified external effect',
      );
      expect(receipt!.status, WriteStatus.completed);
      expect(receipt.confirmedBytes, await target.length());
      expect(documents.lastSaveOutcome!.clean, isFalse);
      expect(documents.lastSaveOutcome!.residual, isTrue);
      expect(PrivateEffectCustody.retainedCount, 1);
    } finally {
      io.failDirectory = false;
      expect(await PrivateEffectCustody.reap(), isTrue);
      snapshot.release();
      session.dispose();
      await gateway.close();
      await request.finish();
      await root.delete(recursive: true);
    }
  });
}
