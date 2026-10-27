import 'dart:async';
import 'dart:io';
import 'dart:math';

import 'problem.dart';
import 'admission_budget.dart';
import 'work_limits.dart';

final class OperationException implements Exception {
  const OperationException(this.code);
  final ProblemCode code;
  Problem get problem => Problem(code: code, severity: ProblemSeverity.error);
  @override
  String toString() => 'Operation failed: ${code.name}';
}

abstract interface class Operation {
  factory Operation.create({
    String? projectId,
    int? revision,
    int? sessionGeneration,
  }) = WorkOperation.create;
  String get id;
  bool get isCancelled;
  void cancel();
  void throwIfCancelled();
  void ownStaging(File file);
  Future<void> finish();
}

final class WorkOperation implements Operation {
  factory WorkOperation.create({String? projectId, int? revision,
    int? sessionGeneration, Future<void> Function(File)? deleteStaging}) {
    if ((revision != null && revision < 0) ||
        (sessionGeneration != null && sessionGeneration < 0)) {
      throw ArgumentError('Invalid operation scope');
    }
    if ((projectId?.length ?? 0) > WorkLimits.fieldUtf16Units ||
        _live >= WorkLimits.liveOperations) { throw const CapacityExceeded(); }
    final ticket = AdmissionBudget.shared.reserve(4096 + 4 * (projectId?.length ?? 0));
    try {
      final op = WorkOperation._(projectId, revision, sessionGeneration,
        deleteStaging ?? _deleteFile, ticket);
      _live++;
      return op;
    } catch (_) { ticket.release(); rethrow; }
  }
  WorkOperation._(this.projectId, this.revision, this.sessionGeneration,
    this._deleteStaging, this._ticket)
    : id = List.generate(16, (_) => Random.secure().nextInt(256)
        .toRadixString(16).padLeft(2, '0')).join();
  static int _live = 0;
  final AdmissionTicket _ticket;
  @override
  final String id;
  final String? projectId;
  final int? revision, sessionGeneration;
  final Future<void> Function(File) _deleteStaging;
  static Future<void> _deleteFile(File file) async { await file.delete(); }
  bool _cancelled = false, _finishing = false, _closed = false;
  Future<void>? _finish;
  final Map<String, _OwnedStaging> _staging = {};
  final Map<Future<void>, AdmissionTicket> _pending = {};
  final Map<void Function(), AdmissionTicket> _drainFinalizers = {};
  final List<_PaidCallback> _idleCallbacks = [];
  final Map<void Function(), AdmissionTicket> _stopListeners = {};
  final List<DeferredRelease> _releases = [];
  bool _pendingFailed = false, _dispatchingIdle = false;
  bool get isFinishing => _finishing;

