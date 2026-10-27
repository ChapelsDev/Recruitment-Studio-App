import 'dart:io';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/features/documents/document_gateway.dart';
import 'package:recruitment_studio/shared/operation.dart';
import 'package:recruitment_studio/shared/problem.dart';

// Transport frontier only: none of these tests are SAF/native proof.
final class MemoryDocuments implements DocumentChannel {
  final methods = <String>[];
  Uint8List data = Uint8List(0);
  bool corrupt = false,
      unreadable = false,
      residual = false,
      closeError = false;
  String? owner;
  @override
  Future<Map<String, Object?>> invoke(
    String method,
    Map<String, Object?> args,
  ) async {
    methods.add(method);
    owner ??= args['operationId'] as String?;
    switch (method) {
      case 'prepareSave':
        return {
          'status': 'prepared',
          'opaqueId': 'native-target',
          'displayName': 'test (1).png',
          'canReadBack': true,
          'ownsReservedPlaceholder': true,
          'providerMayRename': true,
          'operationId': args['operationId'],
        };
      case 'pickOpen':
        return {
          'status': 'picked',
          'opaqueId': 'native-input',
          'displayName': 'input.png',
          'operationId': args['operationId'],
        };
      case 'beginWrite':
        data = Uint8List(0);
        return {'status': 'ready', 'transferId': 'transfer'};
      case 'writeChunk':
        data = Uint8List.fromList([...data, ...args['bytes'] as Uint8List]);
        return {'status': 'ready'};
      case 'writePrepared':
        final expected = sha256.convert(data).toString();
        if (closeError) {
          return {
            'status': 'failed',
            'problem': 'ioFailure',
            'residualPlaceholder': true,
          };
        }
        if (corrupt && data.isNotEmpty) data[0] ^= 1;
        return {
          'status': 'completed',
          'operationId': args['operationId'],
          'opaqueId': 'native-target',
          'displayName': 'test (1).png',
          'confirmedBytes': data.length,
          'confirmedSha256': expected,
        };
      case 'beginRead':
        if (unreadable) {
          return {'status': 'failed', 'problem': 'permissionDenied'};
        }
        return {'status': 'ready', 'transferId': 'read'};
      case 'readChunk':
        final offset = args['offset'] as int;
        final end = (offset + (args['length'] as int)).clamp(0, data.length);
        return {
          'status': 'ready',
          'bytes': Uint8List.sublistView(data, offset, end),
        };
      case 'abortPrepared':
        return {'status': 'aborted', 'residualPlaceholder': residual};
      case 'endRead':
      case 'abortWrite':
      case 'releaseOperation':
        return {'status': 'released'};
    }
    throw StateError('Unexpected method $method');
  }
}

