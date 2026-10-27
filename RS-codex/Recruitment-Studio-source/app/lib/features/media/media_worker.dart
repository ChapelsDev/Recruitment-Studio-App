import 'dart:typed_data';
import 'dart:async';
import 'dart:isolate';
import 'dart:io';
import 'dart:math' as math;

import 'package:image/image.dart' as img;
import 'package:archive/archive.dart';
import 'package:crypto/crypto.dart' as crypto;

import '../../shared/operation.dart';
import '../../shared/admission_budget.dart';
import '../../shared/work_budget.dart';
import '../../shared/work_limits.dart';
import '../../shared/problem.dart';
import '../projects/project.dart';
import 'image_header_probe.dart';

/// Conservative co-live owned-buffer envelope, not process/native allocator RSS.
/// PNG terms follow the prospectively frozen T03-fix-02 allocation certificate.
/// JPEG retains the previously audited coefficient/padded-block envelope.
int mediaAllocationEstimate(ImageHeader header, int inputBytes) {
  if (inputBytes < 0 || inputBytes > WorkLimits.photoBytes || header.width <= 0 ||
      header.height <= 0 || header.width > WorkLimits.photoPixels ~/ header.height ||
      header.coefficientBytes < 0 || header.coefficientBytes > WorkLimits.ownedBufferBytes) {
    throw const CapacityExceeded();
  }
  final pixels = header.width * header.height;
  if (header.mediaType == MediaType.png) {
    final raw = pixels * 4 + header.height;
    const side = WorkLimits.thumbnailSide;
    const thumbnailPixels = side * side;
    const thumbnailRaw = thumbnailPixels * 4 + side;
    int encodedBound(int r) =>
        r + (r >> 12) + (r >> 14) + (r >> 25) + 65536 + 57;
    return inputBytes * 6 +
        pixels * 8 +
        raw * 4 +
        encodedBound(raw) * 5 +
        header.width * 32 +
        thumbnailPixels * 4 +
        thumbnailRaw * 2 +
        encodedBound(thumbnailRaw) * 5 +
        4 * (side + side) +
        8 * 1024 * 1024;
  }
  return inputBytes * 4 +
      header.coefficientBytes * 2 +
      pixels * 32 +
      header.height * 8 +
      8 * 1024 * 1024;
}

enum MediaWorkerMode {
  normal,
  holdBeforeDecode,
  holdAfterResult,
  crash,
  exitWithoutResult,
}

final class MediaWorkerFailure implements Exception {
  const MediaWorkerFailure(this.reason);
  final String reason;
  ProblemCode get code => ProblemCode.ioFailure;
  Problem get problem => Problem(code: code, severity: ProblemSeverity.error);
  @override
  String toString() => 'Media worker failed: $reason';
}

typedef MediaSpawn = Future<Isolate> Function(
  List<Object?> args,
  SendPort exit,
  SendPort error,
);

final class MediaWorker {
  MediaWorker({
    this.onPhase,
    this.onReady,
    this.mode = MediaWorkerMode.normal,
    this.timeout = WorkLimits.decodeTimeout,
    MediaSpawn? spawn,
    Timer Function(Duration, void Function())? deadline,
  }) : _spawn = spawn ?? _spawnIsolate,
       _deadline = deadline ?? Timer.new;
  final void Function(String)? onPhase;
  final void Function(SendPort)? onReady;
  final MediaWorkerMode mode;
  final Duration timeout;
  final MediaSpawn _spawn;
  final Timer Function(Duration, void Function()) _deadline;
  static Future<Isolate> _spawnIsolate(
    List<Object?> args,
    SendPort exit,
    SendPort error,
  ) => Isolate.spawn(
    _mediaEntry,
    args,
    onExit: exit,
    onError: error,
    errorsAreFatal: true,
    paused: true,
  );
  void _phase(String phase) {
    onPhase?.call(phase);
  }

  Future<NormalizedMedia> run(
    Uint8List input, {
    required WorkOperation operation,
    required WorkLease lease,
  }) async => (await _execute(
    input,
    operation: operation,
    lease: lease,
    verifyOnly: false,
  ))!;

