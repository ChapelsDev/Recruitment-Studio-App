import 'dart:async';
import 'dart:io';
import 'dart:math';

import 'package:flutter/foundation.dart';

import '../features/composition/font_catalog.dart';
import '../features/composition/variant_renderer.dart';
import '../features/documents/document_gateway.dart';
import '../features/export/export_service.dart';
import '../features/export/export_selection.dart';
import '../features/editor/editor_host_controller.dart';
import '../features/editor/editor_session.dart';
import '../features/editor/leave_project_guard.dart';
import '../features/media/resource_service.dart';
import '../features/projects/project_list.dart';
import '../features/projects/project.dart';
import '../features/projects/project_bundle.dart';
import '../features/projects/project_profile.dart';
import '../features/storage/draft_scheduler.dart';
import '../features/storage/local_repository.dart';
import '../features/storage/package_zip_io.dart';
import '../shared/operation.dart';
import 'product_documents.dart';
import '../features/storage/private_file_io.dart';
import '../shared/admission_budget.dart';
import '../shared/problem.dart';
import '../shared/work_budget.dart';
import '../shared/work_limits.dart';

typedef ProductGatewayFactory = DocumentGateway Function(
  Directory stagingDirectory,
  WorkBudgetController budget,
);

/// Opening root custody is the SAME prepaid runtime control, transferred only
/// after coherent construction. Every failed independent tail stays reachable.
final class _OpeningCustody {
  _OpeningCustody() : control = AdmissionBudget.shared.reserve(64 * 1024) {
    _live.add(this);
  }
  static final Set<_OpeningCustody> _live = {};
  final AdmissionTicket control;
  FileLocalRepository? repository;
  DocumentGateway? gateway;
  Object? _firstCause;
  bool _failed = false;
  void adopt() {
    _live.remove(this);
    repository = null;
    gateway = null;
  }

  Future<void> retire(Object first) async {
    _firstCause = first;
    try {
      await gateway?.close();
      gateway = null;
    } catch (_) {
      _failed = true;
    }
    try {
      await repository?.close();
      repository = null;
    } catch (_) {
      _failed = true;
    }
    if (!_failed) {
      _live.remove(this);
      control.release();
    }
  }

  Problem get firstProblem => ProductRuntime.problemFor(_firstCause!);
}

/// One private repository, one budget domain, one reachable editor session.
/// The optional boundary supplies native pickers/IO, never product behavior.
final class ProductRuntime extends ChangeNotifier {
  ProductRuntime._(
    this.root,
    this.staging,
    this.budget,
    this.repository,
    this.gateway,
    PrivateFileIo fileIo,
    AdmissionTicket control,
  ) : _control = _admitRuntime(control) {
    library = ProjectListController(repository, budget: budget);
    profile = ProjectProfileController(repository, budget: budget);
    documents = ProductDocuments(gateway, staging, budget, io: fileIo);
  }
  static final Set<ProductRuntime> _unresolvedRuntimes = {};
  static int get unresolvedRuntimeCount => _unresolvedRuntimes.length;
  static void _atomicAdmission(int bytes, int tickets) {
    final ordinary = AdmissionBudget.shared;
    if (ordinary.ticketCount > WorkLimits.admissionTickets - tickets) {
      throw const CapacityExceeded();
    }
    // No await/callback occurs between this proof and synchronous constructors.
    // Their unchanged individual tokens establish actual retained payment.
    final proof = ordinary.reserve(bytes);
    proof.release();
  }

  static AdmissionTicket _admitRuntime(AdmissionTicket control) {
    _atomicAdmission(2 * 64 * 1024 + 2048 + 8192, 4);
    return control;
  }

  static int get unresolvedOpeningCount =>
      _OpeningCustody._live.where((lot) => lot._failed).length;

