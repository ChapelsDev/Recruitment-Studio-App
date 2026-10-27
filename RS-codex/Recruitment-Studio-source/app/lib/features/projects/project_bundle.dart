import 'dart:typed_data';
import 'dart:collection';

import 'package:crypto/crypto.dart' as crypto;

import '../../shared/problem.dart';
import '../../shared/operation.dart';
import '../../shared/admission_budget.dart';
import '../../shared/work_budget.dart';
import '../../shared/work_limits.dart';
import 'project.dart';
part 'resource_backing.dart';

int _byteLimit(AssetKind kind) => switch (kind) {
  AssetKind.photo => WorkLimits.photoBytes,
  AssetKind.logo => WorkLimits.logoBytes,
  AssetKind.thumbnail => WorkLimits.thumbnailBytes,
};
String _validateResource(
  AssetRef ref,
  Uint8List bytes, {
  String? actualDigest,
  void Function(int)? onResourceDigest,
}) {
  if (bytes.length > _byteLimit(ref.kind)) {
    throw const CapacityExceeded();
  }
  final digest = actualDigest ?? crypto.sha256.convert(bytes).toString();
  if (actualDigest == null) {
    try {
      onResourceDigest?.call(bytes.length);
    } catch (_) {
      /* Passive observer only. */
    }
  }
  if (bytes.isEmpty || digest != ref.sha256) {
    throw ArgumentError('Resource digest mismatch');
  }
  // Digest and metadata equality do NOT establish codec/header/EXIF safety (T03).
  return digest;
}

final class ResourceEntry {
  factory ResourceEntry({required AssetRef ref, required Uint8List bytes,
    List<Problem> warnings = const [], WorkBudgetController? budget}) {
    if (warnings.length > 32 || bytes.length > _byteLimit(ref.kind)) {
      throw const CapacityExceeded();
    }
    var warningUnits = 0;
    for (final warning in warnings) {
      for (final text in [warning.sectionId ?? '', warning.field ?? '', warning.actionLabel]) {
        if (text.length > WorkLimits.fieldUtf16Units) { throw const CapacityExceeded(); }
        warningUnits += text.length;
      }
    }
    final ordinary = AdmissionBudget.shared.reserve(1024 + 512 * warnings.length + 4 * warningUnits);
    WorkCopyReservation? copying;
    try {
      _validateResource(ref, bytes);
      copying = (budget ?? WorkBudget.shared() as WorkBudgetController).reserveCopy(bytes.length * 2);
      final owned = _copyBacking(bytes);
      _validateResource(ref, owned);
      final result = ResourceEntry._(ref, owned, List.unmodifiable(warnings));
      ordinary.retainAll([result, result.warnings]);
      return result;
    } catch (_) { ordinary.release(); rethrow; }
    finally { copying?.release(); }
  }
  ResourceEntry._(this.ref, this.bytes, this.warnings);
  final AssetRef ref;
  final Uint8List bytes;
  final List<Problem> warnings;
}