  Future<void> verify(
    Uint8List input, {
    required WorkOperation operation,
    required WorkLease lease,
  }) async {
    await _execute(input, operation: operation, lease: lease, verifyOnly: true);
  }

  /// Borrow the parent's slot, with independently paid child scratch.
  Future<void> verifyBorrowed(
    Uint8List input, {
    required WorkOperation operation,
    required WorkLease lease,
  }) async {
    lease.forChild(operation);
    final amount = mediaAllocationEstimate(
      ImageHeaderProbe().inspect(input),
      input.length,
    );
    final scratch = lease.reserveAdditional(operation, amount);
    try {
      await _execute(
        input,
        operation: operation,
        lease: lease,
        verifyOnly: true,
        additionalBytes: scratch.bytes,
      );
    } finally {
      scratch.release();
    }
  }

  static final Set<WorkLease> _running = {};

  Future<NormalizedMedia?> _execute(
    Uint8List input, {
    required WorkOperation operation,
    required WorkLease lease,
    required bool verifyOnly,
    int additionalBytes = 0,
  }) async {
    lease.forChild(operation);
    if (_running.contains(lease)) { throw StateError('Heavy lease already has a media worker'); }
    final credit = WorkerAdmission.acquire();
    _running.add(lease);
    try {
      return await _executeOwned(
        input,
        operation: operation,
        lease: lease,
        verifyOnly: verifyOnly,
        additionalBytes: additionalBytes,
      );
    } finally {
      _running.remove(lease);
      credit.release();
    }
  }

  Future<NormalizedMedia?> _executeOwned(Uint8List input, {
    required WorkOperation operation, required WorkLease lease,
    required bool verifyOnly, int additionalBytes = 0}) async {
    lease.forChild(operation);
    final header = ImageHeaderProbe().inspect(input);
    if (lease.bytes + additionalBytes < mediaAllocationEstimate(header, input.length)) {
      throw const CapacityExceeded();
    }
    ReceivePort? replies, errors, exits;
    StreamSubscription<dynamic>? repliesSub, errorsSub, exitsSub;
    Timer? timer;
    void Function()? unsubscribe;
    final exited = Completer<void>(), drained = Completer<void>();
    var enrolled = false, verified = false;
    NormalizedMedia? result;
    Object? failure;
    Isolate? isolate;
    void phase(String name) {
      try { _phase(name); }
      catch (_) {
        failure ??= const MediaWorkerFailure('observer');
        isolate?.kill(priority: Isolate.immediate);
      }
    }
    void stop(Object error) {
      failure ??= error;
      try { phase('killRequested'); }
      finally { isolate?.kill(priority: Isolate.immediate); }
    }
    try {
      operation.registerPending(drained.future);
      enrolled = true;
      unsubscribe = operation.addStopListener(() =>
        stop(const OperationException(ProblemCode.operationCancelled)));
      replies = ReceivePort(); errors = ReceivePort(); exits = ReceivePort();
      timer = _deadline(timeout, () => stop(const MediaWorkerFailure('timeout')));
      repliesSub = replies.listen((dynamic msg) {
        try {
          final m = msg as List<Object?>;
          if (m[0] == 'ready') {
            phase('ready'); onReady?.call(m[1] as SendPort); return;
          }
          if (m[0] == 'verified') { verified = true; phase('verified'); }
          else if (m[0] == 'result') {
            if (failure == null) {
              result = NormalizedMedia(m[2] as Uint8List, m[3] as Uint8List,
                m[4] as int, m[5] as int);
            }
            phase('result');
          } else {
            failure ??= m[0] == 'capacity' ? const CapacityExceeded()
                : const OperationException(ProblemCode.invalidResource);
          }
          if (mode == MediaWorkerMode.holdAfterResult && m[0] == 'result') {
            onReady?.call(m[1] as SendPort);
          } else { (m[1] as SendPort).send(true); }
        } catch (_) { stop(const MediaWorkerFailure('observer')); }
      });
      errorsSub = errors.listen((dynamic _) => stop(const MediaWorkerFailure('workerError')));
      exitsSub = exits.listen((dynamic _) {
        try { phase('exited'); }
        finally { if (!exited.isCompleted) { exited.complete(); } }
      });
      final copy = Uint8List.fromList(input).asUnmodifiableView();
      try {
        isolate = await _spawn([copy, replies.sendPort, mode.index, verifyOnly],
          exits.sendPort, errors.sendPort);
      } catch (_) { throw const MediaWorkerFailure('startup'); }
      phase('spawned');
      if (failure != null) { isolate.kill(priority: Isolate.immediate); }
      else { isolate.resume(isolate.pauseCapability!); }
      await exited.future;
      operation.throwIfCancelled();
      if (operation.isFinishing) { throw const OperationException(ProblemCode.operationCancelled); }
      if (failure != null) { throw failure!; }
      if (verifyOnly) {
        if (!verified) { throw const MediaWorkerFailure('exitWithoutResult'); }
        return null;
      }
      if (result == null) { throw const MediaWorkerFailure('exitWithoutResult'); }
      return result!;
    } finally {
      try {
        if (isolate != null && !exited.isCompleted) {
          isolate.kill(priority: Isolate.immediate); await exited.future;
        }
      } finally {
        timer?.cancel(); unsubscribe?.call();
        try { await repliesSub?.cancel(); }
        finally {
          try { await errorsSub?.cancel(); }
          finally {
            try { await exitsSub?.cancel(); }
            finally {
              replies?.close(); errors?.close(); exits?.close();
              if (enrolled) { drained.complete(); }
            }
          }
        }
      }
      phase('drained');
      await Future<void>.delayed(Duration.zero);
      if (failure == null) {
        operation.throwIfCancelled();
        if (operation.isFinishing) { throw const OperationException(ProblemCode.operationCancelled); }
      }
    }
  }

}

