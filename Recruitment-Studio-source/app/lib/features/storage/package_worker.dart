import 'dart:async';
import 'dart:io';
import 'dart:isolate';
import 'dart:typed_data';

import '../../shared/operation.dart';
import '../../shared/admission_budget.dart';
import '../../shared/problem.dart';
import '../../shared/work_budget.dart';
import '../../shared/work_limits.dart';
import 'package_zip_io.dart';
import 'package_working_set.dart';

/// One killed-and-drained isolate, all setup admission included in finally.
final class PackageWorker {
  PackageWorker({this.onPhase, this.holdAt, this.timeout = WorkLimits.decodeTimeout});
  final void Function(String)? onPhase;
  final String? holdAt;
  final Duration timeout;
  static final Set<WorkLease> _running = {};
  Future<Uint8List> readEntry(File input, PackageZipEntry entry, {
    required WorkOperation operation, required WorkLease lease}) async {
    lease.forChild(operation);
    final requiredBytes = PackageWorkingSet.entryReservation(entry);
    if (lease.bytes < requiredBytes) { throw const CapacityExceeded(); }
    if (entry.offset < 0 || entry.offset > WorkLimits.projectCompressedBytes ||
        entry.compressedSize > WorkLimits.projectCompressedBytes - entry.offset ||
        entry.crc32 < 0 || entry.crc32 > 0xffffffff) {
      throw const PackageFailure('payload range');
    }
    if (_running.contains(lease)) { throw StateError('Package worker already running'); }
    final control = WorkerAdmission.acquire();
    _running.add(lease);
    ReceivePort? replies, errors, exits;
    StreamSubscription<dynamic>? rs, es, xs;
    Timer? timer;
    void Function()? unsubscribe;
    final exited = Completer<void>(), drained = Completer<void>(), stopped = Completer<void>();
    final ready = Completer<SendPort>();
    Isolate? isolate;
    RandomAccessFile? handle;
    Object? failure;
    TransferableTypedData? output;
    var enrolled = false;
    void phase(String name) {
      try { onPhase?.call(name); }
      catch (_) {
        failure ??= const PackageFailure('worker observer');
        isolate?.kill(priority: Isolate.immediate);
        if (!stopped.isCompleted) { stopped.complete(); }
      }
    }
    void stop(Object error) {
      failure ??= error;
      if (!stopped.isCompleted) { stopped.complete(); }
      try { phase('killRequested'); }
      finally { isolate?.kill(priority: Isolate.immediate); }
    }
    try {
      operation.registerPending(drained.future);
      enrolled = true;
      unsubscribe = operation.addStopListener(() =>
        stop(const OperationException(ProblemCode.operationCancelled)));
      replies = ReceivePort(); errors = ReceivePort(); exits = ReceivePort();
      timer = Timer(timeout, () => stop(const PackageFailure('worker timeout')));
      rs = replies.listen((dynamic message) {
        try {
          final m = message as List<Object?>;
          if (m[0] == 'ready') { ready.complete(m[1] as SendPort); }
          else if (m[0] == 'expansion') { phase('expansion'); }
          else {
            if (m[0] == 'result') { output = m[1] as TransferableTypedData; }
            else {
              failure ??= m[0] == 'capacity' ? const CapacityExceeded()
                  : const PackageFailure('invalid payload');
            }
            (m[2] as SendPort).send(true);
          }
        } catch (_) { stop(const PackageFailure('worker protocol')); }
      });
      es = errors.listen((dynamic _) => stop(const PackageFailure('worker error')));
      xs = exits.listen((dynamic _) {
        try { phase('exited'); }
        finally { if (!exited.isCompleted) { exited.complete(); } }
      });
      isolate = await Isolate.spawn(_entry,
        [entry.expandedSize, entry.method, entry.crc32, replies.sendPort, holdAt],
        onExit: exits.sendPort, onError: errors.sendPort,
        errorsAreFatal: true, paused: true);
      if (failure != null) { isolate.kill(priority: Isolate.immediate); throw failure!; }
      isolate.resume(isolate.pauseCapability!);
      await Future.any<void>([ready.future.then<void>((_) {}), exited.future, stopped.future]);
      if (failure != null) { throw failure!; }
      if (!ready.isCompleted) { throw const PackageFailure('worker startup'); }
      requireRegularPath(input);
      handle = await input.open();
      if (entry.offset > await handle.length() - entry.compressedSize) {
        throw const PackageFailure('payload range');
      }
      await handle.setPosition(entry.offset);
      final compressed = Uint8List(entry.compressedSize);
      for (var offset = 0; offset < compressed.length; offset += 65536) {
        packageCheckOperation(operation);
        final end = offset + 65536 < compressed.length ? offset + 65536 : compressed.length;
        if (await handle.readInto(compressed, offset, end) != end - offset) {
          throw const PackageFailure('short payload');
        }
        if (offset == 0) {
          phase('read');
          if (holdAt == 'read') { await stopped.future; }
        }
        if (failure != null) { throw failure!; }
        packageCheckOperation(operation);
      }
      await handle.close(); handle = null;
      phase('inputClosed');
      packageCheckOperation(operation);
      if (failure != null) { throw failure!; }
      (await ready.future).send(TransferableTypedData.fromList([compressed]));
      await exited.future;
      packageCheckOperation(operation);
      if (failure != null) { throw failure!; }
      if (output == null) { throw const PackageFailure('worker exited without payload'); }
      return output!.materialize().asUint8List();
    } finally {
      try {
        try { await handle?.close(); }
        finally {
          if (handle != null) { phase('inputClosed'); }
          if (isolate != null && !exited.isCompleted) {
            isolate.kill(priority: Isolate.immediate);
            await exited.future;
          }
        }
      } finally {
        timer?.cancel(); unsubscribe?.call();
        try { await rs?.cancel(); }
        finally {
          try { await es?.cancel(); }
          finally {
            try { await xs?.cancel(); }
            finally {
              replies?.close(); errors?.close(); exits?.close();
              _running.remove(lease); control.release();
              if (enrolled) { drained.complete(); }
            }
          }
        }
      }
      phase('drained');
      await Future<void>.delayed(Duration.zero);
      if (failure == null) { packageCheckOperation(operation); }
    }
  }
}