  static Future<ProductRuntime> open(
    Directory root,
    ProductGatewayFactory factory, {
    WorkBudgetController? budget,
    PrivateFileIo fileIo = const PrivateFileIo(),
  }) async {
    final opening = _OpeningCustody();
    ProductRuntime? runtime;
    try {
      final domain = budget ?? WorkBudget.shared() as WorkBudgetController;
      _atomicAdmission(2 * 1024 * 1024 + 8192, 2);
      final repository = FileLocalRepository(
        Directory('${root.path}/repository'),
        budget: domain,
      );
      opening.repository = repository;
      await FontCatalog.load();
      await repository.listProjects();
      final staging = Directory('${root.path}/staging');
      if (!staging.existsSync()) {
        requireRegularPath(File(staging.path), absent: true);
        staging.createSync();
      }
      requireRegularPath(File('${staging.path}/probe'), absent: true);
      final gateway = factory(staging, domain);
      opening.gateway = gateway;
      runtime = ProductRuntime._(
        root,
        staging,
        domain,
        repository,
        gateway,
        fileIo,
        opening.control,
      );
      opening.adopt(); // the runtime now owns this exact paid control/children
      await runtime.refresh();
      await runtime.profile.load();
      return runtime;
    } catch (first) {
      if (runtime != null) {
        try {
          await runtime.close();
        } catch (_) {
          /* paid unresolved runtime */
        }
      } else {
        await opening.retire(first);
      }
      // A later close refusal never replaces the initiating finite cause.
      if (first is CapacityExceeded ||
          first is OperationException ||
          first is DocumentGatewayException ||
          first is RepositoryException) {
        rethrow;
      }
      throw OperationException(problemFor(first).code);
    }
  }

  final Directory root, staging;
  final WorkBudgetController budget;
  final FileLocalRepository repository;
  final DocumentGateway gateway;
  final AdmissionTicket _control;
  late final ProjectListController library;
  late final ProjectProfileController profile;
  late final ProductDocuments documents;
  WorkOperation? _activeRequest;
  Object? _lastSaveCause;
  Problem? get lastSaveProblem =>
      _lastSaveCause == null ? null : problemFor(_lastSaveCause!);
  bool get canCancel => _activeRequest != null || host?.mediaBusy == true;
  void cancel() {
    _activeRequest?.cancel();
    host?.cancelMedia();
  }

  List<ProjectSummary> rows = const [];
  EditorSession? session;
  EditorHostController? host;
  DraftScheduler? scheduler;
  String message = '';
  bool busy = false, _closing = false, _disposed = false;
  int _capturedGeneration = -1;
  Future<void>? _close, _running;
  EditorHostController? _retiringHost;
  EditorSession? _retiringSession;
  DraftScheduler? _retiringScheduler;
  Object? _privateCloseCause;
  Problem? _closedProblem;
  Problem? get closedProblem => _closedProblem;
  bool get unresolvedCleanup => _privateCloseCause != null;
  void _rememberCloseFailure(Object error) {
    _privateCloseCause ??= error;
    _closedProblem ??= problemFor(error);
  }

  void changed() {
    if (!_disposed) notifyListeners();
  }

  Future<void> refresh() async {
    rows = await library.refresh();
    changed();
  }

  String freshId() =>
      'project-${List.generate(16, (_) => Random.secure().nextInt(256).toRadixString(16).padLeft(2, '0')).join()}';
  Future<void> create() async {
    await _action(() async {
      await adoptSession(library.create(id: freshId()));
    });
  }

  Future<void> recover(String id) async {
    await _action(() async {
      final recovered = await library.recover(id);
      if (recovered == null) throw const PackageFailure('Draft unavailable');
      await adoptSession(recovered);
    });
  }

  Future<void> duplicate(String id) async {
    await _action(() async {
      final copy = await library.duplicate(id, newId: freshId());
      await adoptSession(copy);
    });
  }

  Future<void> remove(String id, {required bool confirmed}) async {
    await _action(() async {
      if (!confirmed) return;
      await library.remove(id, confirmed: true);
      await refresh();
      message = 'Projeto local removido — ficheiros externos inalterados';
    });
  }