Future<void> _mediaEntry(List<Object?> args) async {
  final input = args[0] as Uint8List, reply = args[1] as SendPort;
  final mode = MediaWorkerMode.values[args[2] as int];
  if (mode == MediaWorkerMode.crash) throw StateError('Synthetic worker crash');
  if (mode == MediaWorkerMode.exitWithoutResult) return;
  if (mode == MediaWorkerMode.holdBeforeDecode) {
    final control = ReceivePort();
    reply.send(['ready', control.sendPort]);
    await control.first;
    control.close();
  }
  final ack = ReceivePort();
  List<Object?> message;
  try {
    final header = ImageHeaderProbe().inspect(input);
    if (args[3] as bool) {
      _decode(input, header);
      message = ['verified', ack.sendPort];
    } else {
      final result = _normalize(input, header);
      message = [
        'result',
        ack.sendPort,
        result.bytes,
        result.preview,
        result.width,
        result.height,
      ];
    }
  } on CapacityExceeded {
    message = ['capacity', ack.sendPort];
  } catch (_) {
    message = ['invalid', ack.sendPort];
  }
  reply.send(message);
  await ack.first;
  ack.close();
}

final class NormalizedMedia {
  NormalizedMedia(this.bytes, this.preview, this.width, this.height)
    : sha256 = crypto.sha256.convert(bytes).toString();
  final Uint8List bytes, preview;
  final int width, height;
  final String sha256;
}

/// Low-level synchronous codec seam. A live prepaid lease is mandatory.
/// Returned output is transient under that lease; caller transfers/retains its
/// own accounting before release. Default ResourceService will run in an isolate.
NormalizedMedia normalizeMedia(
  Uint8List input, {
  required WorkLease lease,
  required Operation operation,
}) {
  lease.forChild(operation);
  final header = ImageHeaderProbe().inspect(input);
  if (lease.bytes < mediaAllocationEstimate(header, input.length)) {
    throw const CapacityExceeded();
  }
  return _normalize(input, header);
}

img.Image _decode(Uint8List input, ImageHeader header) {
  final Uint8List prepared;
  if (header.mediaType == MediaType.png) {
    // All callers have validated the immutable source and prepaid its envelope.
    // Coalesce BEFORE image's offset/dataBlocks/view fan-out can see the input.
    prepared = _preparePng(input);
    validatePngExpansion(prepared);
  } else {
    _validateJpegEntropy(input, header);
    prepared = _stripJpeg(input);
  }
  final decoded = header.mediaType == MediaType.png
      ? img.decodePng(prepared)
      : img.decodeJpg(prepared);
  if (decoded == null ||
      decoded.width != header.width ||
      decoded.height != header.height ||
      decoded.numFrames != 1) {
    invalidMedia();
  }
  return decoded;
}