Future<void> _entry(List<Object?> args) async {
  final reply = args[3] as SendPort, holdAt = args[4] as String?;
  final inbox = ReceivePort();
  reply.send(['ready', inbox.sendPort]);
  final compressed = (await inbox.first as TransferableTypedData)
      .materialize()
      .asUint8List();
  inbox.close();
  final ack = ReceivePort();
  List<Object?> result;
  try {
    var observedExpansion = false;
    void progress() {
      if (observedExpansion) {
        return;
      }
      observedExpansion = true;
      reply.send(['expansion']);
      if (holdAt == 'expansion') {
        // Test-only mid-expansion stall: no IO handles live in the isolate.
        while (true) {}
      }
    }

    final bytes = args[1] == 0
        ? compressed
        : expandDeflate(compressed, args[0] as int, onProgress: progress);
    if (bytes.length != args[0] || PackageZipIO.crc(bytes) != args[2]) {
      throw const PackageFailure('CRC or actual size');
    }
    result = [
      'result',
      TransferableTypedData.fromList([bytes]),
      ack.sendPort,
    ];
  } on CapacityExceeded {
    result = ['capacity', null, ack.sendPort];
  } catch (_) {
    result = ['invalid', null, ack.sendPort];
  }
  reply.send(result);
  await ack.first;
  ack.close();
}