  Future<void> adoptSession(EditorSession next) async {
    EditorHostController? candidateHost;
    DraftScheduler? candidateScheduler;
    try {
      if (_closing || session != null || _retiringSession != null) {
        throw StateError('Leave the current editor first');
      }
      _atomicAdmission(4096 + 4096 + 32 * 1024, 3);
      final resources = ResourceService(budget: budget);
      candidateHost = EditorHostController(
        session: next,
        budget: budget,
        resources: resources,
        renderer: CanvasVariantRenderer(budget: budget),
        mediaByteSource: _hostMedia,
        profileSource: (operation) => profile.materialize(resources, operation),
      );
      candidateScheduler = DraftScheduler(
        repository,
        SystemDraftClock(),
        budget: budget,
        onReceipt: (receipt) {
          if (receipt.status == SaveStatus.completed) {
            message = 'Rascunho confirmado';
            changed();
          }
        },
        onProblem: (problem) {
          message = feedback(problem);
          changed();
        },
      );
      candidateScheduler.activate(next.project.id, next.generation);
      candidateHost.addListener(_editorChanged);
      // Publish one coherent owner set only after every adoption step succeeds.
      session = next;
      host = candidateHost;
      scheduler = candidateScheduler;
      candidateHost = null;
      candidateScheduler = null;
      _capturedGeneration = -1;
      _editorChanged();
      changed();
    } catch (error) {
      var retired = true;
      try {
        await candidateScheduler?.close();
      } catch (cleanup) {
        retired = false;
        _retiringScheduler = candidateScheduler;
        _rememberCloseFailure(cleanup);
      }
      try {
        await candidateHost?.close();
        candidateHost?.dispose();
      } catch (cleanup) {
        retired = false;
        _retiringHost = candidateHost;
        _rememberCloseFailure(cleanup);
      }
      if (!identical(next, session)) {
        if (retired) {
          next.dispose();
        } else {
          _retiringSession = next;
        }
      }
      rethrow;
    }
  }

  void _editorChanged() {
    final current = session;
    if (_closing || current == null || current.isDisposed) return;
    if (current.generation == _capturedGeneration) return;
    if (current.generation != _capturedGeneration) {
      try {
        scheduler!.changed(
          current.bundle,
          sessionGeneration: current.generation,
        );
        _capturedGeneration = current.generation;
      } catch (e) {
        message = feedback(problemFor(e));
      }
    }
    changed();
  }

  Future<void> checkpoint() async {
    await _action(() async {
      final receipt = await scheduler?.checkpoint();
      message = receipt?.status == SaveStatus.completed
          ? 'Rascunho confirmado'
          : 'Rascunho não confirmado — tentar novamente';
    });
  }

  Future<void> saveProfile() async {
    await _action(() async {
      await profile.save(profile.draft);
      message = 'Perfil confirmado';
    });
  }

  Future<void> reloadProfile() async {
    await _action(() async {
      final loaded = await profile.load();
      message = loaded ? 'Perfil local carregado' : 'Operação não confirmada — perfil local indisponível; perfil manual preservado';
    });
  }

  // The existing root prepays this listener through addStopListener. Starting
  // finish on cancellation joins real enrolled consumers; it is not retirement
  // proof and a failed capability remains owned by the gateway.
  void Function() _joinCancelledRoot(WorkOperation request) =>
      request.addStopListener(() {
        if (request.isCancelled) request.finish().ignore();
      });

  Future<OwnedMediaInput?> _hostMedia(
    AssetKind kind,
    WorkOperation request,
  ) async {
    // Keep the paid listener with the actual host-owned root until its finish,
    // including downstream worker/model use after this byte source returns.
    _joinCancelledRoot(request);
    return documents.media(kind, request);
  }

  Future<void> importProfileLogo() async {
    await _action(() async {
      final request = WorkOperation.create();
      _activeRequest = request;
      ResourceService? resources;
      OwnedMediaInput? input;
      ResourceEntry? entry;
      Object? first;
      var previewPaused = false;
      try {
        _joinCancelledRoot(request);
        resources = ResourceService(budget: budget);
        previewPaused = true;
        host?.preview.setPaused(true);
        await host?.preview.processingSettled;
        input = await documents.media(AssetKind.logo, request);
        if (input == null) {
          message = 'Escolha de logótipo cancelada — perfil preservado';
          return;
        }
        entry = await resources.importImage(
          input.bytes,
          AssetKind.logo,
          operation: request,
        );
        profile.setDraft(
          CompanyProfile(
            logo: entry,
            contacts: profile.draft.contacts,
            colours: profile.draft.colours,
          ),
        );
        message = 'Logótipo manual disponível';
      } catch (error) {
        first = error;
      } finally {
        // The actual image producer has returned. Each independent retirement
        // must still be attempted when a different tail rejects.
        try {
          if (entry != null) await resources!.release(entry);
        } catch (error) {
          first ??= error;
        }
        try {
          await input?.release();
        } catch (error) {
          first ??= error;
        }
        try {
          await request.finish();
        } catch (error) {
          first ??= error;
        }
        if (identical(_activeRequest, request)) _activeRequest = null;
        if (previewPaused && !_closing) {
          try {
            host?.preview.setPaused(false);
          } catch (error) {
            first ??= error;
          }
          try {
            host?.refresh();
          } catch (error) {
            first ??= error;
          }
        }
        if (first != null) throw first;
      }
    });
  }

