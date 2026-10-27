import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/features/documents/document_gateway.dart';
import 'package:recruitment_studio/features/editor/editor_session.dart';
import 'package:recruitment_studio/features/projects/project.dart';
import 'package:recruitment_studio/features/storage/project_codec.dart';
import 'package:recruitment_studio/runtime/product_documents.dart';
import 'package:recruitment_studio/shared/operation.dart';
import 'package:recruitment_studio/shared/admission_budget.dart';
import 'package:recruitment_studio/shared/problem.dart';
import 'package:recruitment_studio/shared/work_budget.dart';

class ReadChannel implements DocumentChannel {
  ReadChannel(this.bytes);
  final Uint8List bytes;
  final List<String> methods = [];
  final List<String> roots = [];
  final entered = Completer<void>();
  Completer<void>? release;
  bool fault = false;
  bool writeFault = false;
  @override
  Future<Map<String, Object?>> invoke(
    String method,
    Map<String, Object?> args,
  ) async {
    methods.add(method);
    roots.add(args['operationId'] as String);
    switch (method) {
      case 'pickOpen':
        return {
          'status': 'picked',
          'operationId': args['operationId'],
          'opaqueId': 'real-source',
          'displayName': 'input.recruitproj',
        };
      case 'prepareSave':
        return {
          'status': 'prepared',
          'operationId': args['operationId'],
          'opaqueId': 'real-destination',
          'displayName': 'copy.recruitproj',
          'canReadBack': true,
          'ownsReservedPlaceholder': true,
        };
      case 'beginWrite':
        return {'status': 'ready', 'transferId': 'real-write'};
      case 'writeChunk':
        return {'status': 'ready'};
      case 'writePrepared':
        if (writeFault) {
          return {'status': 'failed', 'problem': 'permissionDenied'};
        }
        throw StateError('Write fixture requires fault');
      case 'beginRead':
        return {'status': 'ready', 'transferId': 'real-read'};
      case 'readChunk':
        final offset = args['offset'] as int;
        final end = (offset + (args['length'] as int)).clamp(0, bytes.length);
        return {
          'status': 'ready',
          'bytes': Uint8List.sublistView(bytes, offset, end),
        };
      case 'endRead':
        return {'status': 'closed'};
      case 'abortPrepared':
        return {'status': 'aborted', 'commitState': 'reserved'};
      case 'abortWrite':
        if (!entered.isCompleted) entered.complete();
        await release?.future;
        if (fault) {
          throw const FileSystemException('private://secret/provider/path');
        }
        return {'status': 'released'};
      default:
        throw StateError('Unexpected native call: $method');
    }
  }
}

