/// Native document contracts. Import this library for both adapters; the part
/// files share private capability constructors so callers cannot forge targets.
library;

import 'dart:async';
import 'dart:ffi' as ffi;
import 'dart:isolate';
import 'dart:io';
import 'dart:math';

import 'package:crypto/crypto.dart';
import 'package:file_selector/file_selector.dart' as selector;
import 'package:flutter/services.dart';
import 'package:path_provider/path_provider.dart';

import '../../shared/admission_budget.dart';
import '../../shared/operation.dart';
import '../../shared/problem.dart';
import '../../shared/work_budget.dart';
import '../../shared/work_limits.dart';
import '_native_argument_owner.dart';

part 'android_document_gateway.dart';
part 'windows_document_gateway.dart';
part 'win32_document_io.dart';
part 'owned_document_stage.dart';

enum WriteStatus { completed, cancelled, failed }

final class DocumentRef {
  DocumentRef._(this.id, this.displayName);
  final String id;
  final String displayName;
  @override
  String toString() => 'DocumentRef(opaque)';
}

final class DocumentIdentity {
  const DocumentIdentity({required this.bytes, required this.sha256});
  final int bytes;
  final String sha256;
}

final class PreparedDestination {
  PreparedDestination._({
    required this.opaqueId,
    required this.operationId,
    required List<String> displayNames,
    required List<String> approvedNames,
    required this.canReadBack,
    required this.canSafelyReplace,
    required this.providerMayRename,
    required this.ownsReservedPlaceholder,
  }) : displayNames = List.unmodifiable(displayNames),
       approvedNames = List.unmodifiable(approvedNames);
  final String opaqueId, operationId;
  final List<String> displayNames, approvedNames;
  // These adapters admit only new single documents. A collision is refused,
  // never advertised as an approved existing replacement.
  List<String> get collisions => const [];
  Map<String, DocumentIdentity> get existingIdentities => const {};
  final bool canReadBack,
      canSafelyReplace,
      providerMayRename,
      ownsReservedPlaceholder;
  @override
  String toString() => 'PreparedDestination(opaque)';
}

final class WriteReceipt {
  WriteReceipt._({
    required this.status,
    required this.operationId,
    this.target,
    this.confirmedBytes,
    this.confirmedSha256,
    this.problem,
    this.residualPlaceholder = false,
  });
  final WriteStatus status;
  final String operationId;
  final DocumentRef? target;
  final int? confirmedBytes;
  final String? confirmedSha256;
  final Problem? problem;

  /// The provider may contain an empty/partial document after failure. Only
  /// completed carries verified data; this flag is never a success assertion.
  final bool residualPlaceholder;
}

final class DocumentGatewayException implements Exception {
  const DocumentGatewayException(
    this.problem, {
    this.residualPlaceholder = false,
  });
  final Problem problem;
  final bool residualPlaceholder;
  @override
  String toString() => 'Document gateway: ${problem.code.name}';
}

abstract interface class DocumentGateway {
  Future<DocumentRef?> pickOpen(
    Set<String> acceptedMimeTypes, {
    Operation? operation,
  });
  Future<PreparedDestination?> prepareSave(
    List<String> suggestedNames,
    String mimeType, {
    Operation? operation,
    DocumentRef? replace,
    bool overwriteApproved = false,
  });
  Future<WriteReceipt> writePrepared(
    File source,
    PreparedDestination destination,
    String selectedName, {
    Operation? operation,
  });
  Future<void> abortPrepared(
    PreparedDestination destination, {
    Operation? operation,
  });
  Future<File> stageRead(
    DocumentRef ref,
    int maximumBytes, {
    Operation? operation,
  });

  /// Await before disposing a gateway. Call abortPrepared in pipeline finally,
  /// before Operation.finish. Idle platform cleanup cannot be joined to the
  /// core Operation's synchronous drain-finalizer API; close joins that cleanup.
  Future<void> close();
}

