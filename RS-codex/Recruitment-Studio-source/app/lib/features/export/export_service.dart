import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import 'package:archive/archive.dart';

import '../../shared/work_limits.dart';
import '../storage/package_zip_io.dart' show requireRegularPath;
import '../storage/private_file_io.dart';
import '../storage/private_effect_custody.dart';
import '../../shared/admission_budget.dart';
import '../../shared/operation.dart';
import '../../shared/problem.dart';
import '../../shared/work_budget.dart';
import '../composition/export_format.dart';
import '../composition/variant_renderer.dart';
import '../composition/variant_validator.dart';
import '../documents/document_gateway.dart';
import '../projects/project.dart';
import '../projects/project_bundle.dart';
import 'export_name.dart';
import 'export_selection.dart';

final class ExportVariant {
  ExportVariant(this.locale, this.format, this.name, this.problems);
  final AppLocale locale;
  final ExportFormat format;
  final String name;
  final List<Problem> problems;
  bool get valid => !problems.any((p) => p.severity == ProblemSeverity.error);
}

final class ExportPreflight {
  ExportPreflight({
    required this.validVariants,
    required this.invalidVariants,
    required this.proposedNames,
    this.destination,
    required this.selectionValid,
    required this.omissionsApproved,
    required this.destinationApproved,
    required this.operationMatches,
  });
  final List<ExportVariant> validVariants, invalidVariants;
  final List<String> proposedNames;
  final PreparedDestination? destination;
  final bool selectionValid,
      omissionsApproved,
      destinationApproved,
      operationMatches;
  bool get destinationPending => destination == null;
  List<String> get collisions => destination?.collisions ?? const [];
  bool get contentReady =>
      selectionValid &&
      validVariants.isNotEmpty &&
      (invalidVariants.isEmpty || omissionsApproved);
  bool get readyToExport =>
      contentReady &&
      destinationApproved &&
      operationMatches &&
      destination != null &&
      destination!.canReadBack &&
      collisions.isEmpty &&
      proposedNames.length == destination!.approvedNames.length &&
      proposedNames.every(destination!.approvedNames.contains);
}

enum ExportStatus { progress, completed, cancelled, failed }

final class ExportEvent {
  ExportEvent(
    this.status, {
    this.item,
    this.completedItems = const [],
    this.receipt,
    this.problem,
    this.residual = false,
  });
  final ExportStatus status;
  final String? item;
  final List<String> completedItems;
  final WriteReceipt? receipt;
  final Problem? problem;
  final bool residual;
}

abstract interface class ExportService {
  Future<ExportPreflight> preflight(
    ProjectBundle bundle,
    ExportSelection selection, {
    PreparedDestination? destination,
    Operation? operation,
  });
  Stream<ExportEvent> export(
    ProjectBundle snapshot,
    ExportSelection approvedSelection, {
    required PreparedDestination destination,
    Operation? operation,
  });
}

final class SequentialExportService implements ExportService {
  SequentialExportService({
    required this.renderer,
    required this.gateway,
    required this.stagingDirectory,
    required this.budget,
    this.io = const PrivateFileIo(),
  });
  final VariantRenderer renderer;
  final DocumentGateway gateway;
  final Directory stagingDirectory;
  final WorkBudgetController budget;
  final PrivateFileIo io;
  @override
  Future<ExportPreflight> preflight(
    ProjectBundle bundle,
    ExportSelection selection, {
    PreparedDestination? destination,
    Operation? operation,
  }) async {
    operation?.throwIfCancelled();
    PreparedOperationBinding? binding;
    if (destination != null) {
      try {
        binding = preparedOperationFor(gateway, destination);
      } on DocumentGatewayException {
        /* stale/foreign capability is not approval */
      }
    }
    // Independently escaping names/problem scalars get finite monotonic credit,
    // not a wrapper finalizer refund. No project content is normalized.
    AdmissionBudget.shared.reserve(64 * 1024);
    final valid = <ExportVariant>[], invalid = <ExportVariant>[];
    final structural =
        selection.structurallyValid &&
        selection.locales.every(bundle.project.localeOrder.contains);
    if (structural) {
      final validator = VariantValidator();
      for (final locale in selection.locales) {
        for (final format in selection.formats) {
          final variant = ExportVariant(
            locale,
            format,
            ExportName.forVariant(
              bundle.project.name,
              locale,
              format,
              selection.encoding,
            ),
            validator.validate(bundle.project, locale, format),
          );
          (variant.valid ? valid : invalid).add(variant);
        }
      }
    }
    final names = selection.bundleAsZip
        ? [ExportName.forZip(bundle.project.name)]
        : [for (final v in valid) v.name];
    return ExportPreflight(
      validVariants: List.unmodifiable(valid),
      invalidVariants: List.unmodifiable(invalid),
      proposedNames: List.unmodifiable(names),
      destination: destination,
      selectionValid: structural,
      omissionsApproved: selection.invalidOmissionsApproved,
      destinationApproved: selection.destinationApproved,
      operationMatches:
          binding != null &&
          (operation == null || identical(operation, binding.operation)),
    );
  }