/// Strict RFC1951 reader. Fixed-size output is paid before allocation. Writes
/// check the actual count; BFINAL, EOB, tree validity, backrefs, LEN/NLEN, exact
/// input consumption and padding are all checked, unlike tolerant inflate APIs.
Uint8List expandDeflate(
  Uint8List input,
  int expected, {
  void Function()? onProgress,
}) {
  if (expected < 0 || expected > WorkLimits.projectExpandedBytes) {
    throw const CapacityExceeded();
  }
  if (input.length > WorkLimits.projectCompressedBytes) { throw const CapacityExceeded(); }
  final copying = (WorkBudget.shared() as WorkBudgetController).reserveCopy(input.length + expected);
  AdmissionTicket? ordinary;
  try {
  ordinary = AdmissionBudget.shared.reserve(256 * 1024);
  final bits = _Bits(input), out = Uint8List(expected);
  var size = 0;
  void byte(int b) {
    if (size == expected) {
      throw const CapacityExceeded();
    }
    out[size++] = b;
    onProgress?.call();
  }

  var finalBlock = false;
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
  while (!finalBlock) {
    finalBlock = bits.read(1) == 1;
    final type = bits.read(2);
    if (type == 0) {
      bits.align();
      final n = bits.read(16), complement = bits.read(16);
      if ((n ^ complement) != 65535) {
        throw const FormatException('DEFLATE LEN');
      }
      for (var i = 0; i < n; i++) {
        byte(bits.read(8));
      }
      continue;
    }
    if (type == 3) {
      throw const FormatException('DEFLATE block');
    }
    late _Tree literals, distances;
    if (type == 1) {
      literals = _Tree([
        for (var i = 0; i < 288; i++)
          i < 144
              ? 8
              : i < 256
              ? 9
              : i < 280
              ? 7
              : 8,
      ]);
      distances = _Tree(List.filled(32, 5));
    } else {
      final nl = bits.read(5) + 257,
          nd = bits.read(5) + 1,
          nc = bits.read(4) + 4;
      if (nl > 286 || nd > 32) {
        throw const FormatException('DEFLATE tree count');
      }
      // RFC order (19 symbols); explicit below avoids allocating input fanout.
      const codeOrder = [
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
      final codeLengths = List<int>.filled(19, 0);
      for (var i = 0; i < nc; i++) {
        codeLengths[codeOrder[i]] = bits.read(3);
      }
      final codes = _Tree(codeLengths, requireComplete: true),
          lengths = <int>[];
      while (lengths.length < nl + nd) {
        final symbol = codes.symbol(bits);
        if (symbol < 16) {
          lengths.add(symbol);
          continue;
        }
        final int repeat, value;
        if (symbol == 16) {
          if (lengths.isEmpty) {
            throw const FormatException('DEFLATE repeat');
          }
          repeat = bits.read(2) + 3;
          value = lengths.last;
        } else if (symbol == 17) {
          repeat = bits.read(3) + 3;
          value = 0;
        } else {
          repeat = bits.read(7) + 11;
          value = 0;
        }
        if (repeat > nl + nd - lengths.length) {
          throw const FormatException('DEFLATE repeat overflow');
        }
        lengths.addAll(List.filled(repeat, value));
      }
      if (lengths[256] == 0) {
        throw const FormatException('DEFLATE missing EOB');
      }
      literals = _Tree(lengths.sublist(0, nl));
      distances = _Tree(lengths.sublist(nl), allowEmpty: true);
    }
    while (true) {
      final symbol = literals.symbol(bits);
      if (symbol < 256) {
        byte(symbol);
        continue;
      }
      if (symbol == 256) {
        break;
      }
      if (symbol > 285) {
        throw const FormatException('DEFLATE length');
      }
      final i = symbol - 257, n = lengthBase[i] + bits.read(lengthExtra[i]);
      final d = distances.symbol(bits);
      if (d >= 30) {
        throw const FormatException('DEFLATE distance');
      }
      final distance = distanceBase[d] + bits.read(distanceExtra[d]);
      if (distance > size || distance > 32768) {
        throw const FormatException('DEFLATE backreference');
      }
      if (n > expected - size) {
        throw const CapacityExceeded();
      }
      for (var j = 0; j < n; j++) {
        byte(out[size - distance]);
      }
    }
  }
  // RFC padding bits have no payload meaning, but no trailing whole bytes are
  // permitted. Alignment here does not repair a malformed/truncated stream.
  bits.align();
  if (bits.position != input.length || size != expected) {
    throw const FormatException('DEFLATE terminal');
  }
  return out;
  } finally { ordinary?.release(); copying.release(); }
}

final class _Bits {
  _Bits(this.bytes);
  final Uint8List bytes;
  int position = 0, buffer = 0, count = 0;
  int read(int n) {
    while (count < n) {
      if (position == bytes.length) {
        throw const FormatException('Truncated DEFLATE');
      }
      buffer |= bytes[position++] << count;
      count += 8;
    }
    final value = buffer & ((1 << n) - 1);
    buffer >>= n;
    count -= n;
    return value;
  }

  void align() {
    buffer = 0;
    count = 0;
  }
}

final class _Tree {
  _Tree(
    List<int> lengths, {
    bool allowEmpty = false,
    bool requireComplete = false,
  }) {
    final counts = List<int>.filled(16, 0), next = List<int>.filled(16, 0);
    for (final n in lengths) {
      if (n < 0 || n > 15) {
        throw const FormatException('DEFLATE code length');
      }
      counts[n]++;
    }
    var slots = 1, code = 0;
    for (var n = 1; n <= 15; n++) {
      slots = slots * 2 - counts[n];
      if (slots < 0) {
        throw const FormatException('Oversubscribed DEFLATE tree');
      }
      code = (code + (n == 1 ? 0 : counts[n - 1])) << 1;
      next[n] = code;
    }
    final nonzero = lengths.length - counts[0];
    if (nonzero == 0 && !allowEmpty ||
        slots != 0 &&
            (requireComplete || nonzero != 1 || counts[1] != 1) &&
            nonzero != 0) {
      throw const FormatException('Incomplete DEFLATE tree');
    }
    for (var i = 0; i < lengths.length; i++) {
      final n = lengths[i];
      if (n == 0) {
        continue;
      }
      var c = next[n]++, reversed = 0;
      for (var b = 0; b < n; b++) {
        reversed = reversed * 2 + (c & 1);
        c >>= 1;
      }
      table[(n << 16) | reversed] = i;
    }
  }
  final Map<int, int> table = {};
  int symbol(_Bits bits) {
    var code = 0;
    for (var n = 1; n <= 15; n++) {
      code |= bits.read(1) << (n - 1);
      final s = table[(n << 16) | code];
      if (s != null) {
        return s;
      }
    }
    throw const FormatException('Invalid DEFLATE symbol');
  }
}
