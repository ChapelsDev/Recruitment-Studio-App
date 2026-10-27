import 'dart:typed_data';

import 'package:crypto/crypto.dart' as crypto;

import '../../shared/work_limits.dart';
import '../../shared/admission_budget.dart';
import '../../shared/operation.dart';
import '../../shared/problem.dart';
import '../../shared/work_budget.dart';
import '../projects/project.dart';
import '../projects/project_bundle.dart';
import 'image_header_probe.dart';
import 'media_worker.dart';

/// Host media boundary. Application instances share T01's single heavy slot.
/// Imported immutable entries AND previews remain charged until explicit release
/// after a caller has established its own retained ownership (e.g. EditorSession).
final class ResourceService {
  ResourceService({WorkBudgetController? budget, MediaWorker? worker})
    : _budget = budget ?? WorkBudget.shared() as WorkBudgetController,
      _worker = worker ?? MediaWorker() {
    AdmissionBudget.shared.reserve(4096).retain(this);
  }
  final WorkBudgetController _budget;
  final MediaWorker _worker;
  final Map<ResourceEntry, _Retained> _retained = {};
  int _imports = 0;

  Future<ResourceEntry> importImage(
    Uint8List input,
    AssetKind kind, {
    Operation? operation,
  }) async {
    final op = operation ?? WorkOperation.create();
    if (op is! WorkOperation) {
      throw ArgumentError('Unsupported operation lifecycle');
    }
    WorkLease? lease;
    WorkReservation? snapshotCharge;
    WorkOperation? retainedOwner;
    AdmissionTicket? retainedControl;
    var admitted = false;
    ResourceEntry? publishedEntry;
    try {
      if (_retained.length + _imports >= WorkLimits.retainedMedia) { throw const CapacityExceeded(); }
      retainedControl = AdmissionBudget.shared.reserve(4096);
      _imports++;
      admitted = true;
      _checkBytes(input.length, kind);
      snapshotCharge = _budget.reserve(op, input.length * 2 + 1024 * 1024);
      final snapshot = Uint8List.fromList(input).asUnmodifiableView();
      final header = ImageHeaderProbe().inspect(snapshot);
      _checkKind(header, kind);
      lease = await _budget.acquire(
        op,
        mediaAllocationEstimate(header, snapshot.length),
      );
      final result = await _worker.run(snapshot, operation: op, lease: lease);
      op.throwIfCancelled();
      if (op.isFinishing) {
        throw const OperationException(ProblemCode.operationCancelled);
      }
      retainedOwner = WorkOperation.create();
      _budget.reserve(
        retainedOwner,
        result.bytes.length + result.preview.length,
      );
      final ref = AssetRef(
        id: 'media-${kind.name}-${result.sha256}',
        kind: kind,
        mediaType: MediaType.png,
        width: result.width,
        height: result.height,
        sha256: result.sha256,
      );
      final entry = ResourceEntry(
        ref: ref,
        bytes: result.bytes,
        budget: _budget,
        warnings:
            kind == AssetKind.photo &&
                (result.width < 1080 || result.height < 1080)
            ? [
                const Problem(
                  code: ProblemCode.insufficientResolution,
                  severity: ProblemSeverity.warning,
                  actionLabel: 'Rever resolução',
                ),
              ]
            : [],
      );
      _retained[entry] = _Retained(
        retainedOwner,
        result.preview.asUnmodifiableView(), retainedControl,
      );
      retainedControl = null;
      retainedOwner = null;
      publishedEntry = entry;
      return entry;
    } finally {
      try {
        try { if (retainedOwner != null) { await retainedOwner.finish(); } }
        finally {
          retainedControl?.release();
          if (admitted) { _imports--; }
          try { lease?.release(); }
          finally {
            snapshotCharge?.release();
            if (operation == null) { await op.finish(); }
          }
        }
      } catch (_) {
        // A failed producer finish cannot strand an undisclosed service entry.
        if (publishedEntry != null) { await release(publishedEntry); }
        rethrow;
      }
    }
  }

