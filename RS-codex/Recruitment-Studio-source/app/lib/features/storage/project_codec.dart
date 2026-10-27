import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import '../../shared/operation.dart';
import '../../shared/admission_budget.dart';
import '../../shared/problem.dart';
import '../../shared/work_budget.dart';
import '../../shared/work_limits.dart';
import '../editor/editor_session.dart';
import '../media/resource_service.dart';
import '../projects/project.dart';
import '../projects/project_bundle.dart';
import 'package_preflight.dart';
import 'package_zip_io.dart';

abstract interface class ProjectCodec {
  Future<void> encode(
    ProjectBundle bundle,
    File output, {
    Operation? operation,
  });
  Future<ProjectBundle> decode(File input, {Operation? operation});
}

/// Producer of fresh private prepared files, never a destination overwriter or
/// a session transaction. Application owns destination approval and retention.
final class ZipProjectCodec implements ProjectCodec {
  ZipProjectCodec({
    WorkBudgetController? budget,
    this.onPhase,
    WorkOperation Function()? createDecodedConsumerOperation,
  }) : budget = budget ?? WorkBudget.shared() as WorkBudgetController,
       _createDecodedConsumerOperation =
           createDecodedConsumerOperation ?? _freshDecodedConsumerOperation {
    AdmissionBudget.shared.reserve(8192).retain(this);
  }
  final WorkBudgetController budget;
  // The factory transfers a fresh active operation only to the new owned route.
  // Legacy raw encode/decode and every borrowed call keep their old creation.
  final WorkOperation Function() _createDecodedConsumerOperation;

  static WorkOperation _freshDecodedConsumerOperation() =>
      WorkOperation.create();
  final void Function(String)? onPhase;
  // Two role slots bound persistent metadata independently of live old bundles.
  // Weak targets never own resource bytes; active calls keep detached proofs.
  _CachedVerified? _photoVerified;
  _CachedVerified? _logoVerified;
  // This is a conservative codec-owned BUFFER admission contract, not a
  // measured allocation nor the ordinary 8MiB JSON-control workspace. The
  // primary encode contract retains a 16MiB floor through closed output/drain.
  // Account its concrete producer roles before creating any serialization/IO:
  // two full manifest buffers; STORE headers+central builder+flattened output;
  // and one submitted plus one transport copy of a 64KiB write chunk. Source
  // resources are charged separately. Media admission retains its independent
  // ResourceService/MediaWorker scratch claim (not borrowed from this floor).
  static int _encodeBufferEnvelope(int retained) {
    const manifestBuffers = 2 * WorkLimits.manifestUtf8Bytes;
    const storeTables = 2 * WorkLimits.packageEntries * (46 + 75) + 30 + 75 + 22;
    const submittedAndTransportChunks = 2 * 65536;
    const concreteProducerBound = manifestBuffers + storeTables + submittedAndTransportChunks;
    const conservativeContractFloor = 16 * 1024 * 1024;
    return retained + (concreteProducerBound > conservativeContractFloor
        ? concreteProducerBound : conservativeContractFloor);
  }