NormalizedMedia _normalize(Uint8List input, ImageHeader header) {
  final decoded = _decode(input, header);
  // Fresh raster only. EXIF/ICC/text/other metadata never propagate from decoder.
  final swap = header.orientation >= 5;
  final clean = img.Image(
    width: swap ? decoded.height : decoded.width,
    height: swap ? decoded.width : decoded.height,
    numChannels: 4,
  );
  for (var y = 0; y < decoded.height; y++) {
    for (var x = 0; x < decoded.width; x++) {
      final pos = switch (header.orientation) {
        1 => (x, y),
        2 => (decoded.width - 1 - x, y),
        3 => (decoded.width - 1 - x, decoded.height - 1 - y),
        4 => (x, decoded.height - 1 - y),
        5 => (y, x),
        6 => (decoded.height - 1 - y, x),
        7 => (decoded.height - 1 - y, decoded.width - 1 - x),
        _ => (y, decoded.width - 1 - x),
      };
      final p = decoded.getPixel(x, y);
      // One-channel pixels expose luminance only in r; expand it into RGB.
      final grayscale = decoded.numChannels == 1;
      clean.setPixelRgba(
        pos.$1,
        pos.$2,
        p.r,
        grayscale ? p.r : p.g,
        grayscale ? p.r : p.b,
        p.a,
      );
    }
  }
  final encoded = _encodePng(clean);
  final scale = math.min(
    1.0,
    WorkLimits.thumbnailSide / math.max(clean.width, clean.height),
  );
  final preview = img.copyResize(
    clean,
    width: math.max(1, (clean.width * scale).floor()),
    height: math.max(1, (clean.height * scale).floor()),
    interpolation: img.Interpolation.nearest,
  );
  final thumb = _encodePng(preview);
  if (thumb.length > WorkLimits.thumbnailBytes) throw const CapacityExceeded();
  ImageHeaderProbe().inspect(encoded);
  ImageHeaderProbe().inspect(thumb);
  return NormalizedMedia(encoded, thumb, clean.width, clean.height);
}

Uint8List _stripJpeg(Uint8List input) {
  final v = ByteData.sublistView(input);
  // Build bounded source ranges, never parse private metadata in image's codec.
  final ranges = <(int, int)>[(0, 2)];
  var length = 2, p = 2;
  while (p < input.length) {
    final start = p++;
    while (input[p] == 255) {
      p++;
    }
    final marker = input[p++];
    final end = p + v.getUint16(p);
    if (marker == 218) {
      ranges.add((start, input.length));
      length += input.length - start;
      break;
    }
    if (!(marker >= 224 && marker <= 239 || marker == 254) ||
        marker == 238 && end - p == 14) {
      ranges.add((start, end));
      length += end - start;
    }
    p = end;
  }
  final out = Uint8List(length);
  var q = 0;
  for (final range in ranges) {
    final n = range.$2 - range.$1;
    out.setRange(q, q + n, input, range.$1);
    q += n;
  }
  return out;
}

/// Pure preprocessing boundary; no pixel expansion. The caller must retain
/// unchanged input for this synchronous call and own a live same-operation lease
/// prepaid with mediaAllocationEstimate. Returned exact storage lives under it;
/// retaining it after release requires independent caller accounting.
Uint8List preparePngForDecode(
  Uint8List input, {
  required WorkLease lease,
  required Operation operation,
}) {
  lease.forChild(operation);
  final header = ImageHeaderProbe().inspect(input);
  if (header.mediaType != MediaType.png) invalidMedia();
  if (lease.bytes < mediaAllocationEstimate(header, input.length)) {
    throw const CapacityExceeded();
  }
  return _preparePng(input);
}

