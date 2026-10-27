import 'dart:async';

import 'package:flutter/foundation.dart';

import '../../shared/operation.dart';
import '../../shared/problem.dart';
import '../../shared/work_budget.dart';
import '../../shared/work_limits.dart';
import '../composition/export_format.dart';
import '../composition/layout_scene.dart';
import '../composition/variant_renderer.dart';
import '../media/media_worker.dart';
import '../media/resource_service.dart';
import '../projects/project.dart';
import '../projects/project_bundle.dart';
import 'editor_session.dart';
import 'preview_owner.dart';

typedef MediaByteSource = Future<OwnedMediaInput?> Function(
  AssetKind kind,
  WorkOperation request,
);
typedef CompanyProfileSource = Future<OwnedProfileInput?> Function(
  WorkOperation request,
);

enum EditorStep { model, content, appearance }

/// The callback producer must pay upstream acquisition and relinquish its aliases
/// before release. A bounded whole buffer is required; a slice is not eligible.
final class OwnedMediaInput {
  factory OwnedMediaInput.copyOf(
    Uint8List borrowed,
    AssetKind kind,
    WorkBudgetController budget,
  ) {
    if (kind == AssetKind.thumbnail ||
        borrowed.isEmpty ||
        borrowed.offsetInBytes != 0 ||
        borrowed.lengthInBytes != borrowed.buffer.lengthInBytes) {
      throw ArgumentError(
        'Source requires a nonempty whole photo or logo buffer',
      );
    }
    final cap = kind == AssetKind.photo
        ? WorkLimits.photoBytes
        : WorkLimits.logoBytes;
    if (borrowed.lengthInBytes > cap) {
      throw const CapacityExceeded();
    }
    final owner = WorkOperation.create();
    try {
      budget.reserve(owner, 2 * borrowed.lengthInBytes);
      return OwnedMediaInput._(
        Uint8List.fromList(borrowed).asUnmodifiableView(),
        kind,
        budget,
        owner,
      );
    } catch (_) {
      unawaited(owner.finish());
      rethrow;
    }
  }
  OwnedMediaInput._(this._bytes, this.kind, this._budget, this._owner);
  Uint8List? _bytes;
  final AssetKind kind;
  final WorkBudgetController _budget;
  final WorkOperation _owner;
  Future<void>? _release;
  Uint8List get bytes => _bytes ?? (throw StateError('Media input released'));
  Future<void> release() {
    _bytes = null;
    return _release ??= _owner.finish();
  }
}

/// Transfers one live entry from its originating service, not an arbitrary DTO.
/// Responsibility transfers only after all validation succeeds. Scalar metadata
/// is copied; no service thumbnail/view is retained or exposed to a widget.
final class OwnedProfileInput {
  factory OwnedProfileInput.fromImported({
    required ResourceService service,
    ResourceEntry? logo,
    Map<String, int> colours = const {},
    Map<String, String> contacts = const {},
  }) {
    if (logo != null) {
      service.previewFor(
        logo,
      ); // Scope-local eligibility borrow, immediately dropped.
    }
    final value = CompanyProfile(
      logo: logo,
      colours: colours,
      contacts: contacts,
    );
    return OwnedProfileInput._(service, value);
  }
  OwnedProfileInput._(this._service, this._value);
  final ResourceService _service;
  CompanyProfile? _value;
  Future<void>? _release;
  CompanyProfile get value =>
      _value ?? (throw StateError('Profile input released'));
  Future<void> release() {
    if (_release != null) {
      return _release!;
    }
    final logo = _value?.logo;
    _value = null;
    return _release = logo == null
        ? Future<void>.value()
        : _service.release(logo);
  }
}

final class ProfileOptions {
  ProfileOptions({
    required Iterable<String> contactIds,
    required Iterable<String> colourRoles,
    required this.hasLogo,
    required Iterable<AppLocale> eligibleLocales,
  }) : contactIds = Set.unmodifiable(contactIds),
       colourRoles = Set.unmodifiable(colourRoles),
       eligibleLocales = Set.unmodifiable(eligibleLocales);
  final Set<String> contactIds, colourRoles;
  final bool hasLogo;
  final Set<AppLocale> eligibleLocales;
}

