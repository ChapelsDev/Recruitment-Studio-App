import 'dart:typed_data';

import 'package:archive/archive.dart';

import '../../shared/operation.dart';
import '../../shared/admission_budget.dart';
import '../../shared/problem.dart';
import '../../shared/work_limits.dart';
import '../projects/project.dart';

final class ImageHeader {
  const ImageHeader({
    required this.mediaType,
    required this.width,
    required this.height,
    required this.channels,
    this.orientation = 1,
    this.hasPrivateMetadata = false,
    this.coefficientBytes = 0,
  });
  final MediaType mediaType;
  final int width, height, channels, orientation, coefficientBytes;
  final bool hasPrivateMetadata;
  String get mimeType =>
      mediaType == MediaType.png ? 'image/png' : 'image/jpeg';
  bool get isAnimated =>
      false; // Animation/multiple frames are refused, never admitted.
}

Never invalidMedia() =>
    throw const OperationException(ProblemCode.invalidResource);

final class ImageHeaderProbe {
  ImageHeader inspect(Uint8List bytes) {
    final control = AdmissionBudget.shared.reserve(64 * 1024);
    try { return _inspect(bytes); } finally { control.release(); }
  }
  ImageHeader _inspect(Uint8List bytes) {
    if (bytes.length >= 2 && bytes[0] == 255 && bytes[1] == 216) {
      return _jpeg(bytes);
    }
    if (bytes.length < 33 || bytes.length > WorkLimits.photoBytes) {
      if (bytes.length > WorkLimits.photoBytes) throw const CapacityExceeded();
      invalidMedia();
    }
    const signature = [137, 80, 78, 71, 13, 10, 26, 10];
    for (var i = 0; i < 8; i++) {
      if (bytes[i] != signature[i]) invalidMedia();
    }
    final data = ByteData.sublistView(bytes);
    var offset = 8;
    var chunks = 0;
    var metadata = 0;
    var idat = false;
    var endedIdat = false;
    while (offset < bytes.length) {
      if (bytes.length - offset < 12) invalidMedia();
      final length = data.getUint32(offset);
      if (length > bytes.length - offset - 12) invalidMedia();
      final end = offset + 12 + length;
      final name = String.fromCharCodes(
        Uint8List.sublistView(bytes, offset + 4, offset + 8),
      );
      if (!RegExp(r'^[A-Za-z]{4}$').hasMatch(name) ||
          (bytes[offset + 6] & 32) != 0) {
        invalidMedia();
      }
      if (getCrc32(Uint8List.sublistView(bytes, offset + 4, end - 4)) !=
          data.getUint32(end - 4)) {
        invalidMedia();
      }
      if (chunks >= WorkLimits.pngChunks) { throw const CapacityExceeded(); }
      if (chunks++ == 0 && name != 'IHDR') invalidMedia();
      if (name == 'IHDR') {
        if (offset != 8 || length != 13) invalidMedia();
        final width = data.getUint32(offset + 8);
        final height = data.getUint32(offset + 12);
        // PNG integers are limited to 2^31-1. Check the domain before any
        // product; then division admission bounds all later raster arithmetic.
        if (width == 0 ||
            height == 0 ||
            width > 0x7fffffff ||
            height > 0x7fffffff) {
          invalidMedia();
        }
        if (width > WorkLimits.photoPixels ~/ height) {
          throw const CapacityExceeded();
        }
        if (bytes[offset + 16] != 8 ||
            ![0, 2, 4, 6].contains(bytes[offset + 17]) ||
            bytes[offset + 18] != 0 ||
            bytes[offset + 19] != 0 ||
            bytes[offset + 20] != 0) {
          invalidMedia();
        }
      } else if (name == 'IDAT') {
        if (endedIdat) invalidMedia();
        idat = true;
      } else if (name == 'IEND') {
        if (length != 0 || !idat || end != bytes.length) invalidMedia();
        return ImageHeader(
          mediaType: MediaType.png,
          width: data.getUint32(16),
          height: data.getUint32(20),
          channels: {0: 1, 2: 3, 4: 2, 6: 4}[bytes[25]]!,
          hasPrivateMetadata: metadata != 0,
        );
      } else {
        if (idat) endedIdat = true;
        metadata += length + 12;
        if (metadata > 1024 * 1024) throw const CapacityExceeded();
        if ((bytes[offset + 4] & 32) == 0 ||
            ['acTL', 'fcTL', 'fdAT', 'zTXt', 'iCCP', 'iTXt'].contains(name)) {
          invalidMedia();
        }
        // tRNS affects channels; it is not enabled in the current audited set.
        if (name == 'tRNS') invalidMedia();
      }
      offset = end;
    }
    invalidMedia();
  }