/// Internal common path: header/CRC/order admission and full-envelope payment
/// must precede this call. Two scalar passes; one exact carrier; no per-IDAT
/// offset/range/descriptor collection survives into the pinned PNG decoder.
Uint8List _preparePng(Uint8List input) {
  final v = ByteData.sublistView(input);
  var size = 0;
  for (var p = 8; p < input.length;) {
    final n = v.getUint32(p);
    if (v.getUint32(p + 4) == 0x49444154) size += n;
    p += n + 12;
  }
  final out = Uint8List(57 + size)..setRange(0, 33, input);
  final data = ByteData.sublistView(out);
  data.setUint32(33, size);
  data.setUint32(37, 0x49444154);
  var q = 41;
  for (var p = 8; p < input.length;) {
    final n = v.getUint32(p);
    if (v.getUint32(p + 4) == 0x49444154) {
      out.setRange(q, q + n, input, p + 8);
      q += n;
    }
    p += n + 12;
  }
  data.setUint32(q, getCrc32(Uint8List.sublistView(out, 37, q)));
  data.setUint32(q + 4, 0);
  data.setUint32(q + 8, 0x49454e44);
  data.setUint32(q + 12, 0xae426082);
  return out;
}

Uint8List _encodePng(img.Image pixels) {
  final row = pixels.width * 4 + 1;
  final raw = Uint8List(pixels.height * row);
  for (var y = 0; y < pixels.height; y++) {
    for (var x = 0; x < pixels.width; x++) {
      final p = pixels.getPixel(x, y), i = y * row + x * 4 + 1;
      raw[i] = p.r.toInt();
      raw[i + 1] = p.g.toInt();
      raw[i + 2] = p.b.toInt();
      raw[i + 3] = p.a.toInt();
    }
  }
  // Deflate's conservative compressBound-style envelope is included before encoding.
  final compressed = ZLibCodec().encode(raw);
  if (compressed.length >
      raw.length +
          (raw.length >> 12) +
          (raw.length >> 14) +
          (raw.length >> 25) +
          65536) {
    throw const CapacityExceeded();
  }
  final out = Uint8List(57 + compressed.length);
  out.setRange(0, 8, [137, 80, 78, 71, 13, 10, 26, 10]);
  final v = ByteData.sublistView(out);
  void chunk(int offset, String type, List<int> payload) {
    v.setUint32(offset, payload.length);
    out.setRange(offset + 4, offset + 8, type.codeUnits);
    out.setRange(offset + 8, offset + 8 + payload.length, payload);
    v.setUint32(
      offset + 8 + payload.length,
      getCrc32(
        Uint8List.sublistView(out, offset + 4, offset + 8 + payload.length),
      ),
    );
  }

  final ihdr = Uint8List(13), hv = ByteData.sublistView(ihdr);
  hv.setUint32(0, pixels.width);
  hv.setUint32(4, pixels.height);
  ihdr[8] = 8;
  ihdr[9] = 6;
  chunk(8, 'IHDR', ihdr);
  chunk(33, 'IDAT', compressed);
  chunk(45 + compressed.length, 'IEND', []);
  return out;
}

