import 'dart:io';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/features/documents/document_gateway.dart';
import 'package:recruitment_studio/shared/operation.dart';

// Portable frontiers with real host bytes. NOT Win32 or picker evidence.
final class HostPicker implements WindowsDocumentPicker {
  HostPicker(this.path);
  String? path;
  @override
  Future<String?> open(Set<String> mimes) async => path;
  @override
  Future<String?> save(String name, String mime) async => path;
}

final class HostIo implements WindowsDocumentIo {
  final Map<String, File> temporary = {};
  bool corrupt = false,
      closeFails = false,
      denyRead = false,
      lateCollision = false;
  int writes = 0;
  @override
  Future<bool> exists(String path) async =>
      FileSystemEntity.typeSync(path, followLinks: false) !=
      FileSystemEntityType.notFound;
  @override
  Future<String> createTemporary(String destination) async {
    final id = 'temp-${temporary.length}';
    temporary[id] = await File('$destination.$id').create();
    return id;
  }

  @override
  Future<void> append(String id, Uint8List bytes) async {
    writes++;
    await temporary[id]!.writeAsBytes(
      bytes,
      mode: FileMode.append,
      flush: true,
    );
  }

  @override
  Future<void> closeOutput(String id) async {
    if (closeFails) throw const FileSystemException('controlled close error');
  }

  @override
  Future<void> publishNew(String id, String destination) async {
    if (lateCollision) await File(destination).writeAsBytes([99]);
    if (await exists(destination)) {
      throw const FileSystemException('controlled collision');
    }
    await temporary[id]!.rename(destination);
    temporary[id] = File(destination);
    if (corrupt) await File(destination).writeAsBytes([4, 3, 2, 1]);
  }

  @override
  Future<WindowsDocumentRead> openRead(String path) async {
    if (denyRead) throw const FileSystemException('controlled permission');
    return HostRead(await File(path).open());
  }

  @override
  Future<String> temporaryPath(String id) async => temporary[id]!.path;
  @override
  Future<void> discardTemporary(String id) async {
    final file = temporary.remove(id);
    if (file != null && file.path.contains('.temp-') && await file.exists()) {
      await file.delete();
    }
  }

  @override
  Future<void> forget(String id) async {
    temporary.remove(id);
  }
}

final class HostRead implements WindowsDocumentRead {
  HostRead(this.file);
  final RandomAccessFile file;
  @override
  Future<Uint8List> read(int maximum) => file.read(maximum);
  @override
  Future<void> close() => file.close();
}

void main() {
  late Directory root;
  late File source;
  late Operation op;
  late HostIo io;
  late WindowsDocumentGateway gateway;
  late String path;
  setUp(() async {
    root = await Directory.systemTemp.createTemp('t08-windows-');
    source = await File('${root.path}/source').writeAsBytes([1, 2, 3, 4]);
    path = '${root.path}/test.png';
    op = Operation.create();
    io = HostIo();
    gateway = WindowsDocumentGateway(
      picker: HostPicker(path),
      io: io,
      stagingDirectory: root,
    );
  });
  tearDown(() async {
    await gateway.close();
    await op.finish();
    await root.delete(recursive: true);
  });
  test('new file publishes only after closed staging readback and reopens final bytes', () async {
    final d = (await gateway.prepareSave(
      ['test.png'],
      'image/png',
      operation: op,
    ))!;
    expect(d.ownsReservedPlaceholder, isFalse);
    final r = await gateway.writePrepared(source, d, 'test.png', operation: op);
    expect(r.status, WriteStatus.completed);
    expect(r.confirmedBytes, 4);
    expect(r.confirmedSha256, sha256.convert([1, 2, 3, 4]).toString());
    expect(await File(path).readAsBytes(), [1, 2, 3, 4]);
  });
  test('existing original is refused without opening output', () async {
    await File(path).writeAsBytes([99]);
    await expectLater(
      gateway.prepareSave(['test.png'], 'image/png', operation: op),
      throwsA(isA<DocumentGatewayException>()),
    );
    expect(await File(path).readAsBytes(), [99]);
    expect(io.writes, 0);
  });
  test('late collision is preserved and never overwritten', () async {
    final d = (await gateway.prepareSave(
      ['test.png'],
      'image/png',
      operation: op,
    ))!;
    io.lateCollision = true;
    expect(
      (await gateway.writePrepared(
        source,
        d,
        'test.png',
        operation: op,
      )).status,
      WriteStatus.failed,
    );
    expect(await File(path).readAsBytes(), [99]);
  });
  test('same length corruption after promotion refuses success', () async {
    final d = (await gateway.prepareSave(
      ['test.png'],
      'image/png',
      operation: op,
    ))!;
    io.corrupt = true;
    final r = await gateway.writePrepared(source, d, 'test.png', operation: op);
    expect(r.status, WriteStatus.failed);
    expect(r.target, isNotNull);
    expect(r.confirmedSha256, isNull);
  });
  test('close failure leaves new destination unpublished', () async {
    final d = (await gateway.prepareSave(
      ['test.png'],
      'image/png',
      operation: op,
    ))!;
    io.closeFails = true;
    expect(
      (await gateway.writePrepared(
        source,
        d,
        'test.png',
        operation: op,
      )).status,
      WriteStatus.failed,
    );
    expect(await File(path).exists(), isFalse);
  });
  test('cancelled picker never creates output', () async {
    final g = WindowsDocumentGateway(
      picker: HostPicker(null),
      io: io,
      stagingDirectory: root,
    );
    expect(
      await g.prepareSave(['test.png'], 'image/png', operation: op),
      isNull,
    );
    await g.close();
    expect(io.writes, 0);
  });
  test('foreign destination operation never writes', () async {
    final d = (await gateway.prepareSave(
      ['test.png'],
      'image/png',
      operation: op,
    ))!;
    final other = Operation.create();
    try {
      expect(
        (await gateway.writePrepared(
          source,
          d,
          'test.png',
          operation: other,
        )).status,
        WriteStatus.failed,
      );
    } finally {
      await other.finish();
    }
    expect(io.writes, 0);
  });
  test('open stages bounded bytes without changing picked original', () async {
    await File(path).writeAsBytes([7, 8]);
    final ref = (await gateway.pickOpen({'image/png'}, operation: op))!;
    final staged = await gateway.stageRead(ref, 2, operation: op);
    expect(await staged.readAsBytes(), [7, 8]);
    await op.finish();
    expect(await staged.exists(), isFalse);
    expect(await File(path).readAsBytes(), [7, 8]);
  });
}