  ImageHeader _jpeg(Uint8List bytes) {
    if (bytes.length > WorkLimits.photoBytes) throw const CapacityExceeded();
    final v = ByteData.sublistView(bytes);
    var p = 2, metadata = 0, segments = 0, scans = 0, orientation = 1;
    var width = 0, height = 0, coefficients = 0;
    var private = false, seenExif = false;
    final components = <int, List<int>>{};
    final quant = <int>{}, dc = <int>{}, ac = <int>{};
    while (p < bytes.length) {
      if (bytes[p++] != 255) invalidMedia();
      while (p < bytes.length && bytes[p] == 255) {
        p++;
      }
      if (p >= bytes.length) invalidMedia();
      final marker = bytes[p++];
      if (marker == 217) {
        if (p != bytes.length || width == 0 || scans != 1) invalidMedia();
        return ImageHeader(
          mediaType: MediaType.jpeg,
          width: width,
          height: height,
          channels: components.length,
          orientation: orientation,
          hasPrivateMetadata: private,
          coefficientBytes: coefficients,
        );
      }
      if (scans != 0) invalidMedia();
      if (++segments > 4096 || p + 2 > bytes.length) invalidMedia();
      final size = v.getUint16(p);
      if (size < 2 || size > bytes.length - p) invalidMedia();
      final s = p + 2, end = p + size;
      metadata += size + 2;
      if (metadata > 1024 * 1024) throw const CapacityExceeded();
      if (marker == 192) {
        if (width != 0 || size < 11 || bytes[s] != 8) invalidMedia();
        height = v.getUint16(s + 1);
        width = v.getUint16(s + 3);
        if (width == 0 || height == 0) invalidMedia();
        if (width * height > WorkLimits.photoPixels) {
          throw const CapacityExceeded();
        }
        final count = bytes[s + 5];
        if (![1, 3].contains(count) || size != 8 + 3 * count) invalidMedia();
        var maxH = 1, maxV = 1, sum = 0;
        for (var i = 0; i < count; i++) {
          final id = bytes[s + 6 + i * 3], sampling = bytes[s + 7 + i * 3];
          final h = sampling >> 4, vv = sampling & 15, q = bytes[s + 8 + i * 3];
          if (id != i + 1 ||
              components.containsKey(id) ||
              h < 1 ||
              h > 2 ||
              vv < 1 ||
              vv > 2 ||
              q > 3) {
            invalidMedia();
          }
          components[id] = [h, vv, q];
          if (h > maxH) maxH = h;
          if (vv > maxV) maxV = vv;
          sum += h * vv;
        }
        if (sum > 10) invalidMedia();
        final mcus =
            ((width + maxH * 8 - 1) ~/ (maxH * 8)) *
            ((height + maxV * 8 - 1) ~/ (maxV * 8));
        coefficients = mcus * sum * 64 * 4;
      } else if (marker == 219) {
        var q = s;
        while (q < end) {
          final tag = bytes[q++];
          if (tag > 3 || end - q < 64) invalidMedia();
          // T.81 Table B.4: Pq0 values are 1..255; Tq0 is a legal ID.
          for (var i = 0; i < 64; i++) {
            if (bytes[q + i] == 0) invalidMedia();
          }
          quant.add(tag);
          q += 64;
        }
      } else if (marker == 196) {
        var q = s;
        while (q < end) {
          final tag = bytes[q++];
          if (tag & 0xec != 0 || end - q < 16) invalidMedia();
          var n = 0, slots = 1;
          for (var i = 0; i < 16; i++) {
            final c = bytes[q++];
            n += c;
            slots = slots * 2 - c;
            if (slots < 0) invalidMedia();
          }
          if (n == 0 || n > 256 || n > end - q) invalidMedia();
          (tag < 16 ? dc : ac).add(tag & 3);
          q += n;
        }
      } else if (marker == 221) {
        if (size != 4) invalidMedia();
      } else if (marker >= 224 && marker <= 239 || marker == 254) {
        final payload = Uint8List.sublistView(bytes, s, end);
        // Only the fixed JFIF header is non-private. Never admit its embedded thumbnail.
        final jfif =
            marker == 224 &&
            payload.length == 14 &&
            _prefix(payload, [74, 70, 73, 70, 0]) &&
            payload[12] == 0 &&
            payload[13] == 0;
        final adobe =
            marker == 238 &&
            payload.length == 12 &&
            _prefix(payload, [65, 100, 111, 98, 101]) &&
            payload[11] <= 1;
        if (!jfif && !adobe) private = true;
        if (marker == 225 && _prefix(payload, [69, 120, 105, 102, 0, 0])) {
          if (seenExif) invalidMedia();
          seenExif = true;
          orientation = _tiff(Uint8List.sublistView(payload, 6));
        }
      } else if (marker == 218) {
        if (width == 0 ||
            ++scans != 1 ||
            size != 6 + 2 * components.length ||
            bytes[s] != components.length) {
          invalidMedia();
        }
        final selected = <int>{};
        for (var i = 0; i < components.length; i++) {
          final id = bytes[s + 1 + 2 * i], tables = bytes[s + 2 + 2 * i];
          if (!selected.add(id) ||
              !components.containsKey(id) ||
              !dc.contains(tables >> 4) ||
              !ac.contains(tables & 15) ||
              !quant.contains(components[id]![2])) {
            invalidMedia();
          }
        }
        if (bytes[end - 3] != 0 ||
            bytes[end - 2] != 63 ||
            bytes[end - 1] != 0) {
          invalidMedia();
        }
        p = end;
        final scanStart = p;
        while (p < bytes.length) {
          if (bytes[p] != 255) {
            p++;
            continue;
          }
          if (p + 1 >= bytes.length) invalidMedia();
          final next = bytes[p + 1];
          if (next == 0 || next >= 208 && next <= 215) {
            p += 2;
            continue;
          }
          break;
        }
        if (p == scanStart) invalidMedia();
        continue;
      } else {
        // No progressive, arithmetic, lossless, 12/16-bit or multi-scan mode enabled.
        invalidMedia();
      }
      p = end;
    }
    invalidMedia();
  }

