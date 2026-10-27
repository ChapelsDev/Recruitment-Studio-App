import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import 'package:crypto/crypto.dart' as crypto;

import '../../shared/operation.dart';
import '../../shared/admission_budget.dart';
import '../../shared/problem.dart';
import '../../shared/work_budget.dart';
import '../../shared/work_limits.dart';
import '../media/image_header_probe.dart';
import '../media/resource_service.dart';
import '../projects/project.dart';
import 'package_worker.dart';
import 'package_working_set.dart';
import 'package_zip_io.dart';

String packageAssetPath(AssetRef ref) =>
    'assets/${ref.sha256}.${ref.mediaType == MediaType.png ? 'png' : 'jpg'}';

/// Completed detached inspection result. Cache thumbnail never joins public
/// composition resources. Caller must account any retained result after return.
final class PackageIndex {
  factory PackageIndex({required Project project,
    required Map<String, PackageZipEntry> entries,
    required Map<String, Uint8List> resources,
    AssetRef? thumbnailRef, Uint8List? thumbnailBytes}) {
    if (entries.length > WorkLimits.packageEntries || resources.length > WorkLimits.packageEntries ||
        entries.entries.any((entry) => entry.key.length > 75 || entry.value.name.length > 75) ||
        (thumbnailBytes?.length ?? 0) > WorkLimits.thumbnailBytes) {
      throw const CapacityExceeded();
    }
    validateIds(resources.keys, WorkLimits.packageEntries);
    var total = 0;
    for (final bytes in resources.values) {
      if (bytes.length > WorkLimits.projectExpandedBytes - total) { throw const CapacityExceeded(); }
      total += bytes.length;
    }
    final credit = AdmissionBudget.shared.reserve(32 * 1024);
    try {
      final result = PackageIndex._(project, Map.unmodifiable(entries),
        Map.unmodifiable(resources), thumbnailRef, thumbnailBytes);
      credit.retainAll([result, result.entries, result.resources]); return result;
    } catch (_) { credit.release(); rethrow; }
  }
  PackageIndex._(this.project, this.entries, this.resources, this.thumbnailRef, this.thumbnailBytes);
  final Project project;
  final Map<String, PackageZipEntry> entries;
  final Map<String, Uint8List> resources;
  final AssetRef? thumbnailRef;
  final Uint8List? thumbnailBytes;
}

final class PackagePreflight {
  PackagePreflight({
    WorkBudgetController? budget,
    this.resources,
    PackageWorker? worker,
    this.onPhase,
  }) : budget = budget ?? WorkBudget.shared() as WorkBudgetController,
       _worker = worker ?? PackageWorker();
  final WorkBudgetController budget;
  final ResourceService? resources;
  final PackageWorker _worker;
  final void Function(String)? onPhase;