/// Resources are keyed by AssetRef IDs, not ZIP paths or hash filenames.
/// Unreferenced bytes are retained (bounded), allowing snapshots to reuse them.
final class ProjectBundle {
  /// Passive per-bundle test seam observes actual crypto byte work. It cannot
  /// supply/replace a digest and receives no resource bytes; observer exceptions
  /// cannot change validation. Needed for deterministic regression, not timing.
  factory ProjectBundle(
    Project project,
    Map<String, Uint8List> resources, {
    void Function(int)? onResourceDigest,
    WorkBudgetController? budget,
  }) {
    _validateStorage(resources);
    final ordinary = AdmissionBudget.shared.reserve(8192 + 512 * resources.length);
    WorkCopyReservation? copying;
    try {
    final stable = _storageSnapshot(resources);
    var total = 0;
    for (final bytes in stable.values) { total += bytes.length; }
    final immutableProject = ImmutableProject.snapshot(project);
    final controller = budget ?? WorkBudget.shared() as WorkBudgetController;
    try {
      _validate(immutableProject, stable, const {}, null);
    } on ArgumentError {
      // Keep semantic refusal authoritative even when copy admission is denied.
      // Only an admitted source/destination envelope may perform observed work.
      // No resource copy or digest proof escapes this unconditional refusal path.
      if (controller.capacityBytes > 0) {
        try {
          copying = controller.reserveCopy(total * 2);
          _validate(immutableProject, stable, const {}, onResourceDigest);
        } on CapacityExceeded {
          // Unadmitted: no copy and no observer; preserve the semantic error below.
        } on ArgumentError {
          // Real crypto has reported its work; it cannot waive the earlier refusal.
        }
      }
      rethrow;
    }
    copying = controller.reserveCopy(total * 2);
    _validateStorage(stable);
    final owned = {
      for (final entry in stable.entries)
        entry.key: _copyBacking(entry.value),
    };
    final validated = _validate(
      immutableProject,
      owned,
      const {},
      onResourceDigest,
    );
    final result = ProjectBundle._(
      immutableProject, owned, validated, onResourceDigest);
    ordinary.retain(result.resources);
    return result;
    } catch (_) { ordinary.release(); rethrow; }
    finally { copying?.release(); }
  }
  /// Builds one sealed consumer bundle. This method itself authenticates origin,
  /// reserves destination identities in the supplied controller/operation, and
  /// defensively copies every foreign buffer. Callers cannot inject a paid flag.
  /// Raw caller aliases remain under the existing explicit custody protocol.
  static ({ProjectBundle bundle, Map<Uint8List, WorkReservation> reservations}) copyForOwner(
    Project project, Map<String, Uint8List> input, {
    required WorkBudgetController budget, required Operation operation,
  }) {
    _validateStorage(input);
    final ordinary = AdmissionBudget.shared.reserve(128 * 1024);
    final provisional = <WorkReservation>[];
    WorkCopyReservation? sources;
    try {
      final stable = _storageSnapshot(input);
      _validateStorage(stable);
      final concrete = ImmutableProject.snapshot(project);
      // No observer or resource copy is allowed before the entire semantic gate.
      final checked = _validate(concrete, stable, const {}, null);
      var foreignBytes = 0;
      for (final bytes in stable.values) {
        if (!_knownBacking(bytes)) { foreignBytes += bytes.lengthInBytes; }
      }
      // Genuine source+new destination buffers coexist only on foreign copies.
      // Authentic sources share the same immutable backing with a distinct view.
      sources = budget.reserveCopy(foreignBytes);
      for (final bytes in stable.values) {
        provisional.add(budget.reserve(operation, bytes.lengthInBytes));
      }
      final resources = <String, Uint8List>{};
      final reservations = HashMap<Uint8List, WorkReservation>.identity();
      var i = 0;
      for (final entry in stable.entries) {
        final token = provisional[i++];
        if (!token.coversCopy(budget, entry.value.lengthInBytes)) {
          throw StateError('Inactive destination prepayment');
        }
        final owned = _knownBacking(entry.value)
            ? _paidBackingView(entry.value, token, budget)
            : _copyBacking(entry.value);
        resources[entry.key] = owned;
        reservations[owned] = token;
      }
      // Bind prior semantic digests to the new exact identities only after the
      // copy/adoption. No arbitrary cached digest or callback can be supplied.
      final proofs = <String, _ResourceDigest>{
        for (final row in checked.entries)
          if (_knownBacking(stable[row.key]!))
            row.key: _ResourceDigest(resources[row.key]!, row.value.digest),
      };
      final validated = _validate(concrete, resources, proofs, null);
      final result = ProjectBundle._(concrete, resources, validated, null);
      // This readonly custody table is public and can escape independently.
      // It remains paid after the temporary construction workspace retires.
      final tableTicket = AdmissionBudget.shared.reserve(8192 + 512 * reservations.length);
      try {
        final table = Map<Uint8List, WorkReservation>.unmodifiable(reservations);
        tableTicket.retain(table);
        return (bundle: result, reservations: table);
      } catch (_) { tableTicket.release(); rethrow; }
    } catch (_) {
      for (final token in provisional) { token.release(); }
      rethrow;
    } finally {
      try { sources?.release(); } finally { ordinary.release(); }
    }
  }

  ProjectBundle._(
    this.project,
    Map<String, Uint8List> resources,
    Map<String, _ResourceDigest> validated,
    this._onResourceDigest,
  ) : resources = _ownMetadata(resources),
      _validated = Map.unmodifiable(validated);
  static Map<String, Uint8List> _ownMetadata(Map<String, Uint8List> input) {
    _validateStorage(input);
    final ticket = AdmissionBudget.shared.reserve(32 * 1024);
    try {
      final result = Map<String, Uint8List>.unmodifiable(input);
      ticket.retain(result); return result;
    } catch (_) { ticket.release(); rethrow; }
  }
  // Immutable, bounded by this snapshot's resource keys; never a global cache.
  final Map<String, _ResourceDigest> _validated;
  final void Function(int)? _onResourceDigest;
  final Project project;
  final Map<String, Uint8List> resources;
  static Map<String, Uint8List> _storageSnapshot(Map<String, Uint8List> input) {
    final captured = <String, Uint8List>{};
    var total = 0;
    for (final row in input.entries) {
      if (captured.length >= WorkLimits.packageEntries) { throw const CapacityExceeded(); }
      validateId(row.key);
      if (captured.containsKey(row.key)) { throw ArgumentError('Duplicate resource identifier'); }
      total += row.value.lengthInBytes;
      if (total > WorkLimits.projectExpandedBytes) { throw const CapacityExceeded(); }
      captured[row.key] = row.value;
    }
    return captured;
  }