  void _open(WorkOperation operation) {
    operation.throwIfCancelled();
    if (operation.isFinishing) {
      throw const OperationException(ProblemCode.operationCancelled);
    }
  }

  Problem _problem(Object error) => error is DocumentGatewayException
      ? error.problem
      : error is OperationException
      ? error.problem
      : error is CapacityExceeded
      ? error.problem
      : const Problem(
          code: ProblemCode.ioFailure,
          severity: ProblemSeverity.error,
          actionLabel: 'Tentar novamente',
        );
  @override
  Stream<ExportEvent> export(
    ProjectBundle snapshot,
    ExportSelection approvedSelection, {
    required PreparedDestination destination,
    Operation? operation,
  }) async* {
    final completed = <String>[];
    final done = Completer<void>();
    PrivateEffectCustody? custody;
    RandomAccessFile? output;
    AdmissionTicket? credit;
    WorkCopyReservation? buffers;
    WorkLease? workspace;
    WriteReceipt? receipt;
    Problem? problem;
    var enrolled = false, writeAttempted = false, residual = false;
    var status = ExportStatus.failed;
    var implicitOwner = false;
    try {
      final binding = preparedOperationFor(gateway, destination);
      if (binding != null) {
        if (operation != null && !identical(operation, binding.operation)) {
          throw const OperationException(ProblemCode.invalidSelection);
        }
        operation ??= binding.operation;
        implicitOwner = binding.implicit;
      }
      if (operation is! WorkOperation) {
        throw const OperationException(ProblemCode.invalidSelection);
      }
      _open(operation);
      credit = AdmissionBudget.shared.reserve(256 * 1024);
      buffers = budget.reserveCopy(512 * 1024);
      custody = PrivateEffectCustody(io);
      operation.registerPending(done.future);
      enrolled = true;
      final check = await preflight(
        snapshot,
        approvedSelection,
        destination: destination,
        operation: operation,
      );
      if (!check.readyToExport || check.proposedNames.length != 1) {
        throw const OperationException(ProblemCode.invalidSelection);
      }
      _open(operation);
      if (renderer is BorrowedLeaseVariantRenderer) {
        var maximum = 0;
        for (final variant in check.validVariants) {
          final estimate = rendererAllocationEstimate(
            snapshot,
            variant.format,
            approvedSelection.encoding,
          );
          if (estimate > maximum) maximum = estimate;
        }
        workspace = await budget.acquire(operation, maximum);
      }
      // Caller supplies an application-private root. A unique directory contains
      // only this invocation's output, never the project, logs or other exports.
      requireRegularPath(
        File('${stagingDirectory.path}/export-probe'),
        absent: true,
      );
      final file = await custody.createStage(
        stagingDirectory,
        'export-',
        'payload',
      );
      await file.create(exclusive: true);
      custody.trackCreatedFile();
      output = await io.open(file, mode: FileMode.write);
      custody.handle = output;
      final central = <Uint8List>[];
      var offset = 0;
      for (final variant in check.validVariants) {
        _open(operation);
        // The caller's single workspace remains paid through real native and
        // pipeline obligations. Each raster/worker/result retires before next.
        final producer = renderer;
        final rendered = producer is BorrowedLeaseVariantRenderer
            ? await producer.renderWithLease(
                snapshot,
                variant.locale,
                variant.format,
                approvedSelection.encoding,
                operation: operation,
                lease: workspace!,
              )
            : await producer.render(
                snapshot,
                variant.locale,
                variant.format,
                approvedSelection.encoding,
                operation: operation,
              );
        try {
          _open(operation);
          final bytes = rendered.bytes;
          if (bytes.length > WorkLimits.exportImageBytes) {
            throw const CapacityExceeded();
          }
          if (approvedSelection.bundleAsZip) {
            final name = '${variant.locale.code}/${variant.name}'.codeUnits;
            final crc = getCrc32(bytes);
            final local = Uint8List(30 + name.length);
            final l = ByteData.sublistView(local);
            l.setUint32(0, 0x04034b50, Endian.little);
            l.setUint16(4, 20, Endian.little);
            l.setUint32(14, crc, Endian.little);
            l.setUint32(18, bytes.length, Endian.little);
            l.setUint32(22, bytes.length, Endian.little);
            l.setUint16(26, name.length, Endian.little);
            local.setRange(30, local.length, name);
            final c = Uint8List(46 + name.length);
            final v = ByteData.sublistView(c);
            v.setUint32(0, 0x02014b50, Endian.little);
            v.setUint16(4, 20, Endian.little);
            v.setUint16(6, 20, Endian.little);
            v.setUint32(16, crc, Endian.little);
            v.setUint32(20, bytes.length, Endian.little);
            v.setUint32(24, bytes.length, Endian.little);
            v.setUint16(28, name.length, Endian.little);
            v.setUint32(42, offset, Endian.little);
            c.setRange(46, c.length, name);
            if (offset +
                    local.length +
                    bytes.length +
                    22 +
                    central.fold<int>(0, (n, item) => n + item.length) +
                    c.length >
                WorkLimits.exportStagingBytes) {
              throw const CapacityExceeded();
            }
            central.add(c);
            await output.writeFrom(local);
            offset += local.length + bytes.length;
          }
          for (var p = 0; p < bytes.length; p += 65536) {
            _open(operation);
            await output.writeFrom(
              bytes,
              p,
              (p + 65536).clamp(0, bytes.length),
            );
          }
        } finally {
          // Drop each encoded buffer before admitting the next raster workspace.
          await rendered.dispose();
        }
        yield ExportEvent(ExportStatus.progress, item: variant.name);
      }
      if (approvedSelection.bundleAsZip) {
        var size = 0;
        for (final c in central) {
          _open(operation);
          await output.writeFrom(c);
          size += c.length;
        }
        final end = Uint8List(22), e = ByteData(22);
        e.setUint32(0, 0x06054b50, Endian.little);
        e.setUint16(8, central.length, Endian.little);
        e.setUint16(10, central.length, Endian.little);
        e.setUint32(12, size, Endian.little);
        e.setUint32(16, offset, Endian.little);
        end.setAll(0, e.buffer.asUint8List());
        await output.writeFrom(end);
      }
      await output.flush();
      custody.sealProducedFile();
      await custody.closeHandle();
      output = null;
      _open(operation);
      if (implicitOwner && enrolled) {
        // The producer (rasters/workers/result buffers and actual output close)
        // has settled. Private stage retirement has independent paid custody;
        // the unchanged gateway now owns the native write/implicit finish tail.
        done.complete();
        enrolled = false;
      }
      writeAttempted = true;
      receipt = await gateway.writePrepared(
        file,
        destination,
        check.proposedNames.single,
        operation: operation,
      );
      residual = receipt.residualPlaceholder;
      problem = receipt.problem;
      status = switch (receipt.status) {
        WriteStatus.completed => ExportStatus.completed,
        WriteStatus.cancelled => ExportStatus.cancelled,
        WriteStatus.failed => ExportStatus.failed,
      };
      if (receipt.status == WriteStatus.completed) {
        // Only the gateway's closed readback is an external written assertion.
        completed.add(receipt.target!.displayName);
      }
    } catch (error) {
      problem = _problem(error);
      residual = error is DocumentGatewayException && error.residualPlaceholder;
      status = problem.code == ProblemCode.operationCancelled
          ? ExportStatus.cancelled
          : ExportStatus.failed;
    } finally {
      if (output != null && custody != null) {
        try {
          custody.sealProducedFile();
        } catch (error) {
          residual = true;
          problem ??= _problem(error);
        }
      }
      output = null; // no producer alias remains after custody transfer
      if (custody != null) {
        custody.temporaryPayment = buffers;
        buffers = null;
        if (!await custody.retire()) {
          residual = true;
          problem ??= custody.problem;
        }
      }
      if (implicitOwner && enrolled) {
        // Fault/abort reached here only after the actual producer settled and
        // any real residual transferred to its prepaid custodian.
        done.complete();
        enrolled = false;
      }
      if (!writeAttempted && operation != null) {
        try {
          await gateway.abortPrepared(destination, operation: operation);
        } catch (error) {
          // Stop can already consume this exact capability (or be joining its
          // adapter drain). That is not evidence of a residual external file.
          if (!(error is DocumentGatewayException &&
              error.problem.code == ProblemCode.invalidSelection &&
              operation.isCancelled &&
              operation.id == destination.operationId)) {
            residual = true;
          }
        }
      }
      workspace?.release();
      buffers?.release();
      credit?.release();
      if (enrolled) {
        done.complete();
      }
      if (operation?.isCancelled == true) {
        // After releasing our own pending marker, join native stop cleanup
        // before publishing a cancelled terminal, not merely a requested stop.
        try {
          await operation!.finish();
        } catch (_) {
          residual = true;
        }
      }
    }
    if (residual && status == ExportStatus.completed) {
      status = ExportStatus.failed;
      problem = _problem(const OperationException(ProblemCode.ioFailure));
    }
    yield ExportEvent(
      status,
      completedItems: List.unmodifiable(completed),
      receipt: receipt,
      problem: problem,
      residual: residual,
    );
  }
}