/// image's baseline scanner treats early EOF/markers as null coefficients.
/// Validate every entropy block first, with finite tables and no coefficient
/// raster. Header admission has already bounded the segment/MCU domains.
void _validateJpegEntropy(Uint8List input, ImageHeader header) {
  final view = ByteData.sublistView(input);
  final tables = <int, _JpegHuffman>{}, components = <int, (int, int)>{};
  var p = 2, restart = 0, maxH = 1, maxV = 1;
  while (p < input.length) {
    p++;
    while (input[p] == 255) {
      p++;
    }
    final marker = input[p++], start = p + 2, end = p + view.getUint16(p);
    if (marker == 192) {
      final n = input[start + 5];
      for (var i = 0; i < n; i++) {
        final s = input[start + 7 + i * 3], h = s >> 4, v = s & 15;
        components[input[start + 6 + i * 3]] = (h, v);
        maxH = math.max(maxH, h);
        maxV = math.max(maxV, v);
      }
    } else if (marker == 196) {
      var q = start;
      while (q < end) {
        final tag = input[q++], counts = <int>[];
        var n = 0;
        for (var i = 0; i < 16; i++) {
          counts.add(input[q++]);
          n += counts.last;
        }
        final values = Uint8List.sublistView(input, q, q + n);
        q += n;
        tables[tag] = _JpegHuffman(counts, values, tag < 16);
      }
    } else if (marker == 221) {
      restart = view.getUint16(start);
    } else if (marker == 218) {
      final scan = <(int, int, int)>[];
      for (var i = 0; i < components.length; i++) {
        final id = input[start + 1 + i * 2], table = input[start + 2 + i * 2];
        scan.add((id, table >> 4, 16 + (table & 15)));
      }
      final mcus = components.length == 1
          ? ((header.width + 7) ~/ 8) * ((header.height + 7) ~/ 8)
          : ((header.width + maxH * 8 - 1) ~/ (maxH * 8)) *
                ((header.height + maxV * 8 - 1) ~/ (maxV * 8));
      // Pinned decoder loops full resetInterval even for the last group. Do not
      // enable its unaudited overshoot case for a partial final restart group.
      if (restart > 0 && (restart > mcus || mcus % restart != 0)) {
        invalidMedia();
      }
      final bits = _JpegBits(input, end);
      var rst = 0;
      for (var mcu = 0; mcu < mcus; mcu++) {
        if (restart > 0 && mcu > 0 && mcu % restart == 0) {
          bits.align();
          if (bits.position + 2 > input.length ||
              input[bits.position++] != 255 ||
              input[bits.position++] != 208 + (rst++ & 7)) {
            invalidMedia();
          }
        }
        for (final c in scan) {
          final sampling = components[c.$1]!;
          final blocks = components.length == 1 ? 1 : sampling.$1 * sampling.$2;
          for (var block = 0; block < blocks; block++) {
            final dc = tables[c.$2]!.symbol(bits);
            bits.skip(dc);
            var k = 1;
            while (k < 64) {
              final ac = tables[c.$3]!.symbol(bits),
                  run = ac >> 4,
                  size = ac & 15;
              if (size == 0) {
                if (run == 0) break;
                k += 16;
                if (k > 64) {
                  invalidMedia();
                }
              } else {
                k += run;
                if (k >= 64) {
                  invalidMedia();
                }
                bits.skip(size);
                k++;
              }
            }
          }
        }
      }
      final byteAligned = bits.remaining == 0;
      bits.align();
      // Pinned JPEG encoder emits one all-ones alignment byte even at an
      // already byte-aligned EOI (jpeg_encoder.dart 170-174). Allow exactly
      // that stuffed FF00, never arbitrary leftover entropy.
      if (byteAligned &&
          bits.position + 2 == input.length - 2 &&
          input[bits.position] == 255 &&
          input[bits.position + 1] == 0) {
        bits.position += 2;
      }
      if (bits.position != input.length - 2 ||
          input[bits.position] != 255 ||
          input.last != 217) {
        invalidMedia();
      }
      return;
    }
    p = end;
  }
  invalidMedia();
}

final class _JpegBits {
  _JpegBits(this.input, this.position);
  final Uint8List input;
  int position, value = 0, remaining = 0;
  int read() {
    if (remaining == 0) {
      if (position >= input.length - 2) {
        invalidMedia();
      }
      value = input[position++];
      if (value == 255) {
        if (position >= input.length - 2 || input[position++] != 0) {
          invalidMedia();
        }
      }
      remaining = 8;
    }
    return (value >> --remaining) & 1;
  }

  void skip(int n) {
    for (var i = 0; i < n; i++) {
      read();
    }
  }

  void align() {
    while (remaining > 0) {
      if (read() != 1) {
        invalidMedia();
      }
    }
  }
}

final class _JpegHuffman {
  _JpegHuffman(List<int> counts, Uint8List values, bool dc) {
    var code = 0, q = 0;
    for (var n = 1; n <= 16; n++) {
      for (var i = 0; i < counts[n - 1]; i++) {
        final v = values[q++];
        if (dc
            ? v > 11
            : (v & 15) > 10 || (v & 15) == 0 && v != 0 && v != 240) {
          invalidMedia();
        }
        // All-ones codes conflict with mandatory entropy padding.
        if (code >= (1 << n) - 1) {
          invalidMedia();
        }
        codes[(1 << n) | code++] = v;
      }
      code <<= 1;
    }
  }
  final Map<int, int> codes = {};
  int symbol(_JpegBits bits) {
    var code = 0;
    for (var n = 1; n <= 16; n++) {
      code = (code << 1) | bits.read();
      final value = codes[(1 << n) | code];
      if (value != null) return value;
    }
    invalidMedia();
  }
}