final class ProfileSelection {
  ProfileSelection({
    required this.jobToken,
    required Iterable<AppLocale> locales,
    required Iterable<String> contactIds,
    required Iterable<String> colourRoles,
    required this.includeLogo,
  }) : locales = Set.unmodifiable(locales),
       contactIds = Set.unmodifiable(contactIds),
       colourRoles = Set.unmodifiable(colourRoles);
  final int jobToken;
  final Set<AppLocale> locales;
  final Set<String> contactIds, colourRoles;
  final bool includeLogo;
}

final class _MediaRequest {
  _MediaRequest(
    this.token,
    this.projectId, {
    this.kind,
    Set<AppLocale>? locales,
  }) : locales = locales == null ? null : Set.unmodifiable(locales);
  final int token;
  final String projectId;
  final AssetKind? kind;
  final Set<AppLocale>? locales;
}

/// A caller-owned session is never disposed here. Injection requires session,
/// ResourceService and renderer constructed in the identical supplied budget
/// domain. Accepted predecessors intentionally expose no domain introspection;
/// their construction precondition is not inferred from byte counts.
final class EditorHostController extends ChangeNotifier {
  factory EditorHostController.production(
    EditorSession session, {
    MediaByteSource? mediaByteSource,
    CompanyProfileSource? profileSource,
  }) {
    // Production is for a default/shared-domain session, not an isolated session.
    final budget = WorkBudget.shared() as WorkBudgetController;
    return EditorHostController(
      session: session,
      budget: budget,
      resources: ResourceService(budget: budget),
      renderer: CanvasVariantRenderer(budget: budget),
      mediaByteSource: mediaByteSource,
      profileSource: profileSource,
    );
  }
  EditorHostController({
    required this.session,
    required WorkBudgetController budget,
    required this._resources,
    required VariantRenderer renderer,
    LayoutEngine? layout,
    MediaByteSource? mediaByteSource,
    this._profileSource,
    PreviewTestHooks? testHooks,
  }) : _budget = budget,
       _mediaSource = mediaByteSource,
       _locale = session.project.localeOrder.first,
       preview = PreviewOwner(
         budget: budget,
         renderer: renderer,
         layout: layout,
         testHooks: testHooks,
       ) {
    preview.addListener(_previewChanged);
  }
  final EditorSession session;
  final WorkBudgetController _budget;
  final ResourceService _resources;
  final MediaByteSource? _mediaSource;
  final CompanyProfileSource? _profileSource;
  final PreviewOwner preview;
  AppLocale _locale;
  AppLocale get locale => _locale;
  ExportFormat _format = ExportFormat.square;
  ExportFormat get format => _format;
  EditorStep _step = EditorStep.model;
  EditorStep get step => _step;
  PreviewStatus get previewStatus => preview.status;
  List<Problem> get problems => preview.problems;
  bool get persistenceAvailable => false;
  bool get mediaAvailable => _mediaSource != null && !_closing;
  bool get profileAvailable => _profileSource != null && !_closing;
  bool get mediaBusy => _laneRunning;
  Problem? _mediaProblem;
  Problem? get mediaProblem => _mediaProblem;
  ProfileOptions? _profileOptions;
  ProfileOptions? get profileOptions => _profileOptions;
  int _mediaToken = 0;
  int get mediaJobToken => _mediaToken;
  _MediaRequest? _desired;
  WorkOperation? _active;
  Completer<ProfileSelection?>? _decision;
  bool _laneRunning = false, _closing = false, _notifierDisposed = false;
  Future<void> _lane = Future.value();
  final _closed = Completer<void>();
  Future<void>? _close;
  Future<void> get closed => _closed.future;
  Future<void> get idle async {
    await _lane;
    await preview.idle;
  }

  void _notify() {
    if (!_notifierDisposed) {
      notifyListeners();
    }
  }

  void _previewChanged() {
    if (!_closing) {
      _notify();
    }
  }