  static void _validateStorage(Map<String, Uint8List> resources) {
    validateIds(resources.keys, WorkLimits.packageEntries);
    var total = 0;
    for (final bytes in resources.values) {
      total += bytes.length;
      if (total > WorkLimits.projectExpandedBytes) {
        throw const CapacityExceeded();
      }
    }
  }

  static Map<String, _ResourceDigest> _validate(
    Project project,
    Map<String, Uint8List> resources,
    Map<String, _ResourceDigest> previous,
    void Function(int)? onResourceDigest,
  ) {
    _validateStorage(resources);
    final validated = <String, _ResourceDigest>{
      for (final entry in previous.entries)
        if (identical(resources[entry.key], entry.value.bytes))
          entry.key: entry.value,
    };
    for (final ref in [project.photo, project.logo]) {
      if (ref == null) {
        continue;
      }
      final bytes = resources[ref.id];
      if (bytes == null) {
        throw ArgumentError('Missing referenced resource');
      }
      // Every reference still checks its current kind/size and expected digest.
      // A recreated AssetRef is not a key; only authenticated owned byte identity
      // supplies an actual digest. New/unreferenced/replaced buffers use crypto.
      final digest = _validateResource(
        ref,
        bytes,
        actualDigest: validated[ref.id]?.digest,
        onResourceDigest: onResourceDigest,
      );
      validated[ref.id] = _ResourceDigest(bytes, digest);
    }
    return validated;
  }

  ProjectBundle withProject(Project next) {
    final scratch = AdmissionBudget.shared.reserve(32 * 1024);
    try { return _withProjectOwned(next); } finally { scratch.release(); }
  }
  ProjectBundle _withProjectOwned(Project next) {
    final immutableProject = ImmutableProject.snapshot(next);
    final validated = _validate(
      immutableProject,
      resources,
      _validated,
      _onResourceDigest,
    );
    return ProjectBundle._(
      immutableProject,
      resources,
      validated,
      _onResourceDigest,
    );
  }

  /// Map-only pruning of dispensable keys; storage and digest authentication
  /// remain bound to the exact immutable buffers. Old snapshots are unchanged.
  ProjectBundle retainResources(Iterable<String> ids) {
    final scratch = AdmissionBudget.shared.reserve(32 * 1024);
    try { return _retainResourcesOwned(ids); } finally { scratch.release(); }
  }
  ProjectBundle _retainResourcesOwned(Iterable<String> ids) {
    final selected = <String>[];
    for (final id in ids) {
      if (selected.length >= WorkLimits.packageEntries) { throw const CapacityExceeded(); }
      selected.add(id);
    }
    validateIds(selected, WorkLimits.packageEntries);
    if (selected.any((id) => !resources.containsKey(id))) {
      throw ArgumentError('Unknown retained resource');
    }
    final retained = {for (final id in selected) id: resources[id]!};
    final validated = _validate(
      project,
      retained,
      _validated,
      _onResourceDigest,
    );
    return ProjectBundle._(project, retained, validated, _onResourceDigest);
  }

  /// Final referenced-resource replacement in one map transition. A supplied
  /// Project is still strictly snapshotted. The entry's final immutable backing
  /// is authenticated by its concrete origin; cached sibling proofs survive.
  ProjectBundle withReferencedResource(ResourceEntry entry, {required Project project}) {
    final scratch = AdmissionBudget.shared.reserve(32 * 1024);
    try {
      final next = ImmutableProject.snapshot(project);
      final selected = <String, Uint8List>{};
      for (final ref in [next.photo, next.logo]) {
        if (ref == null) { continue; }
        final bytes = ref.id == entry.ref.id ? entry.bytes : resources[ref.id];
        if (bytes == null) { throw ArgumentError('Missing referenced resource'); }
        selected[ref.id] = bytes;
      }
      final validated = _validate(next, selected, _validated, _onResourceDigest);
      return ProjectBundle._(next, selected, validated, _onResourceDigest);
    } finally { scratch.release(); }
  }

  /// Entry already owns readonly bytes; only its initial mutable input was copied.
  ProjectBundle withResource(ResourceEntry entry, {Project? project}) {
    final scratch = AdmissionBudget.shared.reserve(32 * 1024);
    try { return _withResourceOwned(entry, project: project); } finally { scratch.release(); }
  }
  ProjectBundle _withResourceOwned(ResourceEntry entry, {Project? project}) {
    final next = project == null
        ? this.project
        : ImmutableProject.snapshot(project);
    if (!this.resources.containsKey(entry.ref.id) &&
        this.resources.length >= WorkLimits.packageEntries) { throw const CapacityExceeded(); }
    final resources = {...this.resources, entry.ref.id: entry.bytes};
    final validated = _validate(next, resources, _validated, _onResourceDigest);
    return ProjectBundle._(next, resources, validated, _onResourceDigest);
  }
}

final class _ResourceDigest {
  const _ResourceDigest(this.bytes, this.digest);
  final Uint8List bytes;
  final String digest;
}