void main() {
  late Directory scratch;
  late File source;
  late Operation op;
  late MemoryDocuments native;
  late AndroidDocumentGateway gateway;
  setUp(() async {
    scratch = await Directory.systemTemp.createTemp('t08-');
    source = await File('${scratch.path}/source').writeAsBytes([1, 2, 3, 4]);
    op = Operation.create();
    native = MemoryDocuments();
    gateway = AndroidDocumentGateway(native, stagingDirectory: scratch);
  });
  tearDown(() async {
    await gateway.close();
    await op.finish();
    await scratch.delete(recursive: true);
  });
  test('closed output is reopened and exact bytes and hash confirmed with effective name', () async {
    final d = (await gateway.prepareSave(
      ['test.png'],
      'image/png',
      operation: op,
    ))!;
    final receipt = await gateway.writePrepared(
      source,
      d,
      'test.png',
      operation: op,
    );
    expect(receipt.status, WriteStatus.completed);
    expect(receipt.operationId, op.id);
    expect(receipt.target!.displayName, 'test (1).png');
    expect(receipt.confirmedBytes, 4);
    expect(receipt.confirmedSha256, sha256.convert([1, 2, 3, 4]).toString());
    expect(
      native.methods.indexOf('beginRead'),
      greaterThan(native.methods.indexOf('writePrepared')),
    );
  });
  test('equal length readback corruption refuses success', () async {
    native.corrupt = true;
    final d = (await gateway.prepareSave(
      ['test.png'],
      'image/png',
      operation: op,
    ))!;
    final r = await gateway.writePrepared(source, d, 'test.png', operation: op);
    expect(r.status, WriteStatus.failed);
    expect(r.confirmedSha256, isNull);
    expect(r.target, isNotNull);
  });
  test('unreadable readback never confirms native asserted success', () async {
    native.unreadable = true;
    final d = (await gateway.prepareSave(
      ['test.png'],
      'image/png',
      operation: op,
    ))!;
    expect(
      (await gateway.writePrepared(
        source,
        d,
        'test.png',
        operation: op,
      )).status,
      WriteStatus.failed,
    );
  });
  test('close error is failed and target remains visible', () async {
    native.closeError = true;
    final d = (await gateway.prepareSave(
      ['test.png'],
      'image/png',
      operation: op,
    ))!;
    final r = await gateway.writePrepared(source, d, 'test.png', operation: op);
    expect(r.status, WriteStatus.failed);
    expect(r.residualPlaceholder, isTrue);
  });
  test('foreign operation cannot write an opaque target', () async {
    final d = (await gateway.prepareSave(
      ['test.png'],
      'image/png',
      operation: op,
    ))!;
    final other = Operation.create();
    try {
      final r = await gateway.writePrepared(
        source,
        d,
        'test.png',
        operation: other,
      );
      expect(r.status, WriteStatus.failed);
      expect(native.methods, isNot(contains('beginWrite')));
    } finally {
      await other.finish();
    }
  });
  test('unapproved name cannot write', () async {
    final d = (await gateway.prepareSave(
      ['test.png'],
      'image/png',
      operation: op,
    ))!;
    expect(
      (await gateway.writePrepared(
        source,
        d,
        'other.png',
        operation: op,
      )).status,
      WriteStatus.failed,
    );
    expect(native.methods, isNot(contains('beginWrite')));
  });
  test(
    'cancel before commit does not write and reports residual placeholder',
    () async {
      final d = (await gateway.prepareSave(
        ['test.png'],
        'image/png',
        operation: op,
      ))!;
      native.residual = true;
      op.cancel();
      final r = await gateway.writePrepared(
        source,
        d,
        'test.png',
        operation: op,
      );
      expect(r.status, WriteStatus.cancelled);
      expect(r.residualPlaceholder, isTrue);
      expect(native.methods, isNot(contains('writePrepared')));
    },
  );
  test('stage read applies real bytes limit not provider metadata', () async {
    native.data = Uint8List.fromList([1, 2, 3, 4]);
    final ref = (await gateway.pickOpen({'image/png'}, operation: op))!;
    await expectLater(
      gateway.stageRead(ref, 3, operation: op),
      throwsA(isA<CapacityExceeded>()),
    );
    expect(scratch.listSync().whereType<File>().length, 1);
  });
  test('stage read is private and owned by operation until finish', () async {
    native.data = Uint8List.fromList([8, 9]);
    final ref = (await gateway.pickOpen({'image/png'}, operation: op))!;
    final file = await gateway.stageRead(ref, 2, operation: op);
    expect(await file.readAsBytes(), [8, 9]);
    expect(file.path, isNot(contains('input.png')));
    await op.finish();
    expect(await file.exists(), isFalse);
  });
  test(
    'multi image capability explicitly offers ZIP without launching picker',
    () async {
      await expectLater(
        gateway.prepareSave(['a.png', 'b.png'], 'image/png', operation: op),
        throwsA(
          isA<DocumentGatewayException>().having(
            (e) => e.problem.actionLabel,
            'alternative',
            'Exportar ZIP',
          ),
        ),
      );
      expect(native.methods, isEmpty);
    },
  );
  test('replacement is refused even with consent because original preservation unavailable', () async {
    final ref = (await gateway.pickOpen({'image/png'}, operation: op))!;
    await expectLater(
      gateway.prepareSave(
        ['test.png'],
        'image/png',
        operation: op,
        replace: ref,
        overwriteApproved: true,
      ),
      throwsA(
        isA<DocumentGatewayException>().having(
          (e) => e.problem.actionLabel,
          'copy',
          'Guardar uma cópia',
        ),
      ),
    );
    expect(native.methods, isNot(contains('prepareSave')));
  });
  test('abort exposes undeletable placeholder instead of hiding it', () async {
    native.residual = true;
    final d = (await gateway.prepareSave(
      ['test.png'],
      'image/png',
      operation: op,
    ))!;
    await expectLater(
      gateway.abortPrepared(d, operation: op),
      throwsA(
        isA<DocumentGatewayException>().having(
          (e) => e.residualPlaceholder,
          'residual',
          true,
        ),
      ),
    );
  });
}