/// Validate actual zlib/DEFLATE with a fixed 32KiB window BEFORE image's full
/// native inflate. No output-sized storage is allocated by this scanner.
/// Caller must charge scanner scratch and retain identical immutable input.
int validatePngExpansion(Uint8List bytes) {
  final h = ImageHeaderProbe().inspect(bytes);
  if (h.mediaType != MediaType.png) invalidMedia();
  final v = ByteData.sublistView(bytes);
  var size = 0;
  for (var p = 8; p < bytes.length;) {
    final n = v.getUint32(p);
    if (bytes[p + 4] == 73 && bytes[p + 5] == 68) size += n;
    p += n + 12;
  }
  final compressed = Uint8List(size);
  var q = 0;
  for (var p = 8; p < bytes.length;) {
    final n = v.getUint32(p);
    if (bytes[p + 4] == 73 && bytes[p + 5] == 68) {
      compressed.setRange(q, q + n, bytes, p + 8);
      q += n;
    }
    p += n + 12;
  }
  return _Deflate(
    compressed,
    h.height * (h.width * h.channels + 1),
    h.width * h.channels + 1,
  ).validate();
}

final class _Bits {
  _Bits(this.bytes);
  final Uint8List bytes;
  int bit = 16;
  int read(int n) {
    if (bit + n > (bytes.length - 4) * 8) invalidMedia();
    var out = 0;
    for (var i = 0; i < n; i++, bit++) {
      out |= ((bytes[bit >> 3] >> (bit & 7)) & 1) << i;
    }
    return out;
  }

  void align() {
    bit = (bit + 7) & ~7;
  }
}

final class _Huffman {
  _Huffman(List<int> lengths) {
    final counts = List<int>.filled(16, 0), next = List<int>.filled(16, 0);
    for (final n in lengths) {
      if (n < 0 || n > 15) invalidMedia();
      counts[n]++;
    }
    var slots = 1, code = 0;
    for (var n = 1; n <= 15; n++) {
      slots = slots * 2 - counts[n];
      if (slots < 0) invalidMedia();
      code = (code + (n == 1 ? 0 : counts[n - 1])) << 1;
      next[n] = code;
    }
    for (var s = 0; s < lengths.length; s++) {
      final n = lengths[s];
      if (n == 0) continue;
      var c = next[n]++, reverse = 0;
      for (var i = 0; i < n; i++) {
        reverse = (reverse << 1) | (c & 1);
        c >>= 1;
      }
      codes[(1 << n) | reverse] = s;
    }
  }
  final Map<int, int> codes = {};
  int symbol(_Bits bits) {
    var c = 0;
    for (var n = 1; n <= 15; n++) {
      c |= bits.read(1) << (n - 1);
      final s = codes[(1 << n) | c];
      if (s != null) return s;
    }
    invalidMedia();
  }
}

final class _Deflate {
  _Deflate(this.bytes, this.limit, this.row) : bits = _Bits(bytes);
  final Uint8List bytes;
  final int limit, row;
  final _Bits bits;
  final Uint8List window = Uint8List(32768);
  int count = 0, a = 1, b = 0;
  void emit(int value) {
    if (count == limit) throw const CapacityExceeded();
    if (count % row == 0 && value > 4) invalidMedia();
    window[count++ & 32767] = value;
    a = (a + value) % 65521;
    b = (b + a) % 65521;
  }