  Future<bool> _save(CapturedSnapshot snapshot) async {
    final current = session;
    if (current == null) return false;
    final request = WorkOperation.create(
      projectId: snapshot.projectId,
      revision: snapshot.revision,
      sessionGeneration: snapshot.sessionGeneration,
    );
    _activeRequest = request;
    _lastSaveCause = null;
    WriteReceipt? receipt;
    Object? first;
    try {
      _joinCancelledRoot(request);
      receipt = await documents.save(snapshot, request);
    } catch (error) {
      first = error;
    } finally {
      try {
        await request.finish();
      } catch (error) {
        first ??= error;
      }
      if (identical(_activeRequest, request)) _activeRequest = null;
    }
    _lastSaveCause = first;
    final clean = first == null && documents.lastSaveOutcome?.clean != false;
    if (receipt?.status == WriteStatus.completed && !clean) {
      message =
          'Ficheiro editável confirmado: ${receipt!.target!.displayName} — limpeza não confirmada; alterações por guardar';
      changed();
      return false;
    }
    if (receipt == null) {
      message = first == null
          ? 'Gravação cancelada — rascunho preservado'
          : feedback(problemFor(first));
      changed();
      return false;
    }
    final confirmed =
        receipt.status == WriteStatus.completed &&
        clean &&
        current.acknowledgeProjectSave(
          snapshot,
          projectId: snapshot.projectId,
          revision: snapshot.revision,
          sessionGeneration: snapshot.sessionGeneration,
          succeeded: true,
        );
    message = confirmed
        ? 'Projeto editável confirmado: ${receipt.target!.displayName}'
              '${current.isSnapshotCurrent(snapshot) ? '' : ' — versão capturada; alterações posteriores por guardar'}'
        : receipt.residualPlaceholder
        ? 'Ficheiro residual possível — verificar destino; rascunho preservado'
        : feedback(receipt.problem ?? problemFor(StateError('Unconfirmed')));
    changed();
    return confirmed;
  }

  Future<void> saveProject() async {
    await _action(() async {
      final snapshot = session!.captureSnapshot();
      try {
        await _save(snapshot);
      } finally {
        snapshot.release();
      }
    });
  }

  Future<void> openProject({
    LeaveDecision decision = LeaveDecision.discard,
  }) async {
    if (decision == LeaveDecision.cancel) return;
    await _action(() async {
      final previous = session;
      final attempt = previous?.beginLeaveAttempt();
      EditorSession? loaded;
      WorkOperation? request;
      Object? first;
      try {
        request = WorkOperation.create();
        _joinCancelledRoot(request);
        _activeRequest = request;
        if (previous != null && attempt == null) {
          throw StateError('Editor transition in progress');
        }
        if (attempt != null &&
            attempt.wasDirty &&
            decision == LeaveDecision.save &&
            !await _save(attempt.snapshot)) {
          return;
        }
        _activeRequest = request;
        // The inner save temporarily published a different root. Rejoin the
        // shutdown frontier before republishing this still-owned open request.
        if (_closing) request.cancel();
        request.throwIfCancelled();
        loaded = await documents.open(request);
        if (loaded == null) {
          message = 'Abertura cancelada — rascunho preservado';
          return;
        }
        request.throwIfCancelled();
        if (attempt != null &&
            !attempt.complete(
              discard: decision == LeaveDecision.discard,
              saved: decision == LeaveDecision.save,
            )) {
          message = 'A edição mudou durante a abertura — rascunho preservado';
          return;
        }
        if (previous != null) await _detach();
        await adoptSession(loaded);
        loaded = null;
        message = 'Projeto editável aberto';
      } catch (error) {
        first = error;
      } finally {
        try {
          await request?.finish();
        } catch (error) {
          first ??= error;
        }
        if (identical(_activeRequest, request)) _activeRequest = null;
        try {
          loaded?.dispose();
        } catch (error) {
          first ??= error;
        }
        try {
          attempt?.end();
        } catch (error) {
          first ??= error;
        }
        if (first != null) throw first;
      }
    });
  }