  @override
  Future<void> encode(
    ProjectBundle bundle,
    File output, {
    Operation? operation,
  }) async {
    final op = operation ?? WorkOperation.create();
    if (op is! WorkOperation) {
      throw ArgumentError('Unsupported operation lifecycle');
    }
    WorkReservation? charge;
    AdmissionTicket? ordinary;
    AdmissionTicket? structure;
    WorkLease? lease;
    RandomAccessFile? handle;
    FileStat? closedStat;
    var created = false, completed = false;
    final drained = Completer<void>();
    var enrolled = false;
    try {
      packageCheckOperation(op);
      requireRegularPath(output, absent: true);
      structure = AdmissionBudget.shared.reserve(128 * 1024);
      final refs = [
        if (bundle.project.photo != null) bundle.project.photo!,
        if (bundle.project.logo != null) bundle.project.logo!,
      ];
      var retained = 0;
      for (final bytes in bundle.resources.values) {
        retained += bytes.length;
      }
      ordinary = AdmissionBudget.shared.reserve(8 * 1024 * 1024);
      // Reserve before the first manifest buffer and hold through actual output
      // close, ownership-checked deletion, pending drain and lease last use.
      charge = budget.reserve(op, _encodeBufferEnvelope(retained));
      final project = ImmutableProject.snapshot(bundle.project);
      final manifest = project.manifestBytes(workspace: ordinary, budget: budget,
        prepaidBuffers: charge);
      if (manifest.length > WorkLimits.manifestUtf8Bytes) {
        throw const CapacityExceeded();
      }
      StrictManifestJson.validate(manifest, admission: ordinary);
      // No generated/raw graph or serialization String escapes either concrete
      // producer. Retire JSON workspace before media/IO awaits; maps stay paid.
      ordinary.release();
      ordinary = null;
      final payload = <String, Uint8List>{'manifest.json': manifest},
          crcs = <String, int>{'manifest.json': PackageZipIO.crc(manifest)};
      var expanded = manifest.length;
      // Capture identity proofs before callbacks/await can evict a role slot.
      final admissions = [
        for (final ref in refs)
          _Admission(
            ref,
            bundle.resources[ref.id]!,
            _cachedProof(bundle.resources[ref.id]!, ref),
          ),
      ];
      final needAdmission = admissions.any((a) => a.proof == null);
      if (needAdmission) {
        lease = await budget.acquire(op, 0);
      }
      final service = ResourceService(budget: budget);
      // All cheap header/metadata gates precede the first actual image worker.
      for (final admission in admissions) {
        final ref = admission.ref, bytes = admission.bytes;
        if (admission.proof == null) {
          onPhase?.call('digest');
          checkEmbeddedHeader(bytes, ref);
        }
        final path = packageAssetPath(ref);
        if (!payload.containsKey(path)) {
          expanded += bytes.length;
          payload[path] = bytes;
        }
        if (expanded > WorkLimits.projectExpandedBytes) {
          throw const CapacityExceeded();
        }
      }
      for (final admission in admissions) {
        final ref = admission.ref, bytes = admission.bytes;
        if (admission.proof == null) {
          onPhase?.call('mediaAdmission');
          await service.validateEmbeddedWithLease(
            bytes,
            ref,
            operation: op,
            lease: lease!,
          );
          packageCheckOperation(op);
          final proof = _Verified(ref, PackageZipIO.crc(bytes));
          admission.proof = proof;
          _publishProof(bytes, ref, proof);
        }
        crcs[packageAssetPath(ref)] = admission.proof!.crc;
      }
      // The validated narrow STORE container is constructed from exact names
      // and immutable bytes; no re-import/raster is needed on each autosave.
      var zipSize = 22;
      for (final entry in payload.entries) {
        zipSize += 76 + entry.key.length * 2 + entry.value.length;
      }
      if (zipSize > WorkLimits.projectCompressedBytes) {
        throw const CapacityExceeded();
      }
      packageCheckOperation(op);
      op.registerPending(drained.future);
      enrolled = true;
      await output.create(exclusive: true);
      created = true;
      handle = await output.open(mode: FileMode.writeOnly);
      await PackageZipIO.writeStore(handle, payload, crcs, op);
      await handle.flush();
      await handle.close();
      handle = null;
      closedStat = output.statSync();
      onPhase?.call('outputClosed');
      packageCheckOperation(op);
      completed = true;
    } finally {
      try {
        await handle?.close();
      } finally {
        try {
          if (created && !completed) {
            // Once closed, compare actual producer bytes, never refresh the
            // ownership snapshot to match a foreign replacement.
            final file = output;
            try {
              requireRegularPath(file);
              final expected = closedStat ?? file.statSync();
              final now = file.statSync();
              if (now.size == expected.size &&
                  now.modified == expected.modified &&
                  now.changed == expected.changed &&
                  now.mode == expected.mode) {
                await file.delete();
              }
            } on PackageFailure {
              /* Absent/nonregular/linked paths are not owned output to delete. */
            } on FileSystemException {
              /* Preserve a foreign/replaced path. */
            }
            onPhase?.call('outputDiscarded');
          }
        } finally {
          // Close, guarded cleanup and diagnostic hooks may all throw. None may
          // strand the registered output barrier or skip resource finalization.
          try {
            if (enrolled) {
              drained.complete();
              await Future<void>.delayed(Duration.zero);
            }
          } finally {
            try {
              lease?.release();
            } finally {
              try {
                charge?.release();
              } finally {
                try { ordinary?.release(); }
                finally {
                  structure?.release();
                  if (operation == null) { await op.finish(); }
                }
              }
            }
          }
        }
      }
    }
  }

  _Verified? _cachedProof(Uint8List bytes, AssetRef ref) {
    final row = switch (ref.kind) {
      AssetKind.photo => _photoVerified,
      AssetKind.logo => _logoVerified,
      AssetKind.thumbnail => null,
    };
    if (row == null) {
      return null;
    }
    final target = row.target.target;
    return identical(target, bytes) && _matches(row.proof, ref)
        ? row.proof
        : null;
  }

  void _publishProof(Uint8List bytes, AssetRef ref, _Verified proof) {
    final row = _CachedVerified(bytes, proof);
    switch (ref.kind) {
      case AssetKind.photo:
        _photoVerified = row;
      case AssetKind.logo:
        _logoVerified = row;
      case AssetKind.thumbnail:
        throw ArgumentError('Unsupported cache role');
    }
  }

  bool _matches(_Verified? v, AssetRef ref) {
    if (v == null) {
      return false;
    }
    return v.kind == ref.kind &&
        v.sha256 == ref.sha256 &&
        v.type == ref.mediaType &&
        v.width == ref.width &&
        v.height == ref.height;
  }

