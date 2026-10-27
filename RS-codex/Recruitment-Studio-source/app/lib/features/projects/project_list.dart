import '../../shared/admission_budget.dart';
import '../../shared/problem.dart';
import '../../shared/work_budget.dart';
import '../editor/editor_session.dart';
import '../storage/local_repository.dart';
import 'project.dart';

/// Library owns no session. Recovery transfers retained bytes before release.
final class ProjectListController {
  ProjectListController(this.repository, {required this.budget})
    : _control = AdmissionBudget.shared.reserve(64 * 1024);
  final FileLocalRepository repository;
  final WorkBudgetController budget;
  final AdmissionTicket _control;
  Future<List<ProjectSummary>> refresh() => repository.listProjects();
  EditorSession create({required String id}) =>
      EditorSession(Project.blank(id: id), budget: budget);
  Future<EditorSession?> recover(String id) async {
    final bundle = await repository.recoverDraft(id);
    if (bundle == null) return null;
    try {
      return EditorSession.fromBundle(bundle, budget: budget);
    } finally {
      repository.releaseRecoveredDraft(bundle);
    }
  }

  Future<EditorSession> duplicate(String id, {required String newId}) async {
    validateId(newId);
    final rows = await refresh();
    if (newId == id || rows.any((row) => row.id == newId)) {
      throw ArgumentError('Duplicate project identity');
    }
    final source = await recover(id);
    if (source == null) throw StateError('Project unavailable');
    EditorSession? copy;
    try {
      copy = EditorSession.fromBundle(
        source.bundle.withProject(source.project.duplicate(newId: newId)),
        budget: budget,
      );
      source.dispose(); // Copy owns its bytes before persistence workspace.
      final receipt = await repository.saveDraft(copy.bundle);
      if (receipt.status != SaveStatus.completed) {
        throw RepositoryException(
          receipt.problem ??
              const Problem(
                code: ProblemCode.ioFailure,
                severity: ProblemSeverity.error,
              ),
        );
      }
      final result = copy;
      copy = null;
      return result;
    } finally {
      source.dispose();
      copy?.dispose();
    }
  }

  Future<bool> remove(String id, {required bool confirmed}) async {
    if (!confirmed) return false;
    await repository.removeOwnedProject(id);
    return true;
  }

  void close() => _control.release();
}