  void registerPending(Future<void> completion) {
    _registerPending(completion);
  }
  void _registerPending(Future<dynamic> completion, {void Function(dynamic)? onSuccess, void Function()? onFailure}) {
    _checkOpen();
    if (_pending.length >= WorkLimits.pendingCompletions) {
      throw const CapacityExceeded();
    }
    final ticket = AdmissionBudget.shared.reserve(1024);
    try {
      late Future<void> observed;
      observed = completion.then<void>((value) {
        try { onSuccess?.call(value); } catch (_) { _pendingFailed = true; }
      }, onError: (Object _, StackTrace _) {
        onFailure?.call();
        _pendingFailed = true;
      }).whenComplete(() {
        _pending.remove(observed)?.release();
        _dispatchIdle();
      });
      _pending[observed] = ticket;
    } catch (_) { ticket.release(); rethrow; }
  }
  void Function() registerDrainFinalizer(void Function() callback) {
    _checkOpen();
    if (_drainFinalizers.containsKey(callback)) { return () {}; }
    if (_drainFinalizers.length + _releases.length >= WorkLimits.drainFinalizers) {
      throw const CapacityExceeded();
    }
    final ticket = AdmissionBudget.shared.reserve(512);
    _drainFinalizers[callback] = ticket;
    return () { _drainFinalizers.remove(callback)?.release(); };
  }
  /// Admission pays an indispensable release path NOW, not at exhaustion/finish.
  DeferredRelease registerRelease(void Function() callback) {
    _checkOpen();
    if (_releases.length + _drainFinalizers.length >= WorkLimits.drainFinalizers) {
      throw const CapacityExceeded();
    }
    final ticket = AdmissionBudget.shared.reserve(1024);
    final record = DeferredRelease._(this, callback, ticket);
    _releases.add(record);
    return record;
  }
  void afterPending(void Function() callback) {
    if (_closed) {
      // A terminal drained notification observes prior work; it is not a new
      // queue item, admission ticket, producer, staging claim, or open operation.
      if (_pending.isNotEmpty || _idleCallbacks.isNotEmpty || _releases.isNotEmpty) {
        throw StateError('Closed operation is not drained');
      }
      _run(callback);
      return;
    }
    if (_idleCallbacks.length >= WorkLimits.idleCallbacks) {
      throw const CapacityExceeded();
    }
    final ticket = AdmissionBudget.shared.reserve(512);
    _idleCallbacks.add(_PaidCallback(callback, ticket));
    _dispatchIdle();
  }
  void _dispatchIdle() {
    if (_dispatchingIdle) { return; }
    _dispatchingIdle = true;
    try {
      while (_pending.isEmpty) {
        if (_idleCallbacks.isNotEmpty) {
          final record = _idleCallbacks.removeAt(0);
          try { _run(record.callback); } finally { record.ticket.release(); }
          continue;
        }
        DeferredRelease? next;
        for (final record in _releases) {
          if (record._requested) { next = record; break; }
        }
        if (next == null) { break; }
        _releases.remove(next);
        try { _run(next._callback); } finally { next._ticket.release(); }
      }
    } finally { _dispatchingIdle = false; }
  }
  void Function() addStopListener(void Function() callback) {
    _checkOpen();
    if (_stopListeners.containsKey(callback)) { return () {}; }
    if (_stopListeners.length >= WorkLimits.stopListeners) {
      throw const CapacityExceeded();
    }
    final ticket = AdmissionBudget.shared.reserve(512);
    _stopListeners[callback] = ticket;
    return () { _stopListeners.remove(callback)?.release(); };
  }
  void _notifyStop() {
    // No copied drain population; keep payment through each callback's last use.
    while (_stopListeners.isNotEmpty) {
      final callback = _stopListeners.keys.first;
      final ticket = _stopListeners.remove(callback)!;
      try { _run(callback); } finally { ticket.release(); }
    }
  }
  void _run(void Function() callback) {
    try { callback(); } catch (_) { _pendingFailed = true; }
  }
  @override
  bool get isCancelled => _cancelled;
  @override
  void cancel() {
    if (_cancelled) { return; }
    _cancelled = true;
    _notifyStop();
  }
  @override
  void throwIfCancelled() {
    if (_cancelled) { throw const OperationException(ProblemCode.operationCancelled); }
  }
  void _checkOpen() {
    if (_finishing) { throw StateError('Operation is finishing'); }
    throwIfCancelled();
  }
  static bool _regularPath(String path) {
    if (FileSystemEntity.typeSync(path, followLinks: false) !=
        FileSystemEntityType.file) {
      return false;
    }
    var parent = File(path).parent;
    while (true) {
      if (FileSystemEntity.typeSync(parent.path, followLinks: false) !=
          FileSystemEntityType.directory) {
        return false;
      }
      final next = parent.parent;
      if (next.path == parent.path) {
        return true;
      }
      parent = next;
    }
  }


