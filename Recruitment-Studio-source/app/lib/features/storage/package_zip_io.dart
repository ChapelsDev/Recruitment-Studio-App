import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import 'package:archive/archive.dart';

import '../../shared/operation.dart';
import '../../shared/admission_budget.dart';
import '../../shared/problem.dart';
import '../../shared/work_limits.dart';

final class PackageFailure implements Exception {
  const PackageFailure(this.reason);
  final String reason;
  @override
  String toString() => 'Invalid project package: $reason';
}

void packageCheckOperation(WorkOperation op) {
  op.throwIfCancelled();
  if (op.isFinishing) {
    throw const OperationException(ProblemCode.operationCancelled);
  }
}

void requireRegularPath(File file, {bool absent = false}) {
  final type = FileSystemEntity.typeSync(
    file.absolute.path,
    followLinks: false,
  );
  if (type !=
      (absent ? FileSystemEntityType.notFound : FileSystemEntityType.file)) {
    throw const PackageFailure('regular private file required');
  }
  var parent = file.absolute.parent;
  while (true) {
    if (FileSystemEntity.typeSync(parent.path, followLinks: false) !=
        FileSystemEntityType.directory) {
      throw const PackageFailure('linked or missing ancestor');
    }
    final next = parent.parent;
    if (next.path == parent.path) {
      break;
    }
    parent = next;
  }
}

final class PackageZipEntry {
  const PackageZipEntry({
    required this.name,
    required this.offset,
    required this.compressedSize,
    required this.expandedSize,
    required this.crc32,
    required this.method,
  });
  final String name;
  final int offset, compressedSize, expandedSize, crc32, method;
  double get compressionRatio =>
      expandedSize / (compressedSize == 0 ? 1 : compressedSize);
}

final class ZipContainer {
  ZipContainer(
    Map<String, PackageZipEntry> entries,
    this.expandedBytes,
    this.maxCompressedEntry,
  ) : entries = _boundedEntries(entries);
  static Map<String, PackageZipEntry> _boundedEntries(Map<String, PackageZipEntry> entries) {
    if (entries.length > WorkLimits.packageEntries) { throw const CapacityExceeded(); }
    for (final entry in entries.entries) {
      if (entry.key.length > 75 || entry.value.name.length > 75) {
        throw const CapacityExceeded();
      }
    }
    final ticket = AdmissionBudget.shared.reserve(16 * 1024);
    try {
      final result = Map<String, PackageZipEntry>.unmodifiable(entries);
      ticket.retain(result); return result;
    } catch (_) { ticket.release(); rethrow; }
  }
  final Map<String, PackageZipEntry> entries;
  final int expandedBytes, maxCompressedEntry;
}