/// Optional application wrapper contract. The delegate is not authority:
/// retirement still authenticates the exact native receiver, capability and root.
/// Only one explicit hop is resolved; arbitrary/nested wrappers stay unsupported.
abstract interface class OpenCapabilityRetirementDelegate {
  DocumentGateway get openCapabilityDelegate;
}

/// Application retirement of an authentic copied-source capability. Existing
/// implementers remain compatible; only managed native gateways support it.
/// This retires the source, not the root-owned stage or the caller's operation.
extension OpenCapabilityRetirement on DocumentGateway {
  Future<void> retireOpen(
    DocumentRef ref, {
    required Operation operation,
  }) async {
    final supplied = this;
    final DocumentGateway resolved;
    if (supplied is OpenCapabilityRetirementDelegate) {
      try {
        resolved = (supplied as OpenCapabilityRetirementDelegate)
            .openCapabilityDelegate;
      } catch (_) {
        // A foreign getter supplies no trusted problem or residual evidence.
        throw const DocumentGatewayException(
          Problem(
            code: ProblemCode.ioFailure,
            severity: ProblemSeverity.error,
            actionLabel: 'Tentar novamente',
          ),
        );
      }
    } else {
      resolved = supplied;
    }
    if (resolved is! _Gateway) throw _failure(ProblemCode.invalidSelection);
    final gateway = resolved;
    final entry = gateway._lookup(ref.id, ref, operation);
    if (entry.destination != null) throw _failure(ProblemCode.invalidSelection);
    await gateway._run(entry.operation, () async {
      try {
        await gateway._releaseNative(entry);
        gateway._forget(entry);
      } catch (error) {
        // The paid identity stays available to existing close/stop cleanup.
        // Finishing must observe a failed drain rather than await its own tail.
        gateway._settleFailedDrain(entry);
        // A stop received while _run was busy already consumed its listener.
        // Failed physical release is terminal error, never successful retirement;
        // retain the entry/credit for close while unblocking caller finalization.
        if (entry.operation.isCancelled && !entry.drain.isCompleted) {
          entry.drain.completeError(DocumentGatewayException(_problem(error)));
        }
        throw DocumentGatewayException(_problem(error));
      }
    });
  }
}

/// Application-only read-only affinity. No capability or lifetime transfer.
final class PreparedOperationBinding {
  PreparedOperationBinding._(this.operation, this.implicit);
  final WorkOperation operation;
  final bool implicit;
}

PreparedOperationBinding? preparedOperationFor(
  DocumentGateway gateway,
  PreparedDestination destination,
) {
  if (gateway is! _Gateway) return null;
  if (gateway._closed) throw _failure(ProblemCode.invalidSelection);
  final entry = gateway._lookup(destination.opaqueId, destination, null);
  _work(entry.operation);
  // The exact operation reference can escape independently of this wrapper.
  // Keep its small alias envelope monotonic; never rely on collection timing.
  AdmissionBudget.shared.reserve(2048);
  return PreparedOperationBinding._(entry.operation, entry.implicit);
}

abstract interface class DocumentChannel {
  Future<Map<String, Object?>> invoke(String method, Map<String, Object?> args);
}

final class MethodDocumentChannel implements DocumentChannel {
  const MethodDocumentChannel();
  static const _channel = MethodChannel('local.recruitment/documents');
  @override
  Future<Map<String, Object?>> invoke(
    String method,
    Map<String, Object?> args,
  ) async {
    final result = await _channel.invokeMapMethod<String, Object?>(
      method,
      args,
    );
    if (result == null || result.length > 16) throw _failure();
    return result;
  }
}