  void ownStagingWhenClosed(Future<File> closedOwnedOutput) {
    _checkOpen();
    if (_staging.length + _stagingHandoffs >= WorkLimits.stagingFiles) {
      throw const CapacityExceeded();
    }
    // Accept ownership only after paying both the bounded future observation
    // and the eventual staging record. Completion needs no fresh admission.
    final stagingTicket = AdmissionBudget.shared.reserve(
      512 + 4 * WorkLimits.stagingPathUnits,
    );
    _stagingHandoffs++;
    try {
      _registerPending(closedOwnedOutput, onSuccess: (value) {
        try {
          _recordStaging(
            value as File,
            handedOff: true,
            prepaid: stagingTicket,
          );
        } finally {
          _stagingHandoffs--;
        }
      }, onFailure: () {
        _stagingHandoffs--;
        stagingTicket.release();
      });
    } catch (_) {
      _stagingHandoffs--;
      stagingTicket.release();
      rethrow;
    }
  }
  int _stagingHandoffs = 0;
  @override
  void ownStaging(File file) { _checkOpen(); _recordStaging(file); }
  void _recordStaging(
    File file, {
    bool handedOff = false,
    AdmissionTicket? prepaid,
  }) {
    final ticket = prepaid ?? AdmissionBudget.shared.reserve(
      512 + 4 * WorkLimits.stagingPathUnits,
    );
    try {
      if (_staging.length + _stagingHandoffs - (handedOff ? 1 : 0) >=
          WorkLimits.stagingFiles) {
        throw const CapacityExceeded();
      }
      // Preserve arbitrary File/IOOverrides receiver and relative input behavior.
      final path = file.absolute.path;
      if (path.length > WorkLimits.stagingPathUnits) { throw const CapacityExceeded(); }
      if (!_regularPath(path)) { throw ArgumentError('Staging must be a regular owned file'); }
      final stat = file.statSync();
      final previous = _staging[path];
      _staging[path] = _OwnedStaging(stat, ticket);
      previous?.ticket.release();
    } catch (_) { ticket.release(); rethrow; }
  }
  @override
  Future<void> finish() {
    if (_finish != null) { return _finish!; }
    final completion = Completer<void>();
    _finish = completion.future;
    _finishing = true;
    _notifyStop();
    _drainAndCleanup().then(completion.complete, onError: completion.completeError);
    return _finish!;
  }
  Future<void> _drainAndCleanup() async {
    try {
      while (_pending.isNotEmpty) { await _pending.keys.first; }
      while (_drainFinalizers.isNotEmpty) {
        final callback = _drainFinalizers.keys.first;
        final ticket = _drainFinalizers.remove(callback)!;
        try { _run(callback); } finally { ticket.release(); }
      }
      for (final record in _releases) { record._requested = true; }
      _dispatchIdle();
      await _cleanup();
      if (_pendingFailed) { throw const OperationException(ProblemCode.ioFailure); }
    } finally {
      _closed = true;
      _ticket.release();
      _live--;
    }
  }
  Future<void> _cleanup() async {
    var failed = false;
    while (_staging.isNotEmpty) {
      final path = _staging.keys.first;
      final record = _staging.remove(path)!;
      try {
        if (!_regularPath(path)) { continue; }
        final now = File(path).statSync(), owned = record.stat;
        if (now.size != owned.size || now.modified != owned.modified ||
            now.changed != owned.changed || now.mode != owned.mode) { continue; }
        await _deleteStaging(File(path));
      } catch (_) { failed = true; }
      finally { record.ticket.release(); }
    }
    if (failed) { throw const OperationException(ProblemCode.ioFailure); }
  }
}

final class _PaidCallback {
  _PaidCallback(this.callback, this.ticket);
  final void Function() callback;
  final AdmissionTicket ticket;
}
final class _OwnedStaging {
  _OwnedStaging(this.stat, this.ticket);
  final FileStat stat;
  final AdmissionTicket ticket;
}
final class DeferredRelease {
  DeferredRelease._(this._owner, this._callback, this._ticket);
  final WorkOperation _owner;
  final void Function() _callback;
  final AdmissionTicket _ticket;
  bool _requested = false;
  void request() {
    if (_requested) { return; }
    _requested = true;
    _owner._dispatchIdle();
  }
}