  int validate() {
    if (bytes.length < 6 ||
        bytes[0] & 15 != 8 ||
        bytes[0] >> 4 > 7 ||
        (bytes[0] * 256 + bytes[1]) % 31 != 0 ||
        bytes[1] & 32 != 0) {
      invalidMedia();
    }
    var finalBlock = false;
    while (!finalBlock) {
      finalBlock = bits.read(1) != 0;
      final type = bits.read(2);
      if (type == 0) {
        bits.align();
        final n = bits.read(16), complement = bits.read(16);
        if (n ^ complement != 65535) invalidMedia();
        if (n > limit - count) throw const CapacityExceeded();
        for (var i = 0; i < n; i++) {
          emit(bits.read(8));
        }
      } else if (type == 1 || type == 2) {
        late _Huffman literal, distance;
        if (type == 1) {
          literal = _Huffman(
            List.generate(
              288,
              (s) => s < 144
                  ? 8
                  : s < 256
                  ? 9
                  : s < 280
                  ? 7
                  : 8,
            ),
          );
          distance = _Huffman(List.filled(32, 5));
        } else {
          final nl = bits.read(5) + 257,
              nd = bits.read(5) + 1,
              nc = bits.read(4) + 4;
          if (nl > 286) invalidMedia();
          const order = [
            16,
            17,
            18,
            0,
            8,
            7,
            9,
            6,
            10,
            5,
            11,
            4,
            12,
            3,
            13,
            2,
            14,
            1,
            15,
          ];
          final cl = List<int>.filled(19, 0);
          for (var i = 0; i < nc; i++) {
            cl[order[i]] = bits.read(3);
          }
          final code = _Huffman(cl), lengths = <int>[];
          while (lengths.length < nl + nd) {
            final s = code.symbol(bits);
            if (s <= 15) {
              lengths.add(s);
              continue;
            }
            if (s == 16 && lengths.isEmpty) invalidMedia();
            final repeat = s == 16
                ? bits.read(2) + 3
                : s == 17
                ? bits.read(3) + 3
                : bits.read(7) + 11;
            if (repeat > nl + nd - lengths.length) invalidMedia();
            final value = s == 16 ? lengths.last : 0;
            for (var i = 0; i < repeat; i++) {
              lengths.add(value);
            }
          }
          if (lengths[256] == 0) invalidMedia();
          literal = _Huffman(lengths.sublist(0, nl));
          distance = _Huffman(lengths.sublist(nl));
        }
        while (true) {
          final s = literal.symbol(bits);
          if (s < 256) {
            emit(s);
            continue;
          }
          if (s == 256) break;
          if (s > 285) invalidMedia();
          const lengthBase = [
            3,
            4,
            5,
            6,
            7,
            8,
            9,
            10,
            11,
            13,
            15,
            17,
            19,
            23,
            27,
            31,
            35,
            43,
            51,
            59,
            67,
            83,
            99,
            115,
            131,
            163,
            195,
            227,
            258,
          ];
          const lengthExtra = [
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            1,
            1,
            1,
            1,
            2,
            2,
            2,
            2,
            3,
            3,
            3,
            3,
            4,
            4,
            4,
            4,
            5,
            5,
            5,
            5,
            0,
          ];
          const distanceBase = [
            1,
            2,
            3,
            4,
            5,
            7,
            9,
            13,
            17,
            25,
            33,
            49,
            65,
            97,
            129,
            193,
            257,
            385,
            513,
            769,
            1025,
            1537,
            2049,
            3073,
            4097,
            6145,
            8193,
            12289,
            16385,
            24577,
          ];
          const distanceExtra = [
            0,
            0,
            0,
            0,
            1,
            1,
            2,
            2,
            3,
            3,
            4,
            4,
            5,
            5,
            6,
            6,
            7,
            7,
            8,
            8,
            9,
            9,
            10,
            10,
            11,
            11,
            12,
            12,
            13,
            13,
          ];
          final length = lengthBase[s - 257] + bits.read(lengthExtra[s - 257]);
          final ds = distance.symbol(bits);
          if (ds >= 30) invalidMedia();
          final d = distanceBase[ds] + bits.read(distanceExtra[ds]);
          if (d > count || d > 32768) invalidMedia();
          if (length > limit - count) throw const CapacityExceeded();
          for (var i = 0; i < length; i++) {
            emit(window[(count - d) & 32767]);
          }
        }
      } else {
        invalidMedia();
      }
    }
    bits.align();
    if (bits.bit ~/ 8 != bytes.length - 4 ||
        count != limit ||
        ByteData.sublistView(bytes).getUint32(bytes.length - 4) !=
            (b << 16) | a) {
      invalidMedia();
    }
    return count;
  }
}