  Future<void> validateEmbedded(
    Uint8List bytes,
    AssetRef expected, {
    Operation? operation,
  }) async {
    final op = operation ?? WorkOperation.create();
    if (op is! WorkOperation) {
      throw ArgumentError('Unsupported operation lifecycle');
    }
    WorkLease? lease;
    WorkReservation? snapshotCharge;
    try {
      _checkBytes(bytes.length, expected.kind);
      snapshotCharge = _budget.reserve(op, bytes.length * 2 + 1024 * 1024);
      final snapshot = Uint8List.fromList(bytes).asUnmodifiableView();
      final header = ImageHeaderProbe().inspect(snapshot);
      _checkExpected(snapshot, header, expected);
      lease = await _budget.acquire(
        op,
        mediaAllocationEstimate(header, snapshot.length),
      );
      await _worker.verify(snapshot, operation: op, lease: lease);
    } finally {
      lease?.release();
      snapshotCharge?.release();
      if (operation == null) await op.finish();
    }
  }

  /// Future project validation may borrow a live parent heavy lease without
  /// recursive acquire; only this child's paid scratch is released here.
  Future<void> validateEmbeddedWithLease(
    Uint8List bytes,
    AssetRef expected, {
    required WorkOperation operation,
    required WorkLease lease,
  }) async {
    lease.forChild(operation);
    _checkBytes(bytes.length, expected.kind);
    final charge = lease.reserveAdditional(
      operation,
      bytes.length * 2 + 1024 * 1024,
    );
    try {
      final snapshot = Uint8List.fromList(bytes).asUnmodifiableView();
      _checkExpected(snapshot, ImageHeaderProbe().inspect(snapshot), expected);
      await _worker.verifyBorrowed(
        snapshot,
        operation: operation,
        lease: lease,
      );
    } finally {
      charge.release();
    }
  }

  void _checkBytes(int length, AssetKind kind) {
    final cap = switch (kind) {
      AssetKind.photo => WorkLimits.photoBytes,
      AssetKind.logo => WorkLimits.logoBytes,
      AssetKind.thumbnail => WorkLimits.thumbnailBytes,
    };
    if (length > cap) throw const CapacityExceeded();
    if (length == 0) invalidMedia();
  }

  void _checkKind(ImageHeader header, AssetKind kind) {
    if (kind == AssetKind.thumbnail) {
      if (header.width > WorkLimits.thumbnailSide ||
          header.height > WorkLimits.thumbnailSide) {
        throw const CapacityExceeded();
      }
    } else if (header.width <= 0 || header.height <= 0 || header.width >
        (kind == AssetKind.photo ? WorkLimits.photoPixels : WorkLimits.logoPixels) ~/ header.height) {
      throw const CapacityExceeded();
    }
  }

  void _checkExpected(Uint8List bytes, ImageHeader header, AssetRef expected) {
    _checkKind(header, expected.kind);
    if (header.hasPrivateMetadata ||
        header.orientation != 1 ||
        header.mediaType != expected.mediaType ||
        header.width != expected.width ||
        header.height != expected.height ||
        crypto.sha256.convert(bytes).toString() != expected.sha256) {
      invalidMedia();
    }
  }

  Uint8List previewFor(ResourceEntry entry) {
    final retained = _retained[entry];
    if (retained == null) {
      throw ArgumentError('Entry is not retained by this service');
    }
    return retained.preview;
  }

  /// Call only after all consumers have transferred accounting or dropped bytes.
  Future<void> release(ResourceEntry entry) async {
    final retained = _retained.remove(entry);
    if (retained != null) {
      try { await retained.owner.finish(); }
      finally { retained.control.release(); }
    }
  }
}

final class _Retained {
  const _Retained(this.owner, this.preview, this.control);
  final AdmissionTicket control;
  final WorkOperation owner;
  final Uint8List preview;
}