  void _open() {
    if (_closing || session.isDisposed) {
      throw StateError('Controller unavailable or closing');
    }
  }

  void selectLocale(AppLocale value) {
    _open();
    if (!session.project.localeOrder.contains(value)) {
      throw ArgumentError('Inactive locale');
    }
    _locale = value;
    refresh();
  }

  void selectFormat(ExportFormat value) {
    _open();
    _format = value;
    refresh();
  }

  void selectStep(EditorStep value) {
    _open();
    _step = value;
    _notify();
  }

  /// The explicit boundary also covers external session edits/replacements.
  void refresh() {
    _open();
    if (!session.project.localeOrder.contains(_locale)) {
      _locale = session.project.localeOrder.first;
    }
    if (!_laneRunning && _desired == null) {
      preview.request(session, _locale, _format);
    }
    _notify();
  }

  void edit(void Function(EditorSession) edit) {
    _open();
    final oldId = session.project.id;
    try {
      edit(session);
    } finally {
      if (session.isDisposed || session.project.id != oldId) {
        _cancelLane();
        // Synchronously invalidate preview scalar tokens, even on edit failure.
        preview.setPaused(true);
        preview.setPaused(false);
      }
      if (!session.isDisposed && !_closing) {
        refresh();
      }
    }
  }

  void requestMedia(AssetKind kind) {
    _open();
    if (_mediaSource == null) {
      throw StateError('Local media source unavailable');
    }
    if (kind == AssetKind.thumbnail) {
      throw ArgumentError('Thumbnail is not an editor action');
    }
    _enqueue(_MediaRequest(++_mediaToken, session.project.id, kind: kind));
  }

  void requestProfile(Set<AppLocale> locales) {
    _open();
    if (_profileSource == null) {
      throw StateError('Local profile source unavailable');
    }
    if (!session.project.localeOrder.toSet().containsAll(locales)) {
      throw ArgumentError('Inactive profile locale');
    }
    _enqueue(
      _MediaRequest(++_mediaToken, session.project.id, locales: locales),
    );
  }

  void _enqueue(_MediaRequest request) {
    _desired = request;
    _active?.cancel();
    _cancelDecision();
    _mediaProblem = null;
    preview.setPaused(true);
    if (!_laneRunning) {
      _laneRunning = true;
      _lane = _pumpLane();
    }
    _notify();
  }

  bool _current(_MediaRequest request) =>
      !_closing &&
      !session.isDisposed &&
      request.token == _mediaToken &&
      session.project.id == request.projectId;
  void _cancelDecision() {
    final decision = _decision;
    if (decision != null && !decision.isCompleted) {
      decision.complete(null);
    }
    _profileOptions = null;
  }

  void _cancelLane() {
    _mediaToken++;
    _desired = null;
    _active?.cancel();
    _cancelDecision();
  }

  void cancelMedia() {
    _open();
    _cancelLane();
    _notify();
  }

  Future<void> _pumpLane() async {
    try {
      // Producer futures drain independently of paid RawImage retirement.
      await preview.processingSettled;
      while (!_closing && _desired != null) {
        final request = _desired!;
        _desired = null;
        final op = WorkOperation.create(projectId: request.projectId);
        _active = op;
        try {
          if (request.kind != null) {
            await _media(request, op);
          } else {
            await _profile(request, op);
          }
        } on OperationException catch (error) {
          if (_current(request) &&
              error.code != ProblemCode.operationCancelled) {
            _mediaProblem = error.problem;
          }
        } on CapacityExceeded catch (error) {
          if (_current(request)) {
            _mediaProblem = error.problem;
          }
        } on MediaWorkerFailure catch (error) {
          if (_current(request)) {
            _mediaProblem = error.problem;
          }
        } catch (_) {
          if (_current(request)) {
            _mediaProblem = const Problem(
              code: ProblemCode.ioFailure,
              severity: ProblemSeverity.error,
            );
          }
        } finally {
          // No umbrella is registered on this stage. The whole callback/service
          // must have returned with every borrower cleared before finish.
          await op.finish();
          _active = null;
        }
      }
    } finally {
      _laneRunning = false;
      _profileOptions = null;
      _decision = null;
      if (!_closing) {
        preview.setPaused(false);
        if (!session.isDisposed) {
          refresh();
        }
        _notify();
      }
    }
  }

