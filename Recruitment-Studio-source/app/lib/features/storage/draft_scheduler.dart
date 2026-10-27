import 'dart:async';

import '../../shared/admission_budget.dart';
import '../../shared/operation.dart';
import '../../shared/problem.dart';
import '../../shared/work_budget.dart';
import '../../shared/work_limits.dart';
import '../projects/project.dart';
import '../projects/project_bundle.dart';
import 'local_repository.dart';
import 'draft_capture.dart';

abstract interface class DraftTimer {
  void cancel();
}

abstract interface class DraftClock {
  Duration get now;
  DraftTimer schedule(Duration delay, void Function() callback);
}

/// Monotonic elapsed time, independent of wall-clock/date adjustments.
final class SystemDraftClock implements DraftClock {
  final Stopwatch _watch = Stopwatch()..start();
  @override
  Duration get now => _watch.elapsed;
  @override
  DraftTimer schedule(Duration delay, void Function() callback) =>
      _SystemTimer(Timer(delay, callback));
}

final class _SystemTimer implements DraftTimer {
  _SystemTimer(this.timer);
  final Timer timer;
  @override
  void cancel() => timer.cancel();
}

/// Debounces immutable, paid snapshots, never an EditorSession baseline. A
/// receipt is a draft acknowledgement ONLY, not authorization to abandon edits.
/// One active write + one coalesced latest snapshot. UI must call [activate] on
/// every session replacement, including reopening the same project/generation.
/// Generations may increase for edits; stale lower generations are ignored.
final class DraftScheduler {
  DraftScheduler(
    this.repository,
    this.clock, {
    WorkBudgetController? budget,
    this.onReceipt,
    this.onProblem,
  }) : budget = budget ?? WorkBudget.shared() as WorkBudgetController {
    _control = AdmissionBudget.shared.reserve(32 * 1024);
    _captures = DraftCapturePool(this.budget);
  }
  final LocalRepository repository;
  final DraftClock clock;
  final WorkBudgetController budget;
  final void Function(SaveReceipt)? onReceipt;
  final void Function(Problem)? onProblem;
  late final AdmissionTicket _control;
  late final DraftCapturePool _captures;
  DraftTimer? _idle, _maximum;
  _Pending? _latest, _active;
  WorkOperation? _job;
  Future<SaveReceipt?>? _running, _closing;
  String? _projectId;
  int _generation = 0, _epoch = 0;
  bool _requested = false, _closed = false, _isClosing = false;
  bool _notifyingProblem = false;
  bool get hasPendingChanges => _latest != null;
  void _alive() {
    if (_closed || _isClosing) throw StateError('Draft scheduler closed');
  }

  void activate(String projectId, int sessionGeneration) {
    _alive();
    validateId(projectId);
    if (sessionGeneration < 0) {
      throw ArgumentError('Invalid session generation');
    }
    _epoch++;
    _projectId = projectId;
    _generation = sessionGeneration;
    _cancelTimers();
    _requested = false;
    _job?.cancel();
    final old = _latest;
    _latest = null;
    if (old != null && !identical(old, _active)) old.dispose();
  }

  void changed(ProjectBundle bundle, {int? sessionGeneration}) {
    _alive();
    final generation = sessionGeneration ?? _generation;
    if (generation < 0) throw ArgumentError('Invalid session generation');
    final id = bundle.project.id;
    if (_projectId == id && generation < _generation) return;
    final previous = _latest;
    if (_projectId == id &&
        previous != null &&
        generation == _generation &&
        bundle.project.revision < previous.bundle.project.revision) {
      return;
    }
    final next = _Pending(bundle, generation, _captures);
    // Admission must succeed before cancelling/retiring any previous session.
    if (_projectId != id) activate(id, generation);
    final retiring = _latest;
    _generation = generation;
    _latest = next;
    if (retiring != null && !identical(retiring, _active)) retiring.dispose();
    _idle?.cancel();
    _idle = clock.schedule(WorkLimits.draftIdle, _timerCheckpoint);
    // Do not restart the max timer with every keystroke.
    _maximum ??= clock.schedule(WorkLimits.draftCheckpoint, _timerCheckpoint);
  }

  void _timerCheckpoint() {
    _cancelTimers();
    if (_closed || _isClosing) return;
    unawaited(
      checkpoint().then<void>(
        (_) {},
        onError: (Object _, StackTrace _) {
          _notifyProblem(
            const Problem(
              code: ProblemCode.ioFailure,
              severity: ProblemSeverity.error,
            ),
          );
        },
      ),
    );
  }

  void _cancelTimers() {
    _idle?.cancel();
    _maximum?.cancel();
    _idle = null;
    _maximum = null;
  }