  /// Creates an ordinary paid editor owner before releasing producer claims.
  /// The raw [decode] route remains available for compatibility/inspection.
  Future<EditorSession> decodeEditorSession(
    File input, {
    Operation? operation,
  }) async {
    final ownsOperation = operation == null;
    final op = operation ?? _createDecodedConsumerOperation();
    if (op is! WorkOperation) {
      throw ArgumentError('Unsupported operation lifecycle');
    }
    EditorSession? unpublished;
    var published = false;
    var ownedFinishAttempted = false;
    try {
      packageCheckOperation(op);
      await PackagePreflight(budget: budget).inspect(
        input,
        operation: op,
        beforeRelease: (index) {
          final candidate = ProjectBundle(index.project, index.resources, budget: budget);
          onPhase?.call('beforeConsumerAdoption');
          packageCheckOperation(op);
          unpublished = EditorSession.fromBundle(candidate, budget: budget);
          for (final ref in [candidate.project.photo, candidate.project.logo]) {
            if (ref != null) {
              _publishProof(
                candidate.resources[ref.id]!,
                ref,
                _Verified(ref, index.entries[packageAssetPath(ref)]!.crc32),
              );
            }
          }
          onPhase?.call('beforePublication');
          packageCheckOperation(op);
        },
      );
      packageCheckOperation(op);
      await _awaitDecodedSourceDrain(op, onPhase);
      packageCheckOperation(op);
      if (ownsOperation) {
        ownedFinishAttempted = true;
        await op.finish();
        op.throwIfCancelled();
      } else {
        packageCheckOperation(op);
      }
      final result = unpublished!;
      unpublished = null;
      published = true;
      return result;
    } finally {
      try {
        // Keep the ordinary consumer payment through an owned finish tail,
        // including work enrolled by a failing post-preflight diagnostic.
        if (ownsOperation && !ownedFinishAttempted) {
          ownedFinishAttempted = true;
          await op.finish();
        }
      } finally {
        if (!published) {
          final retiring = unpublished;
          unpublished = null;
          retiring?.dispose();
        }
      }
    }
  }

  static Future<void> _awaitDecodedSourceDrain(
    WorkOperation operation,
    void Function(String)? onPhase,
  ) async {
    while (true) {
      packageCheckOperation(operation);
      final ready = Completer<void>();
      // A hook may stop the operation and throw before the first await.
      // Observe this private wake-up future now; awaiting it below still
      // propagates cancellation when the hook returns normally.
      ready.future.ignore();
      final removeStop = operation.addStopListener(() {
        if (!ready.isCompleted) {
          ready.completeError(
            const OperationException(ProblemCode.operationCancelled),
          );
        }
      });
      try {
        onPhase?.call('consumerDrainWaiting');
        operation.afterPending(() {
          if (!ready.isCompleted) {
            ready.complete();
          }
        });
        await ready.future;
      } finally {
        removeStop();
      }
      packageCheckOperation(operation);
      // A later idle callback can enroll work before this continuation runs.
      // Observe the current state through the existing API, not a new counter.
      var idleNow = false;
      operation.afterPending(() => idleNow = true);
      if (idleNow) {
        return;
      }
    }
  }

  @override
  Future<ProjectBundle> decode(File input, {Operation? operation}) async {
    final op = operation ?? WorkOperation.create();
    if (op is! WorkOperation) {
      throw ArgumentError('Unsupported operation lifecycle');
    }
    ProjectBundle? candidate;
    WorkCopyReservation? deliveryCharge;
    var delivered = false;
    try {
      await PackagePreflight(budget: budget).inspect(
        input,
        operation: op,
        beforeRelease: (index) {
          var bytes = 0;
          for (final data in index.resources.values) { bytes += data.length; }
          deliveryCharge = budget.reserveCopy(bytes);
          candidate = ProjectBundle(index.project, index.resources, budget: budget);
          for (final ref in [
            candidate!.project.photo,
            candidate!.project.logo,
          ]) {
            if (ref != null) {
              _publishProof(
                candidate!.resources[ref.id]!,
                ref,
                _Verified(ref, index.entries[packageAssetPath(ref)]!.crc32),
              );
            }
          }
          onPhase?.call('beforePublication');
          packageCheckOperation(op);
        },
      );
      packageCheckOperation(op);
      await _awaitDecodedSourceDrain(op, null);
      if (operation == null) { await op.finish(); op.throwIfCancelled(); }
      else { packageCheckOperation(op); }
      final result = candidate!;
      candidate = null;
      // Existing raw caller custody begins at this immediate return. There is
      // no await or producer access after surrendering the consumer prepayment.
      deliveryCharge?.release(); deliveryCharge = null;
      delivered = true;
      return result;
    } finally {
      candidate = null;
      try {
        if (!delivered && operation == null) { await op.finish(); }
      } finally { deliveryCharge?.release(); }
    }
  }
}

final class _CachedVerified {
  _CachedVerified(Uint8List bytes, this.proof)
    : target = WeakReference<Uint8List>(bytes);
  final WeakReference<Uint8List> target;
  final _Verified proof;
}

final class _Admission {
  _Admission(this.ref, this.bytes, this.proof);
  final AssetRef ref;
  final Uint8List bytes;
  _Verified? proof;
}

final class _Verified {
  _Verified(AssetRef ref, this.crc)
    : kind = ref.kind,
      sha256 = ref.sha256,
      type = ref.mediaType,
      width = ref.width,
      height = ref.height;
  final AssetKind kind;
  final String sha256;
  final MediaType type;
  final int width, height, crc;
}