  Future<PackageIndex> inspect(
    File input, {
    Operation? operation,
    void Function(PackageIndex)? beforeRelease,
  }) async {
    final op = operation ?? WorkOperation.create();
    if (op is! WorkOperation) {
      throw ArgumentError('Unsupported operation lifecycle');
    }
    WorkLease? lease;
    AdmissionTicket? indexCharge;
    final deadline = Timer(WorkLimits.decodeTimeout, op.cancel);
    try {
      packageCheckOperation(op);
      // Structural scope only: <=16 payload/path/index rows, <=3 role refs,
      // bounded75-unit names, timer/stat/IO descriptors. JSON8MiB is separately
      // prepaid only in readProject; domain/conversion/validation remain paid.
      // Source-derived partition: 32KiB rows +32KiB IO +64KiB control/slack.
      indexCharge = AdmissionBudget.shared.reserve(128 * 1024);
      final original = input.statSync();
      final container = await PackageZipIO.readIndex(
        input,
        operation: op,
        onPhase: onPhase,
      );
      lease = await budget.acquire(
        op,
        PackageWorkingSet.inspectionReservation(container),
      );
      final payload = <String, Uint8List>{};
      var actual = 0;
      for (final entry in container.entries.values) {
        requireRegularPath(input);
        final bytes = await _worker.readEntry(
          input,
          entry,
          operation: op,
          lease: lease,
        );
        actual += bytes.length;
        if (actual > WorkLimits.projectExpandedBytes ||
            bytes.length != entry.expandedSize) {
          throw const CapacityExceeded();
        }
        payload[entry.name] = bytes.asUnmodifiableView();
      }
      packageCheckOperation(op);
      final parsed = StrictManifestJson.readProject(payload['manifest.json']!);
      final project = parsed.project;
      final thumbnail = parsed.thumbnail;
      final refs = [
        if (project.photo != null) project.photo!,
        if (project.logo != null) project.logo!,
        ?thumbnail,
      ];
      if (thumbnail != null &&
          [project.photo?.id, project.logo?.id].contains(thumbnail.id)) {
        throw const PackageFailure('duplicate auxiliary resource ID');
      }
      final paths = <String, AssetRef>{};
      for (final ref in refs) {
        final path = ref.kind == AssetKind.thumbnail
            ? 'thumbnail.png'
            : packageAssetPath(ref);
        final previous = paths[path];
        if (previous != null &&
            (previous.width != ref.width ||
                previous.height != ref.height ||
                previous.mediaType != ref.mediaType)) {
          throw const PackageFailure('inconsistent content-addressed metadata');
        }
        paths[path] = ref;
      }
      if (payload.length != paths.length + 1 ||
          paths.keys.any((p) => !payload.containsKey(p))) {
        throw const PackageFailure('missing or orphan resource');
      }
      // ALL role/header/hash checks precede ANY actual decoder, including cache.
      for (final ref in refs) {
        final path = ref.kind == AssetKind.thumbnail
            ? 'thumbnail.png'
            : packageAssetPath(ref);
        checkEmbeddedHeader(payload[path]!, ref);
      }
      onPhase?.call('headersVerified');
      packageCheckOperation(op);
      final service = resources ?? ResourceService(budget: budget);
      for (final ref in refs) {
        final path = ref.kind == AssetKind.thumbnail
            ? 'thumbnail.png'
            : packageAssetPath(ref);
        await service.validateEmbeddedWithLease(
          payload[path]!,
          ref,
          operation: op,
          lease: lease,
        );
      }
      final now = input.statSync();
      requireRegularPath(input);
      if (original.size != now.size ||
          original.modified != now.modified ||
          original.changed != now.changed ||
          original.mode != now.mode) {
        throw const PackageFailure('input changed during inspection');
      }
      onPhase?.call('verified');
      packageCheckOperation(op);
      final result = PackageIndex(
        project: project,
        entries: container.entries,
        resources: {
          for (final ref in [project.photo, project.logo])
            if (ref != null) ref.id: payload[packageAssetPath(ref)]!,
        },
        thumbnailRef: thumbnail,
        thumbnailBytes: payload['thumbnail.png'],
      );
      beforeRelease?.call(result);
      packageCheckOperation(op);
      return result;
    } finally {
      deadline.cancel();
      // Uma falha num release não pode suprimir as obrigações seguintes.
      try {
        lease?.release();
      } finally {
        try {
          indexCharge?.release();
        } finally {
          if (operation == null) {
            await op.finish();
          }
        }
      }
    }
  }


}

void checkEmbeddedHeader(Uint8List bytes, AssetRef ref) {
  final cap = switch (ref.kind) {
    AssetKind.photo => WorkLimits.photoBytes,
    AssetKind.logo => WorkLimits.logoBytes,
    AssetKind.thumbnail => WorkLimits.thumbnailBytes,
  };
  if (bytes.length > cap) {
    throw const CapacityExceeded();
  }
  final h = ImageHeaderProbe().inspect(bytes);
  final pixels = ref.kind == AssetKind.photo
      ? WorkLimits.photoPixels
      : WorkLimits.logoPixels;
  if (ref.kind == AssetKind.thumbnail
      ? h.width > 512 || h.height > 512
      : h.width > pixels ~/ h.height) {
    throw const CapacityExceeded();
  }
  if (h.hasPrivateMetadata ||
      h.orientation != 1 ||
      h.width != ref.width ||
      h.height != ref.height ||
      h.mediaType != ref.mediaType ||
      crypto.sha256.convert(bytes).toString() != ref.sha256) {
    throw const OperationException(ProblemCode.invalidResource);
  }
}