const _chunkBytes = 64 * 1024;
const _maximumDocumentBytes = WorkLimits.exportStagingBytes;
const _maximumHandles = 32;
final _random = Random.secure();
String _token() => List.generate(
  16,
  (_) => _random.nextInt(256).toRadixString(16).padLeft(2, '0'),
).join();
DocumentGatewayException _failure([
  ProblemCode code = ProblemCode.ioFailure,
  String action = 'Tentar novamente',
  bool residual = false,
]) => DocumentGatewayException(
  Problem(code: code, severity: ProblemSeverity.error, actionLabel: action),
  residualPlaceholder: residual,
);
void _name(String name) {
  if (name.isEmpty ||
      name.length > 240 ||
      name == '.' ||
      name == '..' ||
      name.contains(RegExp(r'[\x00-\x1f/\\:]')) ||
      name.endsWith('.') ||
      name.endsWith(' ')) {
    throw _failure(ProblemCode.invalidSelection, 'Escolher outro nome');
  }
  final stem = name.split('.').first.toUpperCase();
  if (RegExp(r'^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$').hasMatch(stem) ||
      name.contains(RegExp(r'[<>"|?*]'))) {
    throw _failure(ProblemCode.invalidSelection, 'Escolher outro nome');
  }
}

void _mime(String mime) {
  if (mime.length > 128 ||
      !RegExp(r'^[a-zA-Z0-9!#$&^_.+-]+/[a-zA-Z0-9!#$&^_.+*-]+$')
          .hasMatch(mime)) {
    throw _failure(ProblemCode.invalidSelection);
  }
}

void _newOnly(List<String> names, String mime, DocumentRef? replace) {
  if (names.length != 1) {
    throw _failure(ProblemCode.invalidSelection, 'Exportar ZIP');
  }
  _name(names.single);
  _mime(mime);
  if (replace != null) {
    throw _failure(ProblemCode.invalidSelection, 'Guardar uma cópia');
  }
}

void _limit(int maximum) {
  if (maximum < 0 || maximum > _maximumDocumentBytes) {
    throw const CapacityExceeded();
  }
}

WorkOperation _work(Operation operation) {
  if (operation is! WorkOperation) throw _failure(ProblemCode.invalidSelection);
  if (operation.isFinishing) throw _failure(ProblemCode.operationCancelled);
  operation.throwIfCancelled();
  return operation;
}

final class _Entry {
  _Entry(
    this.operation,
    this.implicit,
    this.nativeId,
    this.ref,
    this.destination,
    this.ticket,
  );
  final WorkOperation operation;
  final bool implicit;
  final String nativeId;
  final DocumentRef ref;
  final PreparedDestination? destination;
  final AdmissionTicket ticket;
  void Function() unsubscribe = () {};
  final drain = Completer<void>();
  bool consumed = false;
  bool residualKnown = false;
  bool nativeEffectKnown = false, nativeHasEffect = false;
}

final class _StageCreationFailure implements Exception {
  _StageCreationFailure(this.stage, this.error);
  final _DocumentStage stage;
  final Object error;
}

