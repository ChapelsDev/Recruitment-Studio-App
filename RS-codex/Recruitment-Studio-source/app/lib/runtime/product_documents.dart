import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import '../features/documents/document_gateway.dart';
import '../features/editor/editor_host_controller.dart';
import '../features/editor/editor_session.dart';
import '../features/export/export_name.dart';
import '../features/projects/project.dart';
import '../features/storage/package_zip_io.dart';
import '../features/storage/project_codec.dart';
import '../features/storage/private_file_io.dart';
import '../features/storage/private_effect_custody.dart';
import '../shared/problem.dart';
import '../shared/admission_budget.dart';
import '../shared/operation.dart';
import '../shared/work_budget.dart';
import '../shared/work_limits.dart';

/// Native boundary acquires capabilities; actual bytes use the same production
/// gateways, codec and owned editor/media consumers on host and target devices.
final class ProductSaveOutcome {
  const ProductSaveOutcome(
    this.receipt,
    this.firstProblem,
    this.cleanupProblem,
    this.residual,
  );
  final WriteReceipt? receipt;
  final Problem? firstProblem, cleanupProblem;
  final bool residual;
  bool get clean => firstProblem == null && cleanupProblem == null && !residual;
}

final class ProductDocuments {
  ProductDocuments(
    this.gateway,
    this.staging,
    this.budget, {
    this.io = const PrivateFileIo(),
    this.encoder,
  }) : codec = ZipProjectCodec(budget: budget);
  final DocumentGateway gateway;
  final Directory staging;
  final WorkBudgetController budget;
  final ZipProjectCodec codec;
  final PrivateFileIo io;
  final ProjectCodec? encoder;
  ProductSaveOutcome? _lastSaveOutcome;
  ProductSaveOutcome? get lastSaveOutcome => _lastSaveOutcome;
  bool _saving = false;
  Problem _problem(Object error) => error is DocumentGatewayException
      ? error.problem
      : error is OperationException
      ? error.problem
      : error is CapacityExceeded
      ? error.problem
      : const Problem(
          code: ProblemCode.ioFailure,
          severity: ProblemSeverity.error,
        );
  Future<OwnedMediaInput?> media(AssetKind kind, WorkOperation request) async {
    final cap = kind == AssetKind.photo
        ? WorkLimits.photoBytes
        : WorkLimits.logoBytes;
    final ref = await gateway.pickOpen({
      'image/jpeg',
      'image/png',
    }, operation: request);
    if (ref == null) return null;
    final file = await gateway.stageRead(ref, cap, operation: request);
    requireRegularPath(file);
    final reader = _LocalMediaRead(request);
    PrivateEffectCustody? custody;
    Uint8List? bytes;
    OwnedMediaInput? candidate;
    Object? first;
    try {
      custody = PrivateEffectCustody(io);
      final handle = await io.open(file);
      custody.handle = handle; // immediate, nonfallible descriptor adoption
      request.throwIfCancelled();
      final length = await handle.length();
      if (length <= 0 || length > cap) throw const CapacityExceeded();
      custody.temporaryPayment = budget.reserveCopy(2 * length);
      bytes = await handle.read(length);
      if (bytes.length != length || await handle.length() != length) {
        throw const PackageFailure('Unstable staged image');
      }
      request.throwIfCancelled();
      // Source closure precedes result creation/publication. A close fault owns
      // only its actual descriptor/read payment, never an undisclosed result.
      await custody.closeHandle();
      request.throwIfCancelled();
      candidate = OwnedMediaInput.copyOf(bytes, kind, budget);
    } catch (error) {
      first = error;
    } finally {
      bytes = null;
      final retired = await custody?.retire() ?? true;
      if (!retired) first ??= const OperationException(ProblemCode.ioFailure);
      // No outstanding local IO remains. A failed descriptor stays in its paid
      // custodian and media still throws its first error. An already draining
      // root must also report that failure; a later finish is only a phase join
      // and must not invalidate explicit residual recovery by the caller.
      reader.settled(failedWhileFinishing: !retired && request.isFinishing);
    }
    if (first != null) {
      await candidate?.release();
      if (first is OperationException || first is CapacityExceeded) throw first;
      throw const OperationException(ProblemCode.ioFailure);
    }
    return candidate;
  }

