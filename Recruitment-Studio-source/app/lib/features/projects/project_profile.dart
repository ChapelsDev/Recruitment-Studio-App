import '../../shared/admission_budget.dart';
import '../../shared/operation.dart';
import '../../shared/work_budget.dart';
import '../editor/editor_host_controller.dart';
import '../editor/editor_session.dart';
import '../media/resource_service.dart';
import '../storage/local_repository.dart';
import 'project.dart';

/// A manual draft survives persistence failure. Logo custody is independent of
/// repository recovery and of every project to which the profile was copied.
final class ProjectProfileController {
  ProjectProfileController(this.repository, {required this.budget})
    : _control = AdmissionBudget.shared.reserve(64 * 1024) {
    _empty = _draft;
  }
  final FileLocalRepository repository;
  final WorkBudgetController budget;
  final AdmissionTicket _control;
  CompanyProfile _draft = CompanyProfile();
  late final CompanyProfile _empty;
  WorkCopyReservation? _logoPayment;
  CompanyProfile get draft => _draft;
  void setDraft(CompanyProfile value) {
    final payment = value.logo == null
        ? null
        : budget.reserveCopy(value.logo!.bytes.length);
    final previous = _logoPayment;
    _draft = value;
    _logoPayment = payment;
    previous?.release();
  }

  Future<bool> load() async {
    final value = await repository.loadProfile();
    if (value == null) return false;
    try {
      setDraft(value);
      return true;
    } finally {
      repository.releaseLoadedProfile(value);
    }
  }

  Future<void> save(CompanyProfile value) async {
    setDraft(value);
    await repository.saveProfile(_draft);
  }

  void apply(
    EditorSession session,
    Set<AppLocale> selectedLocales, {
    required Set<String> contactIds,
    required Set<String> colourRoles,
    required bool includeLogo,
  }) {
    if (selectedLocales.isEmpty ||
        !_draft.contacts.keys.toSet().containsAll(contactIds) ||
        !_draft.colours.keys.toSet().containsAll(colourRoles) ||
        (includeLogo && _draft.logo == null)) {
      throw ArgumentError('Invalid explicit profile choice');
    }
    session.applyProfile(
      CompanyProfile(
        contacts: {for (final id in contactIds) id: _draft.contacts[id]!},
        colours: {for (final role in colourRoles) role: _draft.colours[role]!},
        logo: includeLogo ? _draft.logo : null,
      ),
      selectedLocales,
    );
  }

  Future<OwnedProfileInput> materialize(
    ResourceService service,
    WorkOperation operation,
  ) async {
    final value = _draft;
    // Capture custody before any await or profile edit can retire its logo.
    final capture = value.logo == null
        ? null
        : budget.reserveCopy(value.logo!.bytes.length);
    try {
      final logo = value.logo == null
          ? null
          : await service.importImage(
              value.logo!.bytes,
              AssetKind.logo,
              operation: operation,
            );
      try {
        return OwnedProfileInput.fromImported(
          service: service,
          logo: logo,
          colours: value.colours,
          contacts: value.contacts,
        );
      } catch (_) {
        if (logo != null) await service.release(logo);
        rethrow;
      }
    } finally {
      capture?.release();
    }
  }

  void close() {
    _draft = _empty;
    _logoPayment?.release();
    _logoPayment = null;
    _control.release();
  }
}
