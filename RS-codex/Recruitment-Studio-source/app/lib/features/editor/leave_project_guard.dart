import '../projects/project.dart';
import '../projects/project_bundle.dart';
import 'editor_session.dart';

enum LeaveDecision { save, discard, cancel }

typedef ProjectSaveCallback = Future<bool> Function(CapturedSnapshot snapshot);

/// Protects close/create/open/import through the real session. The save adapter
/// must explicitly acknowledge verified project-file content; returning true is
/// not persistence. Decisions never write files or clear content on their own.
final class LeaveProjectGuard {
  LeaveProjectGuard(this.session);
  final EditorSession session;
  LeaveAttempt? _pending;

  void cancelPending() => _pending?.cancel();

  Future<bool> leave(
    LeaveDecision decision, {
    ProjectSaveCallback? save,
    void Function()? transition,
  }) async {
    if (decision == LeaveDecision.cancel) {
      cancelPending();
      return false;
    }
    final attempt = session.beginLeaveAttempt();
    if (attempt == null) return false;
    _pending = attempt;
    try {
      if (attempt.wasDirty && decision == LeaveDecision.save) {
        if (save == null || !await save(attempt.snapshot)) return false;
        return attempt.complete(
          discard: false,
          saved: true,
          transition: transition,
        );
      }
      return attempt.complete(
        discard: decision == LeaveDecision.discard,
        saved: false,
        transition: transition,
      );
    } catch (_) {
      // Adapter failures are not confirmation; no stacktrace/text is published.
      return false;
    } finally {
      attempt.end();
      if (identical(_pending, attempt)) _pending = null;
    }
  }

  Future<bool> replaceProject(
    Project next,
    LeaveDecision decision, {
    ProjectSaveCallback? save,
  }) => leave(
    decision,
    save: save,
    transition: () => session.replaceProject(next),
  );
  Future<bool> replaceBundle(
    ProjectBundle next,
    LeaveDecision decision, {
    ProjectSaveCallback? save,
  }) => leave(
    decision,
    save: save,
    transition: () => session.replaceBundle(next),
  );
}