/// Narrow ZIP32 profile. Random-access headers are at most 121 bytes; never
/// construct an archive object or normalize an attacker-controlled filename.
abstract final class PackageZipIO {
  static final _asset = RegExp(r'^assets/[0-9a-f]{64}\.(jpg|png)$');
  static Future<ZipContainer> readIndex(
    File file, {
    required WorkOperation operation,
    void Function(String)? onPhase,
  }) async {
    packageCheckOperation(operation);
    requireRegularPath(file);
    final drained = Completer<void>();
    final ordinary = AdmissionBudget.shared.reserve(64 * 1024);
    try { operation.registerPending(drained.future); }
    catch (_) { ordinary.release(); rethrow; }
    RandomAccessFile? handle;
    try {
      handle = await file.open();
      final size = await handle.length();
      if (size > WorkLimits.projectCompressedBytes) {
        throw const CapacityExceeded();
      }
      Future<Uint8List> read(int offset, int count) async {
        packageCheckOperation(operation);
        if (offset < 0 || count < 0 || offset > size - count) {
          throw const PackageFailure('truncated index');
        }
        await handle!.setPosition(offset);
        final bytes = await handle!.read(count);
        if (bytes.length != count) {
          throw const PackageFailure('short index read');
        }
        onPhase?.call('indexRead');
        packageCheckOperation(operation);
        return bytes;
      }

      final end = ByteData.sublistView(await read(size - 22, 22));
      int e16(int o) => end.getUint16(o, Endian.little);
      int e32(int o) => end.getUint32(o, Endian.little);
      if (e32(0) != 0x06054b50 ||
          e16(4) != 0 ||
          e16(6) != 0 ||
          e16(8) != e16(10) ||
          e16(20) != 0) {
        throw const PackageFailure('ZIP32 EOCD required');
      }
      final count = e16(10), start = e32(16), cdSize = e32(12);
      if (count > WorkLimits.packageEntries) {
        throw const CapacityExceeded();
      }
      if (count == 0 || cdSize > count * 121 || start + cdSize != size - 22) {
        throw const PackageFailure('central range');
      }
      final entries = <String, PackageZipEntry>{}, ranges = <List<int>>[];
      var position = start, expanded = 0, maxCompressed = 0;
      for (var i = 0; i < count; i++) {
        final raw = await read(position, 46), c = ByteData.sublistView(raw);
        int u16(int o) => c.getUint16(o, Endian.little);
        int u32(int o) => c.getUint32(o, Endian.little);
        final nameLength = u16(28),
            flags = u16(8),
            method = u16(10),
            compressed = u32(20),
            unpacked = u32(24),
            localOffset = u32(42);
        final unixType = (u32(38) >> 16) & 0xf000;
        if (u32(0) != 0x02014b50 ||
            ![10, 20].contains(u16(6)) ||
            ![0, 3].contains(u16(4) >> 8) ||
            u16(4) & 255 > 20 ||
            ![0, 8].contains(method) ||
            flags & ~(method == 8 ? 0x806 : 0x800) != 0 ||
            u16(30) != 0 ||
            u16(32) != 0 ||
            u16(34) != 0 ||
            u16(36) != 0 ||
            ![0, 0x8000].contains(unixType) ||
            u32(38) & 0xffff & ~0x21 != 0 ||
            nameLength == 0 ||
            nameLength > 75 ||
            position + 46 + nameLength > start + cdSize) {
          throw const PackageFailure('unsupported ZIP entry');
        }
        final nameBytes = await read(position + 46, nameLength);
        if (nameBytes.any((b) => b > 127)) {
          throw const PackageFailure('ASCII names required');
        }
        final name = String.fromCharCodes(nameBytes);
        if (!(name == 'manifest.json' ||
                name == 'thumbnail.png' ||
                (_asset.hasMatch(name) && name.length == 75)) ||
            entries.containsKey(name)) {
          throw const PackageFailure('unsafe or duplicate entry name');
        }
        expanded += unpacked;
        final cap = name == 'manifest.json'
            ? WorkLimits.manifestUtf8Bytes
            : name == 'thumbnail.png'
            ? WorkLimits.thumbnailBytes
            : WorkLimits.photoBytes;
        if (expanded > WorkLimits.projectExpandedBytes ||
            unpacked > cap ||
            compressed > WorkLimits.projectCompressedBytes) {
          throw const CapacityExceeded();
        }
        if (method == 0 && compressed != unpacked ||
            localOffset + 30 + nameLength + compressed > start) {
          throw const PackageFailure('local payload range');
        }
        final local = ByteData.sublistView(await read(localOffset, 30));
        bool same16(int lo, int co) =>
            local.getUint16(lo, Endian.little) == u16(co);
        bool same32(int lo, int co) =>
            local.getUint32(lo, Endian.little) == u32(co);
        if (local.getUint32(0, Endian.little) != 0x04034b50 ||
            !same16(4, 6) ||
            !same16(6, 8) ||
            !same16(8, 10) ||
            !same16(10, 12) ||
            !same16(12, 14) ||
            !same32(14, 16) ||
            !same32(18, 20) ||
            !same32(22, 24) ||
            local.getUint16(26, Endian.little) != nameLength ||
            local.getUint16(28, Endian.little) != 0) {
          throw const PackageFailure('local central divergence');
        }
        final localName = await read(localOffset + 30, nameLength);
        for (var n = 0; n < nameLength; n++) {
          if (localName[n] != nameBytes[n]) {
            throw const PackageFailure('local name divergence');
          }
        }
        final payload = localOffset + 30 + nameLength;
        ranges.add([localOffset, payload + compressed]);
        entries[name] = PackageZipEntry(
          name: name,
          offset: payload,
          compressedSize: compressed,
          expandedSize: unpacked,
          crc32: u32(16),
          method: method,
        );
        if (compressed > maxCompressed) {
          maxCompressed = compressed;
        }
        position += 46 + nameLength;
      }
      ranges.sort((a, b) => a[0].compareTo(b[0]));
      var boundary = 0;
      for (final range in ranges) {
        if (range[0] != boundary) {
          throw const PackageFailure('overlap or hidden local data');
        }
        boundary = range[1];
      }
      if (boundary != start ||
          position != start + cdSize ||
          !entries.containsKey('manifest.json')) {
        throw const PackageFailure('container boundaries');
      }
      return ZipContainer(entries, expanded, maxCompressed);
    } finally {
      try { await handle?.close(); }
      finally {
        drained.complete();
        ordinary.release();
        await Future<void>.delayed(Duration.zero);
      }
    }
  }