  bool _prefix(Uint8List bytes, List<int> prefix) {
    if (bytes.length < prefix.length) return false;
    for (var i = 0; i < prefix.length; i++) {
      if (bytes[i] != prefix[i]) return false;
    }
    return true;
  }

  int _tiff(Uint8List b) {
    if (b.length < 8 ||
        !((b[0] == 73 && b[1] == 73) || (b[0] == 77 && b[1] == 77))) {
      invalidMedia();
    }
    final endian = b[0] == 73 ? Endian.little : Endian.big;
    final v = ByteData.sublistView(b);
    if (v.getUint16(2, endian) != 42) invalidMedia();
    final pending = [v.getUint32(4, endian)], seen = <int>{};
    const sizes = [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8];
    var orientation = 1, oriented = false;
    while (pending.isNotEmpty) {
      final p = pending.removeLast();
      if (p == 0) continue;
      if (p < 8 || p > b.length - 2 || !seen.add(p) || seen.length > 16) {
        invalidMedia();
      }
      final n = v.getUint16(p, endian);
      if (n > 256 || 2 + n * 12 + 4 > b.length - p) invalidMedia();
      for (var i = 0; i < n; i++) {
        final e = p + 2 + i * 12, tag = v.getUint16(p + 2 + i * 12, endian);
        final type = v.getUint16(e + 2, endian),
            count = v.getUint32(e + 4, endian);
        if (type == 0 || type >= sizes.length) invalidMedia();
        final length = sizes[type] * count;
        final offset = length <= 4 ? e + 8 : v.getUint32(e + 8, endian);
        if (offset > b.length || length > b.length - offset) invalidMedia();
        if (tag == 0x112) {
          if (oriented || type != 3 || count != 1) invalidMedia();
          oriented = true;
          orientation = v.getUint16(offset, endian);
          if (orientation < 1 || orientation > 8) invalidMedia();
        }
        if ([0x8769, 0x8825, 0xa005].contains(tag)) {
          if (type != 4 || count != 1) invalidMedia();
          if (pending.length >= WorkLimits.exifPending) { throw const CapacityExceeded(); }
          pending.add(v.getUint32(offset, endian));
        }
      }
      if (pending.length >= WorkLimits.exifPending) { throw const CapacityExceeded(); }
      pending.add(v.getUint32(p + 2 + n * 12, endian));
    }
    return orientation;
  }
}