  Future<void> exportSelected(
    ExportSelection selection, {
    required Future<bool?> Function(ExportPreflight) approveContent,
    required Future<bool> Function(ExportPreflight) approveDestination,
  }) async {
    await _action(() async {
      final current = session!;
      final snapshot = current.captureSnapshot();
      WorkOperation? request;
      PreparedDestination? destination;
      ExportEvent? terminal;
      Object? firstCause, cleanupCause;
      void Function()? unlinkStop;
      var exporting = false, previewPaused = false;
      try {
        request = WorkOperation.create(
          projectId: snapshot.projectId,
          revision: snapshot.revision,
          sessionGeneration: snapshot.sessionGeneration,
        );
        _activeRequest = request;
        final ownedRequest = request;
        // Stop joins this caller-owned root while the real stream/native markers
        // still protect consumption. A busy adapter's late failed release then
        // settles its existing drain; no gateway body or identity is changed.
        unlinkStop = request.addStopListener(() {
          if (ownedRequest.isCancelled) ownedRequest.finish().ignore();
        });
        final exporter = SequentialExportService(
          renderer: CanvasVariantRenderer(budget: budget),
          gateway: gateway,
          stagingDirectory: staging,
          budget: budget,
        );
        previewPaused = true;
        host!.preview.setPaused(true);
        await host!.preview.processingSettled;
        final first = await exporter.preflight(
          snapshot.bundle,
          selection,
          operation: request,
        );
        final omissions = await approveContent(first);
        if (omissions == null) {
          message = 'Exportação cancelada — nenhum ficheiro confirmado';
          return;
        }
        final contentSelection = selection.approve(omissions: omissions);
        final content = await exporter.preflight(
          snapshot.bundle,
          contentSelection,
          operation: request,
        );
        if (!content.contentReady) {
          message = 'Corrigir variantes ou autorizar explicitamente omissões';
          return;
        }
        if (content.proposedNames.length != 1) {
          message = 'Várias imagens exigem ZIP neste destino — alterar seleção';
          return;
        }
        request.throwIfCancelled();
        destination = await gateway.prepareSave(
          content.proposedNames,
          selection.mimeType,
          operation: request,
        );
        if (destination == null) {
          message = 'Escolha de destino cancelada — nenhum ficheiro confirmado';
          return;
        }
        final approved = contentSelection.approve(
          omissions: omissions,
          destination: true,
        );
        final last = await exporter.preflight(
          snapshot.bundle,
          approved,
          destination: destination,
          operation: request,
        );
        if (!last.readyToExport || !await approveDestination(last)) {
          message = 'Destino não aprovado — nenhum ficheiro confirmado';
          return;
        }
        exporting = true;
        await for (final event in exporter.export(
          snapshot.bundle,
          approved,
          destination: destination,
          operation: request,
        )) {
          if (event.status != ExportStatus.progress) terminal = event;
          message = switch (event.status) {
            ExportStatus.progress =>
              'A preparar imagem: ${event.item} — ainda não confirmada no destino',
            ExportStatus.completed =>
              'Exportação confirmada: ${event.completedItems.join(', ')}',
            ExportStatus.cancelled =>
              event.residual
                  ? 'Exportação cancelada — ficheiro residual possível; confirmados: ${event.completedItems.join(', ')}'
                  : 'Exportação cancelada — confirmados: ${event.completedItems.join(', ')}',
            ExportStatus.failed =>
              event.residual
                  ? 'Ficheiro residual possível — verificar destino; confirmados: ${event.completedItems.join(', ')}'
                  : 'Exportação não confirmada — tentar novamente; confirmados: ${event.completedItems.join(', ')}',
          };
          changed();
        }
      } catch (error) {
        firstCause = error;
      } finally {
        // The stream has joined its actual renderer/model consumption before
        // these independent tails. Failed native identity stays in the gateway.
        try {
          if (destination != null && !exporting) {
            await gateway.abortPrepared(destination, operation: request);
          }
        } catch (error) {
          cleanupCause ??= error;
          message += ' — ficheiro residual possível; verificar destino';
        }
        try {
          await request?.finish();
        } catch (error) {
          cleanupCause ??= error;
        }
        unlinkStop?.call();
        if (identical(_activeRequest, request)) _activeRequest = null;
        try {
          snapshot.release();
        } catch (error) {
          cleanupCause ??= error;
        }
        if (previewPaused && !_closing) {
          try {
            host?.preview.setPaused(false);
          } catch (error) {
            cleanupCause ??= error;
          }
          try {
            host?.refresh();
          } catch (error) {
            cleanupCause ??= error;
          }
        }
        if (firstCause != null) {
          message = feedback(problemFor(firstCause));
          if (cleanupCause != null) {
            message += ' — limpeza não confirmada; ficheiro residual possível';
          }
        } else if (cleanupCause != null) {
          // A later drain rejection cannot erase confirmed items or residuals.
          if (terminal == null && message.isEmpty) {
            message = feedback(problemFor(cleanupCause));
          }
          message += ' — limpeza não confirmada';
        }
      }
    });
  }