  /// Already admitted bytes, sequential STORE output. CRCs come from admission,
  /// so a text-only snapshot neither rehashes nor raster-decodes its resources.
  static Future<void> writeStore(
    RandomAccessFile handle,
    Map<String, Uint8List> payload,
    Map<String, int> crcs,
    WorkOperation op,
  ) async {
    if (payload.isEmpty || payload.length > WorkLimits.packageEntries ||
        !payload.containsKey('manifest.json') || crcs.length != payload.length) {
      throw const PackageFailure('invalid STORE population');
    }
    var total = 22;
    for (final entry in payload.entries) {
      final name = entry.key;
      if (!(name == 'manifest.json' || name == 'thumbnail.png' ||
          (_asset.hasMatch(name) && name.length == 75))) {
        throw const PackageFailure('unsafe STORE name');
      }
      final cap = name == 'manifest.json' ? WorkLimits.manifestUtf8Bytes
          : name == 'thumbnail.png' ? WorkLimits.thumbnailBytes : WorkLimits.photoBytes;
      if (entry.value.length > cap || entry.value.length >
          WorkLimits.projectCompressedBytes - total - 76 - 2 * name.length) {
        throw const CapacityExceeded();
      }
      final crc = crcs[name];
      if (crc == null || crc < 0 || crc > 0xffffffff) {
        throw const PackageFailure('invalid STORE CRC');
      }
      total += 76 + 2 * name.length + entry.value.length;
    }
    final central = BytesBuilder();
    var offset = 0;
    for (final entry in payload.entries) {
      packageCheckOperation(op);
      final name = entry.key.codeUnits, bytes = entry.value;
      final local = Uint8List(30 + name.length),
          l = ByteData.sublistView(local);
      l.setUint32(0, 0x04034b50, Endian.little);
      l.setUint16(4, 20, Endian.little);
      l.setUint32(14, crcs[entry.key]!, Endian.little);
      l.setUint32(18, bytes.length, Endian.little);
      l.setUint32(22, bytes.length, Endian.little);
      l.setUint16(26, name.length, Endian.little);
      local.setRange(30, local.length, name);
      await handle.writeFrom(local);
      for (var p = 0; p < bytes.length; p += 65536) {
        packageCheckOperation(op);
        await handle.writeFrom(
          bytes,
          p,
          p + 65536 < bytes.length ? p + 65536 : bytes.length,
        );
      }
      final c = Uint8List(46 + name.length), v = ByteData.sublistView(c);
      v.setUint32(0, 0x02014b50, Endian.little);
      v.setUint16(4, 20, Endian.little);
      v.setUint16(6, 20, Endian.little);
      v.setUint32(16, crcs[entry.key]!, Endian.little);
      v.setUint32(20, bytes.length, Endian.little);
      v.setUint32(24, bytes.length, Endian.little);
      v.setUint16(28, name.length, Endian.little);
      v.setUint32(42, offset, Endian.little);
      c.setRange(46, c.length, name);
      central.add(c);
      offset += local.length + bytes.length;
    }
    final cd = central.takeBytes(),
        end = Uint8List(22),
        v = ByteData.sublistView(end);
    if (offset + cd.length + 22 > WorkLimits.projectCompressedBytes) {
      throw const CapacityExceeded();
    }
    v.setUint32(0, 0x06054b50, Endian.little);
    v.setUint16(8, payload.length, Endian.little);
    v.setUint16(10, payload.length, Endian.little);
    v.setUint32(12, cd.length, Endian.little);
    v.setUint32(16, offset, Endian.little);
    await handle.writeFrom(cd);
    await handle.writeFrom(end);
  }

  static int crc(Uint8List bytes) => getCrc32(bytes);
}