  Future<WriteReceipt?> save(
    CapturedSnapshot snapshot,
    WorkOperation request,
  ) async {
    if (_saving) throw const OperationException(ProblemCode.invalidSelection);
    // Outcome/escaping receipt wrapper and effect custody are paid before IO.
    final outcomeCredit = AdmissionBudget.shared.reserve(8192);
    PrivateEffectCustody? custody;
    try {
      custody = PrivateEffectCustody(io);
    } catch (_) {
      outcomeCredit.release();
      rethrow;
    }
    _saving = true;
    PreparedDestination? destination;
    WriteReceipt? receipt;
    Object? first;
    Problem? cleanup;
    var writeAttempted = false, residual = false;
    try {
      final name = ExportName.forProject(snapshot.bundle.project.name);
      destination = await gateway.prepareSave(
        [name],
        'application/zip',
        operation: request,
      );
      if (destination != null) {
        request.throwIfCancelled();
        final file = await custody.createStage(
          staging,
          'project-',
          'project.recruitproj',
        );
        await (encoder ?? codec).encode(
          snapshot.bundle,
          file,
          operation: request,
        );
        custody.sealProducedFile();
        request.throwIfCancelled();
        writeAttempted = true;
        receipt = await gateway.writePrepared(
          file,
          destination,
          name,
          operation: request,
        );
      }
    } catch (error) {
      first = error;
    } finally {
      if (destination != null && !writeAttempted) {
        try {
          await gateway.abortPrepared(destination, operation: request);
        } catch (error) {
          cleanup ??= _problem(error);
          residual = true;
        }
      }
      if (!await custody.retire()) {
        cleanup ??= custody.problem;
        residual = true;
      }
      final outcome = ProductSaveOutcome(
        receipt,
        first == null ? null : _problem(first),
        cleanup,
        residual,
      );
      // Receipt/problem references can escape this wrapper independently. Keep
      // the prepaid small outcome envelope monotonic; effects are separately
      // owned by explicit custodians, with no collection-time refunds.
      _lastSaveOutcome = outcome;
      _saving = false;
    }
    if (receipt != null) {
      return receipt; // exact verified effect survives cleanup
    }
    if (first != null) throw OperationException(_problem(first).code);
    if (cleanup != null) throw OperationException(cleanup.code);
    return null;
  }

  Future<EditorSession?> open(WorkOperation request) async {
    final ref = await gateway.pickOpen({
      'application/zip',
      'application/octet-stream',
    }, operation: request);
    if (ref == null) return null;
    final input = await gateway.stageRead(
      ref,
      WorkLimits.projectCompressedBytes,
      operation: request,
    );
    await gateway.retireOpen(ref, operation: request);
    return await codec.decodeEditorSession(input, operation: request);
  }
}

/// Only the local staged-file producer: never joins request.finish, native
/// entry cleanup, transferred input ownership, or downstream worker/model use.
final class _LocalMediaRead {
  factory _LocalMediaRead(WorkOperation request) {
    // Pay completion/control metadata before its birth. The existing root pays
    // its genuine pending observer separately (1024), with unchanged prices.
    final credit = AdmissionBudget.shared.reserve(4096);
    try {
      final reader = _LocalMediaRead._();
      reader._refund = request.registerRelease(credit.release);
      request.registerPending(reader._done.future);
      return reader;
    } catch (_) {
      credit.release();
      rethrow; // no local IO or descriptor custody has been started
    }
  }
  _LocalMediaRead._();
  final _done = Completer<void>();
  late final DeferredRelease _refund;

  void settled({required bool failedWhileFinishing}) {
    if (failedWhileFinishing) {
      _done.completeError(const OperationException(ProblemCode.ioFailure));
    } else {
      _done.complete();
    }
    // Refund only after the actual root observer's last use. This requests a
    // prepaid synchronous release, not a future that waits on its own root.
    _refund.request();
  }
}