abstract class _Gateway implements DocumentGateway {
  _Gateway({this._stagingDirectory, WorkBudgetController? budget})
    : _budget = budget ?? WorkBudget.shared() as WorkBudgetController {
    _control = AdmissionBudget.shared.reserve(4096);
  }
  final Directory? _stagingDirectory;
  final WorkBudgetController _budget;
  late final AdmissionTicket _control;
  final Map<String, _Entry> _entries = {};
  final Set<Future<void>> _cleanup = {};
  final Map<_DocumentStage, AdmissionTicket> _residualStages = {};
  bool _closed = false, _busy = false;
  bool _cleanupFailed = false;
  Future<void>? _closeFuture;
  Future<void>? _activeDrain;
  Future<T> _run<T>(
    WorkOperation op,
    Future<T> Function() action, {
    bool allowCancelled = false,
    bool finishImplicit = false,
    bool Function()? finishWhenDrained,
    bool registerOperation = true,
  }) async {
    if (_closed || _busy || (op.isFinishing && !allowCancelled)) {
      throw _failure(ProblemCode.invalidSelection);
    }
    if (!allowCancelled) op.throwIfCancelled();
    final credit = AdmissionBudget.shared.reserve(256 * 1024);
    // Streaming I/O is light snapshot work, not a second codec worker. Copy
    // credit competes with the SAME 256 MiB domain and has explicit lifetime.
    late final WorkCopyReservation buffers;
    try {
      buffers = _budget.reserveCopy(8 * _chunkBytes);
    } catch (_) {
      credit.release();
      rethrow;
    }
    _busy = true;
    final done = Completer<void>();
    final drained = Completer<void>();
    _activeDrain = drained.future;
    var invoked = false;
    try {
      if (registerOperation && !op.isCancelled && !op.isFinishing) {
        op.registerPending(done.future);
      }
      invoked = true;
      return await action();
    } finally {
      // Release the operation marker only after the admitted action's complete
      // terminal cleanup. Implicit finish must not await its own marker.
      done.complete();
      try {
        if (invoked && (finishImplicit || finishWhenDrained?.call() == true)) {
          await op.finish();
        }
      } finally {
        _busy = false;
        _activeDrain = null;
        drained.complete();
        buffers.release();
        credit.release();
      }
    }
  }

  _Entry _issue(
    WorkOperation op,
    bool implicit,
    String nativeId,
    String name, {
    String? approvedName,
    bool placeholder = false,
    bool renames = false,
  }) {
    _name(name);
    if (nativeId.isEmpty ||
        nativeId.length > 128 ||
        _entries.length >= _maximumHandles) {
      throw const CapacityExceeded();
    }
    final credit = AdmissionBudget.shared.reserve(32768);
    try {
      final id = _token();
      final ref = DocumentRef._(id, name);
      final d = approvedName == null
          ? null
          : PreparedDestination._(
              opaqueId: id,
              operationId: op.id,
              displayNames: [name],
              approvedNames: [approvedName],
              canReadBack: true,
              canSafelyReplace: false,
              providerMayRename: renames,
              ownsReservedPlaceholder: placeholder,
            );
      // Public String aliases can outlive their enclosing capability/list.
      // Conservatively retain their small ordinary credit until process exit;
      // no collection timing or wrapper finalizer can discharge those aliases.
      AdmissionBudget.shared.reserve(8192);
      final e = _Entry(op, implicit, nativeId, ref, d, credit);
      // Pay the actual operation drain observation while admission is available.
      // close/stop never has to allocate a new pending record at exhaustion.
      op.registerPending(e.drain.future);
      try {
        e.unsubscribe = op.addStopListener(() {
          if (e.consumed || _closed || _busy) return;
          if (_cleanup.length >= _maximumHandles) {
            _cleanupFailed = true;
            return;
          }
          // Preserve registration through cleanup; NEVER release a placeholder
          // that has entered native commit. Native release reconciles its state.
          late Future<void> f;
          f = _stopCleanup(e)
              .catchError((Object _) {
                /* Kept as an unresolved entry; close retries cleanup. */
              })
              .whenComplete(() {
                _cleanup.remove(f);
              });
          _cleanup.add(f);
        });
      } catch (_) {
        e.drain.complete();
        rethrow;
      }
      _entries[id] = e;
      return e;
    } catch (_) {
      credit.release();
      rethrow;
    }
  }

  void _settleFailedDrain(_Entry e) {
    if ((e.implicit || e.operation.isFinishing) && !e.drain.isCompleted) {
      e.drain.completeError(_failure());
    }
  }

  // Idle cleanup is paid by the entry's existing custody credit. Do not acquire
  // fresh per-call streaming reservations at stop/low headroom.
  Future<void> _stopCleanup(_Entry e) async {
    _busy = true;
    final done = Completer<void>();
    _activeDrain = done.future;
    try {
      await _releaseNative(e);
      _forget(e);
      if (e.implicit && !e.operation.isFinishing) await e.operation.finish();
    } catch (error, stack) {
      if (!e.drain.isCompleted) e.drain.completeError(_failure(), stack);
      rethrow;
    } finally {
      _busy = false;
      _activeDrain = null;
      done.complete();
    }
  }

