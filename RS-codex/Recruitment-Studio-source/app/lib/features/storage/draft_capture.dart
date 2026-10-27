import 'dart:async';
import 'dart:typed_data';

import '../../shared/admission_budget.dart';
import '../../shared/operation.dart';
import '../../shared/work_budget.dart';
import '../projects/project_bundle.dart';

/// One bounded continuously paid set of exact immutable resource identities.
/// ProjectBundle is final: all of its factories seal private immutable backing;
/// arbitrary readonly/mutable caller buffers cannot forge that origin. The core
/// copyForOwner frontier still authenticates and pays every initial destination.
/// This cache never infers backing equality, accepts SHA-only trust, or supplies
/// media proofs. Only the unchanged codec can mint/reuse those proofs.
final class DraftCapturePool {
  DraftCapturePool(this.budget);
  final WorkBudgetController budget;
  _ResourceSet? _current;
  final Set<Future<void>> _retiring = {};
  bool _closed = false;
  Object? _error;
  StackTrace? _trace;
  Future<void>? _closing;

  DraftCapture capture(ProjectBundle source) {
    if (_closed) throw StateError('Draft custody closed');
    var current = _current;
    if (current == null || !current.matches(source.resources)) {
      // Construct/admit all new ownership before retiring the previous set.
      final next = _ResourceSet(source, budget);
      try {
        final result = next.capture(source, budget);
        _current = next;
        if (current != null) _retire(current);
        return result;
      } catch (_) {
        _retire(next);
        rethrow;
      }
    }
    return current.capture(source, budget);
  }

  void _retire(_ResourceSet set) {
    late final Future<void> drained;
    drained = set
        .close()
        .then<void>(
          (_) {},
          onError: (Object e, StackTrace s) {
            _error ??= e;
            _trace ??= s;
          },
        )
        .whenComplete(() => _retiring.remove(drained));
    _retiring.add(drained);
  }

  Future<void> close() {
    if (_closing != null) return _closing!;
    final completion = Completer<void>();
    _closing = completion.future;
    _closed = true;
    final current = _current;
    _current = null;
    if (current != null) _retire(current);
    unawaited(
      _drain().then(completion.complete, onError: completion.completeError),
    );
    return completion.future;
  }

  Future<void> _drain() async {
    while (_retiring.isNotEmpty) {
      await _retiring.first;
    }
    if (_error != null) Error.throwWithStackTrace(_error!, _trace!);
  }
}

final class _ResourceSet {
  _ResourceSet(ProjectBundle source, WorkBudgetController budget) {
    _control = AdmissionBudget.shared.reserve(8192);
    WorkOperation? operation;
    try {
      operation = WorkOperation.create();
      _operation = operation;
      final paid = ProjectBundle.copyForOwner(
        source.project,
        source.resources,
        budget: budget,
        operation: operation,
      );
      _source = source.resources;
      _canonical = paid.bundle;
      _reservations = paid.reservations;
    } catch (_) {
      _control.release();
      if (operation != null) unawaited(operation.finish());
      rethrow;
    }
  }
  late final AdmissionTicket _control;
  late final WorkOperation _operation;
  Map<String, Uint8List>? _source;
  ProjectBundle? _canonical;
  Map<Uint8List, WorkReservation>? _reservations;

  bool matches(Map<String, Uint8List> incoming) {
    final owned = _canonical!.resources, original = _source!;
    if (incoming.length != owned.length) return false;
    // Test both whole sets, not a per-entry mixture or digest equivalence.
    bool same(Map<String, Uint8List> other) => incoming.entries.every(
      (entry) => identical(entry.value, other[entry.key]),
    );
    return same(original) || same(owned);
  }

  DraftCapture capture(ProjectBundle source, WorkBudgetController budget) {
    for (final row in _reservations!.entries) {
      if (!row.value.coversCopy(budget, row.key.lengthInBytes)) {
        throw StateError('Retired resource custody');
      }
    }
    final control = AdmissionBudget.shared.reserve(8192);
    WorkCopyReservation? payment;
    try {
      final canonical = _canonical!;
      final total = canonical.resources.values.fold<int>(
        0,
        (n, b) => n + b.lengthInBytes,
      );
      // Each transient caller independently pays all exact aliases until its
      // actual last use. Cache eviction cannot refund an in-flight snapshot.
      payment = budget.reserveCopy(total);
      return DraftCapture._(
        canonical.withProject(source.project),
        payment,
        control,
      );
    } catch (_) {
      payment?.release();
      control.release();
      rethrow;
    }
  }

  Future<void> close() async {
    final reservations = _reservations!;
    _reservations = null;
    _source = null;
    _canonical = null;
    for (final token in reservations.values) {
      token.release();
    }
    try {
      await _operation.finish();
    } finally {
      _control.release();
    }
  }
}

/// Internal explicit custody boundary. No byte alias may be used after release.
/// A capture is not a caller-forgeable admission flag or a codec proof.
final class DraftCapture {
  DraftCapture._(this._bundle, this._payment, this._control);
  ProjectBundle? _bundle;
  final WorkCopyReservation _payment;
  final AdmissionTicket _control;
  ProjectBundle get bundle =>
      _bundle ?? (throw StateError('Draft capture released'));
  void release() {
    if (_bundle == null) return;
    _bundle = null;
    _payment.release();
    _control.release();
  }
}