Future<(Directory, WorkBudgetController, File, ReadChannel)> fixture() async {
  final dir = await Directory.systemTemp.createTemp('read-retirement01-');
  final budget = WorkBudgetController();
  final setup = EditorSession(Project.blank(id: 'prepared'), budget: budget);
  final file = File('${dir.path}/input.recruitproj');
  try {
    await ZipProjectCodec(budget: budget).encode(setup.bundle, file);
  } finally {
    setup.dispose();
  }
  return (dir, budget, file, ReadChannel(await file.readAsBytes()));
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test('R01 ProductDocuments open observes literal caller root drain before publication', () async {
    final (dir, budget, source, channel) = await fixture();
    final request = WorkOperation.create();
    final unrelated = Completer<void>();
    request.registerPending(unrelated.future);
    final gateway = AndroidDocumentGateway(
      channel,
      stagingDirectory: dir,
      budget: budget,
    );
    final documents = ProductDocuments(gateway, dir, budget);
    EditorSession? decoded;
    var published = false;
    final opening = documents.open(request).then((value) {
      published = true;
      decoded = value;
      return value;
    });
    opening.ignore();
    try {
      await Future<void>.delayed(const Duration(milliseconds: 500));
      expect(
        published,
        isFalse,
        reason: 'A child decode escapes actual root pending custody',
      );
      expect(request.isFinishing, isFalse);
      unrelated.complete();
      decoded = await opening.timeout(const Duration(seconds: 5));
      expect(decoded, isNotNull);
      expect(channel.roots.every((id) => id == request.id), isTrue);
      expect(source.existsSync(), isTrue);
      expect(request.isFinishing, isFalse);
    } finally {
      if (!unrelated.isCompleted) unrelated.complete();
      request.cancel();
      await gateway.close();
      try {
        await opening;
      } catch (_) {}
      decoded?.dispose();
      await request.finish();
      await dir.delete(recursive: true);
    }
  });
  test('R02 genuine held Android release pays tail and blocks root codec without deleting stage', () async {
    final (dir, budget, source, channel) = await fixture();
    final request = WorkOperation.create();
    final gateway = AndroidDocumentGateway(
      channel,
      stagingDirectory: dir,
      budget: budget,
    );
    final ref = (await gateway.pickOpen({
      'application/zip',
    }, operation: request))!;
    final staged = await gateway.stageRead(
      ref,
      24 * 1024 * 1024,
      operation: request,
    );
    await Future<void>.delayed(Duration.zero);
    final paid = AdmissionBudget.shared.reservedBytes;
    final copy = budget.reservedBytes;
    channel.release = Completer<void>();
    final retiring = gateway.retireOpen(ref, operation: request);
    retiring.ignore();
    var published = false;
    final decoding = ZipProjectCodec(budget: budget)
        .decodeEditorSession(staged, operation: request)
        .then((value) {
          published = true;
          return value;
        });
    decoding.ignore();
    EditorSession? decoded;
    try {
      await channel.entered.future;
      expect(
        AdmissionBudget.shared.reservedBytes,
        greaterThanOrEqualTo(paid + 256 * 1024),
      );
      expect(budget.reservedBytes, greaterThanOrEqualTo(copy + 512 * 1024));
      expect(request.isFinishing, isFalse);
      expect(staged.existsSync(), isTrue);
      expect(await staged.readAsBytes(), await source.readAsBytes());
      await Future<void>.delayed(const Duration(milliseconds: 300));
      expect(published, isFalse);
      final calls = channel.methods.length;
      await expectLater(
        gateway.retireOpen(ref, operation: request),
        throwsA(isA<DocumentGatewayException>()),
      );
      expect(channel.methods.length, calls);
      channel.release!.complete();
      await retiring;
      decoded = await decoding.timeout(const Duration(seconds: 5));
      expect(decoded.bundle.project.id, 'prepared');
      expect(request.isFinishing, isFalse);
      expect(staged.existsSync(), isTrue);
      await expectLater(
        gateway.retireOpen(ref, operation: request),
        throwsA(isA<DocumentGatewayException>()),
      );
    } finally {
      if (!channel.release!.isCompleted) channel.release!.complete();
      request.cancel();
      await gateway.close();
      try {
        decoded ??= await decoding;
      } catch (_) {}
      decoded?.dispose();
      await request.finish();
      expect(staged.existsSync(), isFalse);
      expect(source.existsSync(), isTrue);
      await dir.delete(recursive: true);
    }
  });
  test('R03 failed release retains paid identity and root publication barrier until real close tail', () async {
    final (dir, budget, source, channel) = await fixture();
    final request = WorkOperation.create();
    final gateway = AndroidDocumentGateway(
      channel,
      stagingDirectory: dir,
      budget: budget,
    );
    final ref = (await gateway.pickOpen({
      'application/zip',
    }, operation: request))!;
    final staged = await gateway.stageRead(
      ref,
      24 * 1024 * 1024,
      operation: request,
    );
    await Future<void>.delayed(Duration.zero);
    final paid = AdmissionBudget.shared.reservedBytes;
    channel.fault = true;
    try {
      await expectLater(
        gateway.retireOpen(ref, operation: request),
        throwsA(
          isA<DocumentGatewayException>().having(
            (e) => e.toString(),
            'sanitized',
            isNot(contains('private://')),
          ),
        ),
      );
      await Future<void>.delayed(Duration.zero);
      expect(AdmissionBudget.shared.reservedBytes, paid);
      expect(budget.reservedBytes, 0);
      var drained = false;
      request.afterPending(() {
        drained = true;
      });
      await Future<void>.delayed(const Duration(milliseconds: 100));
      expect(drained, isFalse);
      expect(staged.existsSync(), isTrue);
      channel.fault = false;
      channel.release = Completer<void>();
      final closing = gateway.close();
      expect(identical(closing, gateway.close()), isTrue);
      await Future<void>.delayed(const Duration(milliseconds: 100));
      expect(drained, isFalse);
      expect(AdmissionBudget.shared.reservedBytes, greaterThanOrEqualTo(32768));
      channel.release!.complete();
      await closing.timeout(const Duration(seconds: 2));
      await Future<void>.delayed(Duration.zero);
      expect(drained, isTrue);
      expect(AdmissionBudget.shared.reservedBytes, lessThan(paid));
      expect(staged.existsSync(), isTrue);
      await request.finish();
      expect(staged.existsSync(), isFalse);
      expect(source.existsSync(), isTrue);
    } finally {
      if (channel.release != null && !channel.release!.isCompleted) {
        channel.release!.complete();
      }
      channel.fault = false;
      await gateway.close();
      await request.finish();
      await dir.delete(recursive: true);
    }
  });
  test('R04 finishing during held failed retirement settles error without forgetting native custody', () async {
    final (dir, budget, source, channel) = await fixture();
    final request = WorkOperation.create();
    final gateway = AndroidDocumentGateway(
      channel,
      stagingDirectory: dir,
      budget: budget,
    );
    final ref = (await gateway.pickOpen({
      'application/zip',
    }, operation: request))!;
    final staged = await gateway.stageRead(
      ref,
      24 * 1024 * 1024,
      operation: request,
    );
    await Future<void>.delayed(Duration.zero);
    channel.release = Completer<void>();
    channel.fault = true;
    final retiring = gateway.retireOpen(ref, operation: request);
    retiring.ignore();
    await channel.entered.future;
    var finished = false;
    final finishing = request.finish().whenComplete(() {
      finished = true;
    });
    finishing.ignore();
    await Future<void>.delayed(const Duration(milliseconds: 100));
    expect(finished, isFalse);
    expect(staged.existsSync(), isTrue);
    channel.release!.complete();
    await expectLater(
      retiring.timeout(const Duration(seconds: 2)),
      throwsA(isA<DocumentGatewayException>()),
    );
    await expectLater(
      finishing.timeout(const Duration(seconds: 2)),
      throwsA(isA<OperationException>()),
    );
    expect(budget.reservedBytes, 0);
    expect(source.existsSync(), isTrue);
    final retained = AdmissionBudget.shared.reservedBytes;
    // Root's records may retire, but the actual unresolved native identity does not.
    expect(retained, greaterThanOrEqualTo(32768));
    channel.fault = false;
    await gateway.close();
    expect(
      AdmissionBudget.shared.reservedBytes,
      lessThanOrEqualTo(retained - 32768),
    );
    await dir.delete(recursive: true);
  });
  test('R05 cancellation and concurrent close join real open retirement before terminal refusal', () async {
    final (dir, budget, source, channel) = await fixture();
    final request = WorkOperation.create();
    final gateway = AndroidDocumentGateway(
      channel,
      stagingDirectory: dir,
      budget: budget,
    );
    channel.release = Completer<void>();
    var terminal = false;
    final opening = ProductDocuments(gateway, dir, budget)
        .open(request)
        .whenComplete(() {
          terminal = true;
        });
    opening.ignore();
    await channel.entered.future;
    request.cancel();
    final closing = gateway.close();
    expect(identical(closing, gateway.close()), isTrue);
    final finishing = request.finish();
    finishing.ignore();
    await Future<void>.delayed(const Duration(milliseconds: 100));
    expect(terminal, isFalse);
    expect(budget.reservedBytes, 512 * 1024);
    expect(source.existsSync(), isTrue);
    channel.release!.complete();
    await expectLater(
      opening.timeout(const Duration(seconds: 2)),
      throwsA(isA<OperationException>()),
    );
    await closing.timeout(const Duration(seconds: 2));
    await finishing.timeout(const Duration(seconds: 2));
    expect(channel.methods.where((m) => m == 'abortWrite').length, 1);
    expect(budget.reservedBytes, 0);
    expect(source.existsSync(), isTrue);
    await dir.delete(recursive: true);
  });
  test('R06 foreign gateway wrong root consumed and unsupported adapter reject before native effects', () async {
    final (dir, budget, source, channel) = await fixture();
    final request = WorkOperation.create();
    final other = WorkOperation.create();
    final gateway = AndroidDocumentGateway(
      channel,
      stagingDirectory: dir,
      budget: budget,
    );
    final foreignChannel = ReadChannel(channel.bytes);
    final foreign = AndroidDocumentGateway(
      foreignChannel,
      stagingDirectory: dir,
      budget: budget,
    );
    final ref = (await gateway.pickOpen({
      'application/zip',
    }, operation: request))!;
    final calls = channel.methods.length;
    await expectLater(
      gateway.retireOpen(ref, operation: other),
      throwsA(isA<DocumentGatewayException>()),
    );
    await expectLater(
      foreign.retireOpen(ref, operation: request),
      throwsA(isA<DocumentGatewayException>()),
    );
    await expectLater(
      UnsupportedGateway().retireOpen(ref, operation: request),
      throwsA(isA<DocumentGatewayException>()),
    );
    expect(channel.methods.length, calls);
    expect(foreignChannel.methods, isEmpty);
    await gateway.retireOpen(ref, operation: request);
    final released = channel.methods.length;
    await expectLater(
      gateway.retireOpen(ref, operation: request),
      throwsA(isA<DocumentGatewayException>()),
    );
    expect(channel.methods.length, released);
    await gateway.close();
    await expectLater(
      gateway.retireOpen(ref, operation: request),
      throwsA(isA<DocumentGatewayException>()),
    );
    await foreign.close();
    await request.finish();
    await other.finish();
    expect(source.existsSync(), isTrue);
    await dir.delete(recursive: true);
  });
  test('R07 ordinary and copy admission refusal retains authentic capability for paid close', () async {
    final (dir, budget, source, channel) = await fixture();
    final request = WorkOperation.create();
    final gateway = AndroidDocumentGateway(
      channel,
      stagingDirectory: dir,
      budget: budget,
    );
    final ref = (await gateway.pickOpen({
      'application/zip',
    }, operation: request))!;
    final staged = await gateway.stageRead(
      ref,
      24 * 1024 * 1024,
      operation: request,
    );
    await Future<void>.delayed(Duration.zero);
    final paid = AdmissionBudget.shared.reservedBytes;
    final calls = channel.methods.length;
    final pressure = AdmissionBudget.shared.reserve(
      AdmissionBudget.shared.capacityBytes - paid,
    );
    try {
      await expectLater(
        gateway.retireOpen(ref, operation: request),
        throwsA(isA<CapacityExceeded>()),
      );
      expect(channel.methods.length, calls);
      expect(staged.existsSync(), isTrue);
    } finally {
      pressure.release();
    }
    final copyPressure = budget.reserveCopy(budget.capacityBytes);
    try {
      await expectLater(
        gateway.retireOpen(ref, operation: request),
        throwsA(isA<CapacityExceeded>()),
      );
      expect(channel.methods.length, calls);
      expect(AdmissionBudget.shared.reservedBytes, paid + 1024);
    } finally {
      copyPressure.release();
    }
    await gateway.retireOpen(ref, operation: request);
    expect(AdmissionBudget.shared.reservedBytes, lessThan(paid));
    expect(staged.existsSync(), isTrue);
    await gateway.close();
    await request.finish();
    expect(staged.existsSync(), isFalse);
    expect(source.existsSync(), isTrue);
    await dir.delete(recursive: true);
  });
  test('R08 retained destination ref cannot be retired as a source and first write cause survives', () async {
    final (dir, budget, source, channel) = await fixture();
    final request = WorkOperation.create();
    final gateway = AndroidDocumentGateway(
      channel,
      stagingDirectory: dir,
      budget: budget,
    );
    final destination = (await gateway.prepareSave(
      ['copy.recruitproj'],
      'application/zip',
      operation: request,
    ))!;
    channel.writeFault = true;
    channel.fault = true;
    final receipt = await gateway.writePrepared(
      source,
      destination,
      'copy.recruitproj',
      operation: request,
    );
    expect(receipt.status, WriteStatus.failed);
    expect(receipt.problem!.code, ProblemCode.permissionDenied);
    expect(receipt.residualPlaceholder, isTrue);
    expect(receipt.target, isNotNull);
    final calls = channel.methods.length;
    await expectLater(
      gateway.retireOpen(receipt.target!, operation: request),
      throwsA(isA<DocumentGatewayException>()),
    );
    expect(channel.methods.length, calls);
    channel.fault = false;
    await gateway.close();
    await request.finish();
    expect(source.existsSync(), isTrue);
    await dir.delete(recursive: true);
  });
  test('R09 cancelled failed retirement lets caller finish fail finitely without losing native identity', () async {
    final (dir, budget, source, channel) = await fixture();
    final request = WorkOperation.create();
    final gateway = AndroidDocumentGateway(
      channel,
      stagingDirectory: dir,
      budget: budget,
    );
    channel.release = Completer<void>();
    channel.fault = true;
    final opening = ProductDocuments(gateway, dir, budget).open(request);
    opening.ignore();
    await channel.entered.future;
    request.cancel();
    channel.release!.complete();
    await expectLater(
      opening.timeout(const Duration(seconds: 2)),
      throwsA(
        isA<DocumentGatewayException>().having(
          (e) => e.problem.code,
          'first finite cause',
          ProblemCode.ioFailure,
        ),
      ),
    );
    final finishing = request.finish();
    finishing.ignore();
    try {
      await expectLater(
        finishing.timeout(const Duration(milliseconds: 300)),
        throwsA(isA<OperationException>()),
      );
      expect(budget.reservedBytes, 0);
      expect(AdmissionBudget.shared.reservedBytes, greaterThanOrEqualTo(32768));
      expect(source.existsSync(), isTrue);
    } finally {
      channel.fault = false;
      await gateway.close();
      try {
        await finishing;
      } catch (_) {}
      await dir.delete(recursive: true);
    }
  });
  test('R10 persistent native release fault is not successful close or root completion', () async {
    final (dir, budget, source, channel) = await fixture();
    final request = WorkOperation.create();
    final gateway = AndroidDocumentGateway(
      channel,
      stagingDirectory: dir,
      budget: budget,
    );
    channel.fault = true;
    await expectLater(
      ProductDocuments(gateway, dir, budget).open(request),
      throwsA(
        isA<DocumentGatewayException>().having(
          (e) => e.toString(),
          'finite privacy guard',
          isNot(contains('secret')),
        ),
      ),
    );
    expect(budget.reservedBytes, 0);
    var clean = false;
    final closing = gateway.close().then((_) {
      clean = true;
    });
    closing.ignore();
    await expectLater(
      closing.timeout(const Duration(seconds: 2)),
      throwsA(isA<DocumentGatewayException>()),
    );
    expect(clean, isFalse);
    await expectLater(
      request.finish().timeout(const Duration(seconds: 2)),
      throwsA(isA<OperationException>()),
    );
    expect(channel.methods.where((m) => m == 'abortWrite').length, 2);
    expect(AdmissionBudget.shared.reservedBytes, greaterThanOrEqualTo(32768));
    expect(source.existsSync(), isTrue);
    // Persistent failure intentionally retains the paid native key/control.
    // This boundary double owns no OS descriptor; no success or refund is claimed.
    await dir.delete(recursive: true);
  });
}

class UnsupportedGateway implements DocumentGateway {
  @override
  dynamic noSuchMethod(Invocation invocation) =>
      throw StateError('Unsupported adapter must not be invoked');
}
