import 'dart:async';
import 'dart:collection';

import 'operation.dart';
import 'admission_budget.dart';
import 'problem.dart';
import 'work_limits.dart';

abstract interface class WorkBudget {
  /// Application callers share this controller across import/decode/export.
  factory WorkBudget.shared() => WorkBudgetController._shared;
  Future<WorkLease> acquire(Operation operation, int estimatedBytes);
}

/// One controller defines one accounting domain and one heavy slot.
/// Explicit construction supports isolated host tests; application uses shared().
/// Reservations account owned live bytes; they neither measure RSS nor allocate.
final class WorkBudgetController implements WorkBudget {
  WorkBudgetController({this.capacityBytes = WorkLimits.ownedBufferBytes}) {
    if (capacityBytes < 0 || capacityBytes > WorkLimits.ownedBufferBytes) {
      throw ArgumentError('Invalid owned-buffer capacity');
    }
    AdmissionBudget.shared.reserve(4096).retain(this);
  }
  static final WorkBudgetController _shared = WorkBudgetController();
  final int capacityBytes;
  int _reserved = 0;
  int _reservations = 0;
  WorkLease? _active;
  final Queue<_Waiter> _queue = Queue();
  int get reservedBytes => _reserved;
  int get queuedCount => _queue.length;
  WorkOperation _operation(Operation operation) {
    if (operation is! WorkOperation) {
      throw ArgumentError('Unsupported operation lifecycle');
    }
    operation.throwIfCancelled();
    if (operation.isFinishing) {
      throw StateError('Operation is finishing');
    }
    return operation;
  }

  void _amount(int bytes) {
    if (bytes < 0) {
      throw ArgumentError('Negative byte reservation');
    }
    if (bytes > capacityBytes) {
      throw const CapacityExceeded();
    }
  }

  void _charge(int bytes) {
    _amount(bytes);
    if (bytes > capacityBytes - _reserved) {
      throw const CapacityExceeded();
    }
    _reserved += bytes;
  }

  /// Retained bundle/undo/scratch bytes compete with active heavy allocations.
  /// The owner must stay open for the actual buffer lifetime, or release explicitly.
  WorkReservation reserve(Operation operation, int bytes) {
    final owner = _operation(operation);
    if (_reservations >= WorkLimits.reservations) { throw const CapacityExceeded(); }
    _charge(bytes);
    _reservations++;
    try { return WorkReservation._(this, owner, bytes); }
    catch (_) { _reserved -= bytes; _reservations--; rethrow; }
  }

  WorkCopyReservation reserveCopy(int bytes) {
    if (_reservations >= WorkLimits.reservations) { throw const CapacityExceeded(); }
    final control = AdmissionBudget.shared.reserve(1024);
    try { _charge(bytes); }
    catch (_) { control.release(); rethrow; }
    _reservations++;
    return WorkCopyReservation._(this, bytes, control);
  }

  @override
  Future<WorkLease> acquire(Operation operation, int estimatedBytes) {
    try {
      final owner = _operation(operation);
      _amount(estimatedBytes);
      if (identical(_active?._owner, owner) ||
          _queue.any((w) => identical(w.owner, owner))) {
        throw StateError(
          'Reuse live parent lease instead of recursive acquire',
        );
      }
      if (_active == null && _queue.isEmpty) {
        return Future.value(_admit(owner, estimatedBytes));
      }
      if (_queue.length >= WorkLimits.heavyWaiters) {
        throw const CapacityExceeded();
      }
      final control = AdmissionBudget.shared.reserve(2048);
      final waiter = _Waiter(owner, estimatedBytes, control);
      try {
      waiter.unsubscribe = owner.addStopListener(() {
        if (!_queue.remove(waiter)) {
          return;
        }
        waiter.unsubscribe();
        waiter.control.release();
        waiter.result.completeError(
          owner.isCancelled
              ? const OperationException(ProblemCode.operationCancelled)
              : StateError('Operation is finishing'),
        );
      });
      _queue.add(waiter);
      return waiter.result.future;
      } catch (_) { control.release(); rethrow; }
    } catch (error, stack) {
      return Future.error(error, stack);
    }
  }