  Future<bool> leave(LeaveDecision decision) async {
    if (busy || _closing) return false;
    var allowed = false;
    await _action(() async {
      final current = session;
      if (current == null) {
        allowed = true;
        return;
      }
      allowed = await LeaveProjectGuard(current).leave(decision, save: _save);
      if (!allowed || _closing) {
        allowed = false;
        return;
      }
      await _detach();
      await refresh();
    });
    return allowed;
  }

  Future<void> _detach({bool checkpoint = false}) async {
    _retiringHost ??= host;
    _retiringSession ??= session;
    _retiringScheduler ??= scheduler;
    _retiringHost?.removeListener(_editorChanged);
    host = null;
    session = null;
    scheduler = null;
    changed(); // remove RawImage consumers before joining their real drain
    Object? first;
    try {
      await _retiringScheduler?.close(checkpoint: checkpoint);
      _retiringScheduler = null;
    } catch (error) {
      first ??= error;
      _rememberCloseFailure(error);
    }
    try {
      await _retiringHost?.close();
      _retiringHost?.dispose();
      _retiringHost = null;
    } catch (error) {
      first ??= error;
      _rememberCloseFailure(error);
    }
    // Unknown failed consumer tails retain their finite session custodian.
    if (_retiringScheduler == null && _retiringHost == null) {
      try {
        _retiringSession?.dispose();
        _retiringSession = null;
      } catch (error) {
        first ??= error;
        _rememberCloseFailure(error);
      }
    }
    if (first != null) throw OperationException(problemFor(first).code);
  }

  Future<void> _action(Future<void> Function() action) async {
    if (busy || _closing) return;
    final done = Completer<void>();
    _running = done.future;
    busy = true;
    message = '';
    try {
      changed();
      if (_closing) return;
      await action();
    } catch (e) {
      message = feedback(problemFor(e));
    } finally {
      busy = false;
      _running = null;
      done.complete();
      changed();
    }
  }

  static Problem problemFor(Object e) => e is RepositoryException
      ? e.problem
      : e is CapacityExceeded
      ? e.problem
      : e is DocumentGatewayException
      ? e.problem
      : e is OperationException
      ? e.problem
      : const Problem(
          code: ProblemCode.ioFailure,
          severity: ProblemSeverity.error,
        );
  static String feedback(Problem p) => switch (p.code) {
    ProblemCode.operationCancelled => 'Operação cancelada — nenhum ficheiro confirmado; rascunho manual preservado',
    ProblemCode.capacityExceeded =>
      'Limite de capacidade — reduzir seleção e tentar novamente',
    ProblemCode.permissionDenied => 'Sem permissão — escolher outro destino',
    ProblemCode.noSpace => 'Sem espaço — escolher outro destino',
    _ => 'Operação não confirmada — tentar novamente; o rascunho manual foi preservado',
  };
  Future<void> close() {
    if (_close != null) return _close!;
    // The runtime control prepays this sole completion and error observation.
    final completion = Completer<void>();
    _close = completion.future;
    _close!.ignore();
    _closing = true;
    _drain().then(
      completion.complete,
      onError: (Object error, StackTrace _) {
        _rememberCloseFailure(error);
        completion.completeError(OperationException(closedProblem!.code));
      },
    );
    return _close!;
  }

  Future<void> _drain() async {
    Future<void> attempt(FutureOr<void> Function() action) async {
      try {
        await action();
      } catch (error) {
        _rememberCloseFailure(error);
      }
    }

    await attempt(() => _activeRequest?.cancel());
    await attempt(() => host?.cancelMedia());
    await attempt(() async {
      await _running;
    });
    await attempt(() => _detach(checkpoint: true));
    await attempt(profile.close);
    await attempt(library.close);
    await attempt(gateway.close);
    await attempt(repository.close);
    // A rejection is not retirement proof. Keep this accessible finite owner
    // and its children paid for an explicit unresolved shutdown outcome.
    if (_privateCloseCause != null) {
      _unresolvedRuntimes.add(this); // each member still owns its 64KiB control
      throw OperationException(closedProblem!.code);
    }
    _control.release();
  }

  @override
  void dispose() {
    close().ignore();
    _disposed = true;
    super.dispose();
  }
}