  Future<void> _media(_MediaRequest request, WorkOperation op) async {
    OwnedMediaInput? input;
    ResourceEntry? entry;
    try {
      input = await _mediaSource!(request.kind!, op);
      if (input == null) {
        return;
      }
      if (!identical(input._budget, _budget) || input.kind != request.kind) {
        throw ArgumentError('Foreign media ownership domain or kind');
      }
      if (!_current(request)) {
        return;
      }
      entry = await _resources.importImage(
        input.bytes,
        request.kind!,
        operation: op,
      );
      if (_current(request)) {
        _attach(entry);
      }
    } finally {
      if (entry != null) {
        final releasing = _resources.release(entry);
        entry = null;
        await releasing;
      }
      if (input != null) {
        final releasing = input.release();
        input = null;
        await releasing;
      }
    }
  }

  // Synchronous borrow ends before the originating service/input is released.
  void _attach(ResourceEntry entry) => session.attachResource(entry);
  Future<void> _profile(_MediaRequest request, WorkOperation op) async {
    OwnedProfileInput? input;
    try {
      input = await _profileSource!(op);
      if (input == null) {
        return;
      }
      if (!identical(input._service, _resources)) {
        throw ArgumentError('Foreign profile service');
      }
      if (!_current(request)) {
        return;
      }
      _publishOptions(input, request);
      final decision = Completer<ProfileSelection?>();
      _decision = decision;
      _notify();
      final selected = await decision.future;
      _decision = null;
      _profileOptions = null;
      if (selected != null && _current(request)) {
        _apply(input, selected);
      }
    } finally {
      _profileOptions = null;
      _decision = null;
      if (input != null) {
        final releasing = input.release();
        input = null;
        await releasing;
      }
    }
  }

  void _publishOptions(OwnedProfileInput input, _MediaRequest request) {
    final value = input.value;
    _profileOptions = ProfileOptions(
      contactIds: value.contacts.keys,
      colourRoles: value.colours.keys,
      hasLogo: value.logo != null,
      eligibleLocales: request.locales!,
    );
  }

  void confirmProfile(ProfileSelection selection) {
    _open();
    final options = _profileOptions;
    final decision = _decision;
    if (options == null || decision == null || decision.isCompleted) {
      throw StateError('No live profile choice');
    }
    if (selection.jobToken != _mediaToken ||
        !options.eligibleLocales.containsAll(selection.locales) ||
        !session.project.localeOrder.toSet().containsAll(selection.locales) ||
        !options.contactIds.containsAll(selection.contactIds) ||
        !options.colourRoles.containsAll(selection.colourRoles) ||
        (selection.includeLogo && !options.hasLogo)) {
      throw ArgumentError('Stale or invalid profile subset');
    }
    decision.complete(selection);
  }

  void _apply(OwnedProfileInput input, ProfileSelection selected) {
    final value = input.value;
    final filtered = CompanyProfile(
      logo: selected.includeLogo ? value.logo : null,
      contacts: {for (final id in selected.contactIds) id: value.contacts[id]!},
      colours: {
        for (final role in selected.colourRoles) role: value.colours[role]!,
      },
    );
    session.applyProfile(filtered, selected.locales);
  }

  Future<void> close() {
    if (_close != null) {
      return _close!;
    }
    _closing = true;
    _cancelLane();
    final previewClosed = preview.close();
    _notify();
    _close = _drainClose(previewClosed);
    _close!.then(_closed.complete, onError: _closed.completeError);
    return _close!;
  }

  Future<void> _drainClose(Future<void> previewClosed) async {
    await _lane;
    await previewClosed;
    preview.removeListener(_previewChanged);
  }

  @override
  void dispose() {
    unawaited(close());
    _notifierDisposed = true;
    super.dispose();
  }
}