  Future<SaveReceipt?> checkpoint() {
    if (_closed) return Future.value(null);
    // Failure observers may join real work, but must not re-arm its unchanged
    // refused snapshot. Leave newer captures/timers and prior real requests live.
    if (_notifyingProblem &&
        (_running == null || identical(_active, _latest))) {
      return _running ?? Future.value(null);
    }
    _cancelTimers();
    if (_latest == null) return _running ?? Future.value(null);
    _requested = true;
    if (_running != null) return _running!;
    return _start();
  }

  Future<SaveReceipt?> _start() {
    final pending = _latest;
    if (pending == null || _closed) return Future.value(null);
    // Admit completion metadata and the operation before publishing active
    // state. A refused startup has no worker/write tail to clean a phantom job.
    final AdmissionTicket startup;
    final WorkOperation op;
    final Completer<SaveReceipt?> completion;
    AdmissionTicket? provisional;
    try {
      provisional = AdmissionBudget.shared.reserve(2048);
      completion = Completer<SaveReceipt?>();
      op = WorkOperation.create(
        projectId: pending.bundle.project.id,
        revision: pending.bundle.project.revision,
        sessionGeneration: pending.generation,
      );
      startup = provisional;
    } on CapacityExceeded {
      provisional?.release();
      _notifyProblem(
        const Problem(
          code: ProblemCode.capacityExceeded,
          severity: ProblemSeverity.error,
        ),
      );
      return Future.value(null);
    } catch (_) {
      provisional?.release();
      rethrow;
    }
    _requested = false;
    _active = pending;
    final epoch = _epoch;
    _job = op;
    _running = completion.future;
    unawaited(
      _write(
        pending,
        epoch,
        op,
        startup,
      ).then(completion.complete, onError: completion.completeError),
    );
    return completion.future;
  }

  Future<SaveReceipt?> _write(
    _Pending pending,
    int epoch,
    WorkOperation op,
    AdmissionTicket startup,
  ) async {
    SaveReceipt? receipt;
    try {
      receipt = await repository.saveDraft(pending.bundle, operation: op);
      final matches =
          !_closed &&
          epoch == _epoch &&
          identical(pending, _latest) &&
          receipt.projectId == pending.bundle.project.id &&
          receipt.revision == pending.bundle.project.revision &&
          receipt.sessionGeneration == pending.generation;
      if (matches) {
        if (receipt.status == SaveStatus.completed) {
          _latest = null;
          _cancelTimers();
        }
        try {
          onReceipt?.call(receipt);
        } catch (_) {
          /* Passive observer. */
        }
        if (receipt.problem != null) _notifyProblem(receipt.problem!);
      }
      return receipt;
    } catch (e) {
      if (!_closed && epoch == _epoch && identical(pending, _latest)) {
        _notifyProblem(
          Problem(
            code: e is CapacityExceeded
                ? ProblemCode.capacityExceeded
                : ProblemCode.ioFailure,
            severity: ProblemSeverity.error,
          ),
        );
      }
      return null;
    } finally {
      try {
        await op.finish();
      } finally {
        startup.release();
        _job = null;
        _active = null;
        _running = null;
        if (!identical(pending, _latest)) pending.dispose();
        if (_requested && _latest != null && !_closed && !_isClosing) {
          unawaited(_start());
        }
      }
    }
  }

  void _notifyProblem(Problem problem) {
    if (_notifyingProblem) return;
    // Publish the notification frontier before invoking caller code.
    _notifyingProblem = true;
    try {
      onProblem?.call(problem);
    } catch (_) {
      /* Passive observer. */
    } finally {
      _notifyingProblem = false;
    }
  }

  /// Default checkpoints and drains; false cancels/discards scheduler custody
  /// only, never the caller's session. A late post-commit completion is still
  /// returned to its original waiter but cannot enter the active UI callback.
  Future<SaveReceipt?> close({bool checkpoint = true}) {
    if (_closing != null) return _closing!;
    _isClosing = true;
    final completion = Completer<SaveReceipt?>();
    _closing = completion.future;
    unawaited(
      _close(checkpoint)
          .then(completion.complete, onError: completion.completeError),
    );
    return completion.future;
  }

  Future<SaveReceipt?> _close(bool save) async {
    _cancelTimers();
    SaveReceipt? receipt;
    try {
      if (save) {
        if (_running != null) await _running;
        receipt = await checkpoint();
      } else {
        _epoch++;
        _job?.cancel();
        final latest = _latest;
        _latest = null;
        if (latest != null && !identical(latest, _active)) latest.dispose();
        await _running;
      }
      return receipt;
    } finally {
      _closed = true;
      _requested = false;
      final latest = _latest;
      _latest = null;
      latest?.dispose();
      try {
        await _captures.close();
      } finally {
        _control.release();
      }
    }
  }
}

/// Separate explicit encoded-byte custody for the coalesced scheduler snapshot.
final class _Pending {
  _Pending(ProjectBundle source, this.generation, DraftCapturePool captures)
    : _capture = captures.capture(source);
  final int generation;
  final DraftCapture _capture;
  ProjectBundle get bundle => _capture.bundle;
  void dispose() => _capture.release();
}