  _Entry _lookup(String id, Object capability, Operation? operation) {
    final e = _entries[id];
    if (e == null ||
        e.consumed ||
        !(identical(capability, e.ref) ||
            identical(capability, e.destination)) ||
        (operation != null && !identical(operation, e.operation))) {
      throw _failure(ProblemCode.invalidSelection);
    }
    return e;
  }

  void _forget(_Entry e) {
    e.consumed = true;
    e.unsubscribe();
    _entries.remove(e.ref.id);
    if (!e.drain.isCompleted) e.drain.complete();
    e.ticket.release();
  }

  Future<void> _releaseNative(_Entry entry);
  Future<void> _releaseAdapter() async {}
  Future<_DocumentStage> _staging() async {
    final root = _stagingDirectory ?? await getTemporaryDirectory();
    return _DocumentStage.create(root);
  }

  Future<File> _stageOwned(
    _Entry e,
    Future<void> Function(_DocumentStage) copy,
  ) {
    return _run(e.operation, () async {
      _DocumentStage? stage;
      var released = false;
      AdmissionTicket? stageCredit;
      AdmissionTicket? pathCredit;
      try {
        if (_residualStages.length >= _maximumHandles) {
          throw const CapacityExceeded();
        }
        // Pay worst-case retained ancestry strings/handles BEFORE creation.
        // Refusal is also inside terminal custody: implicit acquisition drains.
        stageCredit = AdmissionBudget.shared.reserve(
          64 * (512 + 4 * WorkLimits.stagingPathUnits),
        );
        // This per-stage ticket is independent of producer ancestry, operation
        // records and the per-capability scalar allowance. Pay BEFORE Windows
        // creates its path as well as before Linux generates/publicizes a name.
        // 512 + 4*maxUnits covers the bounded descriptor and generated UTF-16
        // path/name aliases. Successful File.path can escape its File wrapper:
        // SDK scalar targets cannot be finalized, so never refund success.
        pathCredit = AdmissionBudget.shared.reserve(
          512 + 4 * WorkLimits.stagingPathUnits,
        );
        stage = await _staging();
        await copy(stage);
        await stage.seal();
        _work(e.operation); // finish/stop must refuse before stage publication
        if (e.implicit) {
          await _releaseNative(e);
          released = true;
          _forget(e);
          await e.operation.finish();
        }
        // Linux has no staging pathname until every producer tail succeeds.
        final file = stage.publish();
        if (!e.implicit) e.operation.ownStaging(file);
        await stage.handoff();
        stageCredit.release();
        return file;
      } catch (caught) {
        // No caller-visible result escaped. Producer/residual credit independently
        // protects generated private names even if physical discard fails.
        pathCredit?.release();
        final error = caught is _StageCreationFailure ? caught.error : caught;
        if (caught is _StageCreationFailure) stage = caught.stage;
        var residual = false;
        try {
          await stage?.discard();
          stageCredit?.release();
        } catch (_) {
          residual = true;
          if (stage != null && stageCredit != null) {
            _residualStages[stage] = stageCredit;
          } else {
            stageCredit?.release();
          }
        }
        if (e.implicit || e.operation.isFinishing || e.operation.isCancelled) {
          if (!released) {
            try {
              await _releaseNative(e);
              _forget(e);
            } catch (_) {
              /* retain paid capability for close */
            }
          }
          _settleFailedDrain(e);
          if (e.implicit) {
            try {
              await e.operation.finish();
            } catch (_) {
              /* initiating error wins */
            }
          }
        }
        if (residual) {
          throw DocumentGatewayException(
            _problem(error),
            residualPlaceholder: true,
          );
        }
        if (error is CapacityExceeded || error is DocumentGatewayException) {
          throw error;
        }
        throw DocumentGatewayException(_problem(error));
      }
    }, registerOperation: !e.implicit);
  }