  WorkLease _admit(WorkOperation owner, int bytes) {
    _operation(owner);
    _charge(bytes);
    try {
      final lease = WorkLease._(this, owner, bytes);
      _active = lease;
      return lease;
    } catch (_) { _reserved -= bytes; rethrow; }
  }

  void _releaseHeavy(WorkLease lease) {
    if (!identical(_active, lease)) {
      throw StateError('Foreign heavy lease');
    }
    _reserved -= lease.bytes;
    _active = null;
    // Finish all same-drain byte releases before evaluating the next admission.
    scheduleMicrotask(_pump);
  }

  void _pump() {
    while (_active == null && _queue.isNotEmpty) {
      final waiter = _queue.removeFirst();
      waiter.unsubscribe();
      waiter.control.release();
      try {
        waiter.result.complete(_admit(waiter.owner, waiter.bytes));
      } catch (error, stack) {
        waiter.result.completeError(error, stack);
      }
    }
  }
}

final class _Waiter {
  _Waiter(this.owner, this.bytes, this.control);
  final AdmissionTicket control;
  final WorkOperation owner;
  final int bytes;
  final Completer<WorkLease> result = Completer();
  late void Function() unsubscribe;
}

final class WorkLease {
  WorkLease._(this._budget, this._owner, this.bytes) {
    _release = _owner.registerRelease(() => _budget._releaseHeavy(this));
  }
  final WorkBudgetController _budget;
  final WorkOperation _owner;
  final int bytes;
  bool _releaseRequested = false;
  late final DeferredRelease _release;
  bool belongsTo(WorkBudgetController candidate) =>
      identical(_budget, candidate);
  WorkLease forChild(Operation operation) {
    if (_releaseRequested) { throw StateError('Lease has been released'); }
    if (!identical(operation, _owner)) { throw ArgumentError('Foreign operation lease'); }
    _budget._operation(_owner);
    return this;
  }
  WorkReservation reserveAdditional(Operation operation, int bytes) {
    forChild(operation);
    return _budget.reserve(_owner, bytes);
  }
  void release() {
    if (_releaseRequested) { return; }
    _releaseRequested = true;
    _release.request();
  }
}
final class WorkReservation {
  WorkReservation._(this._budget, this._owner, this.bytes) {
    _release = _owner.registerRelease(() {
      _budget._reserved -= bytes;
      _budget._reservations--;
    });
  }
  final WorkBudgetController _budget;
  final WorkOperation _owner;
  final int bytes;
  bool _releaseRequested = false;
  late final DeferredRelease _release;
  // Concrete copy/adoption creators can check a real retained destination
  // token without accepting caller assertions or using another controller.
  bool coversBufferWorkspace(WorkBudgetController budget, int byteLength) =>
      identical(_budget, budget) && !_releaseRequested && !_owner.isFinishing &&
      !_owner.isCancelled && byteLength >= 0 && bytes >= byteLength;
  bool coversCopy(WorkBudgetController budget, int byteLength) =>
      identical(_budget, budget) && !_releaseRequested && !_owner.isFinishing &&
      !_owner.isCancelled && byteLength >= 0 && bytes == byteLength;
  void release() {
    if (_releaseRequested) { return; }
    _releaseRequested = true;
    _release.request();
  }
}

/// Synchronous copy/manifest creators use temporary prepayment. Raw API callers
/// retain their original duty to account returned buffers before further use.
/// This is NOT a retained-result ownership transfer or an extra heavy slot.
final class WorkCopyReservation {
  WorkCopyReservation._(this._budget, this.bytes, this._control);
  final WorkBudgetController _budget;
  final AdmissionTicket _control;
  final int bytes;
  bool _released = false;
  void release() {
    if (_released) { return; }
    _released = true;
    _budget._reserved -= bytes;
    _budget._reservations--;
    _control.release();
  }
}