  WriteReceipt _receipt(
    WriteStatus status,
    String operationId, {
    DocumentRef? target,
    _Digest? digest,
    Problem? problem,
    bool residual = false,
  }) {
    return WriteReceipt._(
      status: status,
      operationId: operationId,
      target: target,
      confirmedBytes: digest?.bytes,
      confirmedSha256: digest?.hash,
      problem: problem,
      residualPlaceholder: residual,
    );
  }

  @override
  Future<void> close() {
    if (_closeFuture != null) return _closeFuture!;
    final completion = Completer<void>();
    _closeFuture = completion.future; // publish before any teardown callback
    _closed = true;
    _drainClose().then(completion.complete, onError: completion.completeError);
    return _closeFuture!;
  }

  Future<void> _drainClose() async {
    await _activeDrain;
    while (_cleanup.isNotEmpty) {
      await _cleanup.first;
    }
    // Each owned identity gets one independent attempt. Failed identities remain
    // recorded (and paid); they are not silently forgotten to manufacture drain.
    final ids = _entries.keys.toList();
    for (final id in ids) {
      final e = _entries[id];
      if (e == null) continue;
      try {
        await _releaseNative(e);
        _forget(e);
      } catch (error, stack) {
        _cleanupFailed = true;
        if (!e.drain.isCompleted) e.drain.completeError(_failure(), stack);
      } finally {
        if (e.implicit) {
          try {
            await e.operation.finish();
          } catch (_) {
            _cleanupFailed = true;
          }
        }
      }
    }
    try {
      await _releaseAdapter();
    } catch (_) {
      _cleanupFailed = true;
    }
    for (final stage in _residualStages.keys.toList()) {
      try {
        await stage.discard();
        _residualStages.remove(stage)?.release();
      } catch (_) {
        _cleanupFailed = true;
      }
    }
    if (_entries.isEmpty && _residualStages.isEmpty && !_cleanupFailed) {
      _control.release();
    }
    if (_cleanupFailed) {
      throw _failure(
        ProblemCode.ioFailure,
        'Verificar ficheiro residual',
        true,
      );
    }
  }
}

final class _Digest {
  const _Digest(this.bytes, this.hash);
  final int bytes;
  final String hash;
  bool matches(_Digest other) => bytes == other.bytes && hash == other.hash;
}

final class _DigestSink implements Sink<Digest> {
  Digest? value;
  @override
  void add(Digest data) {
    value = data;
  }

  @override
  void close() {}
}

Future<_Digest> _hashFile(
  File file,
  int maximum, {
  WorkOperation? operation,
}) async {
  final output = _DigestSink();
  final hash = sha256.startChunkedConversion(output);
  final buffer = Uint8List(_chunkBytes);
  final input = await file.open(mode: FileMode.read);
  var count = 0;
  try {
    while (true) {
      operation?.throwIfCancelled();
      final n = await input.readInto(buffer);
      if (n == 0) break;
      count += n;
      if (count > maximum) throw const CapacityExceeded();
      hash.add(Uint8List.sublistView(buffer, 0, n));
    }
  } finally {
    await input.close();
    hash.close();
  }
  return _Digest(count, output.value.toString());
}

Object _nativeArgumentFailure(Object error) =>
    error is CapacityExceeded || error is DocumentGatewayException
    ? error
    : DocumentGatewayException(_problem(error));

Problem _problem(Object error) => error is DocumentGatewayException
    ? error.problem
    : error is OperationException
    ? error.problem
    : error is CapacityExceeded
    ? error.problem
    : const Problem(
        code: ProblemCode.ioFailure,
        severity: ProblemSeverity.error,
        actionLabel: 'Tentar novamente',
      );
