import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:crypto/crypto.dart' as crypto;

import '../../shared/admission_budget.dart';
import '../../shared/operation.dart';
import '../../shared/problem.dart';
import '../../shared/work_budget.dart';
import '../../shared/work_limits.dart';
import '../editor/editor_session.dart';
import '../projects/project.dart';
import '../projects/project_bundle.dart';
import 'draft_capture.dart';
import 'package_zip_io.dart';
import 'project_codec.dart';

abstract interface class LocalRepository {
  Future<SaveReceipt> saveDraft(ProjectBundle bundle, {Operation? operation});
  Future<ProjectBundle?> recoverDraft(String projectId);
  Future<List<ProjectSummary>> listProjects();
  Future<void> saveProfile(CompanyProfile profile);
  Future<CompanyProfile?> loadProfile();
}

enum SaveStatus { completed, cancelled, failed, superseded }

/// Finite, monotonic ordinary credit for independently escapable result scalars.
/// Dart's Finalizer/Expando contracts exclude Strings. There is no safe refund
/// triggered by wrapper/list collection or repository close. Publication consumes
/// the existing conservative price until isolate/process exit; exhaustion is an
/// honest capacity refusal. This stores only counters, never results or tickets.
abstract final class RepositoryResultCustody {
  static int _reservedBytes = 0;
  static int get reservedBytes => _reservedBytes;
  static void _consume(AdmissionTicket prepaid) {
    if (!prepaid.isActive || !prepaid.isApplicationCredit) {
      throw StateError('Invalid result scalar prepayment');
    }
    _reservedBytes += prepaid.bytes;
    // Deliberately neither finalizer attachment nor release: budget counters
    // retain payment even if the ticket and all wrappers become collectible.
  }
}

final class SaveReceipt {
  SaveReceipt({
    required this.projectId,
    required this.revision,
    required this.sessionGeneration,
    required this.snapshotSha256,
    required this.status,
    this.problem,
  }) {
    validateId(projectId);
    if (revision < 0 ||
        sessionGeneration < 0 ||
        (status == SaveStatus.completed &&
            (snapshotSha256 == null || !_digest.hasMatch(snapshotSha256!)))) {
      throw ArgumentError('Invalid save receipt');
    }
    RepositoryResultCustody._consume(AdmissionBudget.shared.reserve(2048));
  }
  SaveReceipt._prepaid(
    this.projectId,
    this.revision,
    this.sessionGeneration,
    this.snapshotSha256,
    this.status,
    this.problem,
    AdmissionTicket credit,
  ) {
    RepositoryResultCustody._consume(credit);
  }
  final String projectId;
  final int revision, sessionGeneration;
  final String? snapshotSha256;
  final SaveStatus status;
  final Problem? problem;
  @override
  String toString() => 'SaveReceipt(${status.name}, revision: $revision)';
}

/// Pay the terminal acknowledgement before the first side effect. Exhaustion
/// after commit cannot manufacture a failed receipt for persisted bytes.
final class _SaveClaim {
  _SaveClaim(this.id, this.revision, this.generation)
    : credit = AdmissionBudget.shared.reserve(2048) {
    try {
      drainCredit = AdmissionBudget.shared.reserve(1024);
    } catch (_) {
      credit.release();
      rethrow;
    }
  }
  final String id;
  final int revision, generation;
  final AdmissionTicket credit;
  late final AdmissionTicket drainCredit;
  bool published = false;
  SaveReceipt make(SaveStatus status, {String? hash, Problem? problem}) {
    if (published) throw StateError('Save receipt already delivered');
    published = true;
    return SaveReceipt._prepaid(
      id,
      revision,
      generation,
      hash,
      status,
      problem,
      credit,
    );
  }

  void close() {
    if (!published) credit.release();
    drainCredit.release();
  }
}

final class ProjectSummary {
  ProjectSummary({
    required this.id,
    required this.name,
    required this.revision,
    required this.lastConfirmedSave,
  }) {
    validateId(id);
    validateText(name);
    RepositoryResultCustody._consume(
      AdmissionBudget.shared.reserve(2048 + 4 * name.length),
    );
  }
  final String id, name;
  final int revision;
  final DateTime lastConfirmedSave;
  // A cache is optional. No unvalidated thumbnail is produced by this repository.
  ResourceEntry? get thumbnail => null;
}

final class RepositoryException implements Exception {
  const RepositoryException(this.problem);
  final Problem problem;
  @override
  String toString() => 'Repository failed: ${problem.code.name}';
}

/// Injectable transitions surround actual IO, not substitute successful IO.
/// Snapshot flush/close happen once in the codec and are repeated at this
/// persistence boundary; index writes have separate write/flush/close seams.
enum RepositoryPhase {
  writeSnapshot,
  flushSnapshot,
  closeSnapshot,
  validateSnapshot,
  promoteSnapshot,
  writeIndex,
  flushIndex,
  closeIndex,
  validateIndex,
  promoteIndex,
  readback,
}

final _digest = RegExp(r'^[0-9a-f]{64}$');
final _snapshot = RegExp(
  r'^(draft|profile)-([0-9a-f]{64})-([0-9]{16})-([0-9]{16})-([0-9a-f]{64})\.recruitproj$',
);
final _temporary = RegExp(r'^t07-tmp-[0-9a-f]{32}\.(snapshot|index)$');

/// Private regular-file adapter. Overrides must preserve the bounded/ownership
/// contract. [onPhase] can fault, suspend, corrupt, or cancel any transition.
class FileStore {
  Future<void> Function(RepositoryPhase)? onPhase;
  Future<void> phase(RepositoryPhase phase) async {
    await onPhase?.call(phase);
  }

  Future<void> finishOwnedOperation(WorkOperation operation) =>
      operation.finish();
  Future<void> unlock(RandomAccessFile handle) => handle.unlock();
  Future<void> closeLock(RandomAccessFile handle) => handle.close();

  Future<void> encode(
    ZipProjectCodec codec,
    ProjectBundle bundle,
    File file,
    WorkOperation operation,
  ) => codec.encode(bundle, file, operation: operation);
  Future<void> sync(
    File file,
    RepositoryPhase flush,
    RepositoryPhase close,
  ) async {
    requireRegularPath(file);
    final handle = await file.open(mode: FileMode.append);
    try {
      await phase(flush);
      await handle.flush();
      await phase(close);
    } finally {
      await handle.close();
    }
  }

  Future<void> write(File file, Uint8List bytes) async {
    requireRegularPath(file, absent: true);
    await file.create(exclusive: true);
    final handle = await file.open(mode: FileMode.writeOnly);
    try {
      await handle.writeFrom(bytes);
      await phase(RepositoryPhase.flushIndex);
      await handle.flush();
      await phase(RepositoryPhase.closeIndex);
    } finally {
      await handle.close();
    }
  }

  Future<void> promote(File source, File target) async {
    requireRegularPath(source);
    requireRegularPath(target, absent: true);
    await source.rename(target.path);
  }

  Future<Uint8List> read(File file, int maximumBytes) async {
    requireRegularPath(file);
    final handle = await file.open();
    try {
      final length = await handle.length();
      if (length > maximumBytes) throw const CapacityExceeded();
      final bytes = await handle.read(length);
      if (bytes.length != length || await handle.length() != length) {
        throw const PackageFailure('short private read');
      }
      return bytes;
    } finally {
      await handle.close();
    }
  }

  Future<String> hash(
    File file,
    int maximumBytes, {
    int start = 0,
    int? count,
    WorkOperation? operation,
  }) async {
    requireRegularPath(file);
    final before = file.statSync();
    final handle = await file.open();
    final output = _DigestSink();
    final sink = crypto.sha256.startChunkedConversion(output);
    try {
      final length = await handle.length();
      if (length > maximumBytes ||
          start < 0 ||
          start > length ||
          (count != null && (count < 0 || count > length - start))) {
        throw const CapacityExceeded();
      }
      await handle.setPosition(start);
      var remaining = count ?? length - start;
      while (remaining > 0) {
        if (operation != null) packageCheckOperation(operation);
        final chunk = await handle.read(remaining < 65536 ? remaining : 65536);
        if (chunk.isEmpty) throw const PackageFailure('short private read');
        sink.add(chunk);
        remaining -= chunk.length;
      }
      requireRegularPath(file);
      if (!_sameStat(before, file.statSync())) {
        throw const PackageFailure('private file changed');
      }
      sink.close();
      return output.value!.toString();
    } finally {
      await handle.close();
    }
  }

  Future<void> removeOwned(File file, FileStat owned) async {
    try {
      requireRegularPath(file);
      if (_sameStat(owned, file.statSync())) await file.delete();
    } on PackageFailure {
      /* Never delete links, absent or replaced files. */
    }
  }

  Future<List<FileSystemEntity>> scan(Directory directory, int maximum) async {
    final result = <FileSystemEntity>[];
    await for (final entity in directory.list(followLinks: false)) {
      if (result.length == maximum) throw const CapacityExceeded();
      result.add(entity);
    }
    return result;
  }
}

final class _DigestSink implements Sink<crypto.Digest> {
  crypto.Digest? value;
  @override
  void add(crypto.Digest data) {
    value = data;
  }

  @override
  void close() {}
}

bool _sameStat(FileStat a, FileStat b) =>
    a.size == b.size &&
    a.modified == b.modified &&
    a.changed == b.changed &&
    a.mode == b.mode;
Problem _problem(Object error) {
  final code = switch (error) {
    RepositoryException e => e.problem.code,
    CapacityExceeded() => ProblemCode.capacityExceeded,
    OperationException e => e.code,
    FileSystemException e
        when e.osError?.errorCode == 28 || e.osError?.errorCode == 112 =>
      ProblemCode.noSpace,
    FileSystemException e
        when e.osError?.errorCode == 13 || e.osError?.errorCode == 5 =>
      ProblemCode.permissionDenied,
    PackageFailure() => ProblemCode.unsafePackage,
    _ => ProblemCode.ioFailure,
  };
  return Problem(code: code, severity: ProblemSeverity.error);
}

/// One open owner per private directory. No exported/user destination is used.
/// Generational snapshots are immutable; the previous valid generation is never
/// overwritten. A protected index backup bridges non-replacing native rename.
/// Recovery is bounded, validates real packages, and never publishes a temp.
final class FileLocalRepository implements LocalRepository {
  FileLocalRepository(
    this.directory, {
    FileStore? store,
    WorkBudgetController? budget,
    DateTime Function()? now,
    void Function(String)? onCodecPhase,
  }) : store = store ?? FileStore(),
       budget = budget ?? WorkBudget.shared() as WorkBudgetController,
       _now = now ?? DateTime.now {
    _control = AdmissionBudget.shared.reserve(2 * 1024 * 1024);
    try {
      codec = ZipProjectCodec(budget: this.budget, onPhase: onCodecPhase);
      // Recovery authenticates different destination identities. Keep its role
      // slots separate so reading cannot evict the continuously paid write set.
      _readCodec = ZipProjectCodec(budget: this.budget);
      _captures = DraftCapturePool(this.budget);
    } catch (_) {
      _control.release();
      rethrow;
    }
  }
  static const maximumDirectoryEntries = 128;
  static const maximumProjects = 16;
  static const _profileId = 'company-profile-t07';
  static final Set<String> _openRoots = {};
  final Directory directory;
  final FileStore store;
  final WorkBudgetController budget;
  final DateTime Function() _now;
  late final ZipProjectCodec codec;
  late final ZipProjectCodec _readCodec;
  late DraftCapturePool _captures;
  late final AdmissionTicket _control;
  final Map<String, _Row> _rows = {};
  Future<void> _tail = Future.value();
  final Set<Future<void>> _saveDrains = {};
  Object? _saveCleanupError;
  StackTrace? _saveCleanupTrace;
  int _queued = 0, _sequence = 0;
  bool _ready = false, _closed = false;
  RandomAccessFile? _lock;
  String? _claimedRoot;
  EditorSession? _recovery;
  CompanyProfile? _loadedProfile;
  EditorSession? _profileOwner;
  WorkCopyReservation? _profileBytes;
  File _file(String name) => File('${directory.path}/$name');
  static String _name(FileSystemEntity e) =>
      e.uri.pathSegments.where((s) => s.isNotEmpty).last;
  String _key(String id, bool profile) => profile ? 'profile' : 'draft:$id';
  Future<T> _serial<T>(Future<T> Function() action) {
    if (_closed) {
      return Future.error(
        const RepositoryException(
          Problem(
            code: ProblemCode.operationCancelled,
            severity: ProblemSeverity.error,
          ),
        ),
      );
    }
    if (_queued >= 32) {
      return Future.error(
        const RepositoryException(
          Problem(
            code: ProblemCode.capacityExceeded,
            severity: ProblemSeverity.error,
          ),
        ),
      );
    }
    final ticket = AdmissionBudget.shared.reserve(4096);
    _queued++;
    final result = _tail
        .then((_) async {
          final io = budget.reserveCopy(256 * 1024);
          try {
            return await action();
          } finally {
            io.release();
          }
        })
        .whenComplete(() {
          _queued--;
          ticket.release();
        });
    _tail = result.then<void>((_) {}, onError: (Object _, StackTrace _) {});
    return result;
  }

  // Inspect the entire existing ancestry before the first mkdir. Create one
  // absent component at a time, rechecking its parents without following links.
  // No callback/await may intervene in this private-directory creation frontier.
  void _createPrivateDirectory() {
    final missing = <Directory>[];
    var current = directory.absolute;
    if (current.path.length > WorkLimits.stagingPathUnits) {
      throw const CapacityExceeded();
    }
    while (true) {
      final type = FileSystemEntity.typeSync(current.path, followLinks: false);
      if (type == FileSystemEntityType.notFound) {
        missing.add(current);
      } else if (type != FileSystemEntityType.directory) {
        throw const PackageFailure('linked or non-directory ancestor');
      }
      final parent = current.parent;
      if (parent.path == current.path) break;
      current = parent;
    }
    for (final child in missing.reversed) {
      requireRegularPath(File(child.path), absent: true);
      child.createSync();
    }
  }

  Future<void> _initialize() async {
    if (_ready) return;
    _createPrivateDirectory();
    requireRegularPath(_file('probe'), absent: true);
    final root = await directory.resolveSymbolicLinks();
    if (root.length > WorkLimits.stagingPathUnits) {
      throw const CapacityExceeded();
    }
    if (_openRoots.contains(root)) {
      throw const PackageFailure('private directory already owned');
    }
    _openRoots.add(root);
    _claimedRoot = root;
    try {
      final lock = _file('t07.lock');
      if (!await lock.exists()) await lock.create(exclusive: true);
      requireRegularPath(lock);
      _lock = await lock.open(mode: FileMode.append);
      await _lock!.lock(FileLock.exclusive);
      final entries = await store.scan(directory, maximumDirectoryEntries);
      for (final e in entries) {
        if (_temporary.hasMatch(_name(e)) &&
            e is File &&
            FileSystemEntity.typeSync(e.path, followLinks: false) ==
                FileSystemEntityType.file) {
          await store.removeOwned(e, e.statSync());
        }
      }
      var validIndex = false;
      try {
        final parsed = await _readIndex(_file('index.json'));
        for (final row in parsed.values) {
          final file = _file(row.file);
          if (await store.hash(file, WorkLimits.projectCompressedBytes) !=
              row.hash) {
            throw const PackageFailure('indexed snapshot is corrupt');
          }
          final owner = await _readCodec.decodeEditorSession(file);
          try {
            if (owner.project.id != row.id ||
                owner.project.revision != row.revision ||
                owner.project.name != row.name) {
              throw const PackageFailure('indexed snapshot identity mismatch');
            }
          } finally {
            owner.dispose();
          }
        }
        _rows.addAll(parsed);
        validIndex = true;
      } catch (e) {
        if (e is CapacityExceeded) rethrow;
      }
      for (final e in entries) {
        final match = _snapshot.firstMatch(_name(e));
        if (match != null) {
          final seq = int.parse(match[3]!);
          if (seq > _sequence) _sequence = seq;
        }
      }
      if (!validIndex) {
        await _rebuild(entries);
        if (_rows.isNotEmpty) await _writeIndex(_rows, invokePhases: false);
      }
      _ready = true;
    } catch (_) {
      _rows.clear();
      await _lock?.close();
      _lock = null;
      _openRoots.remove(root);
      _claimedRoot = null;
      rethrow;
    }
  }

  Future<Map<String, _Row>> _readIndex(File file) async {
    final workspace = AdmissionBudget.shared.reserve(8 * 1024 * 1024);
    late final WorkCopyReservation buffers;
    try {
      buffers = budget.reserveCopy(2 * WorkLimits.manifestUtf8Bytes);
    } catch (_) {
      workspace.release();
      rethrow;
    }
    try {
      final bytes = await store.read(file, WorkLimits.manifestUtf8Bytes);
      StrictManifestJson.validate(bytes, admission: workspace);
      final data = jsonDecode(utf8.decode(bytes));
      if (data is! Map ||
          data.length != 2 ||
          data['version'] != 1 ||
          data['rows'] is! List) {
        throw const PackageFailure('invalid private index');
      }
      final list = data['rows'] as List;
      if (list.length > maximumProjects + 1) throw const CapacityExceeded();
      final result = <String, _Row>{};
      for (final raw in list) {
        final row = _Row.read(raw);
        final key = _key(row.id, row.profile);
        if (result.containsKey(key)) {
          throw const PackageFailure('duplicate private index row');
        }
        result[key] = row;
      }
      return result;
    } finally {
      buffers.release();
      workspace.release();
    }
  }

  Future<void> _writeIndex(
    Map<String, _Row> rows, {
    bool invokePhases = true,
  }) async {
    final workspace = AdmissionBudget.shared.reserve(8 * 1024 * 1024);
    late final WorkCopyReservation buffers;
    try {
      buffers = budget.reserveCopy(2 * WorkLimits.manifestUtf8Bytes);
    } catch (_) {
      workspace.release();
      rethrow;
    }
    late final WorkOperation op;
    try {
      op = WorkOperation.create();
    } catch (_) {
      buffers.release();
      workspace.release();
      rethrow;
    }
    final temp = _file('t07-tmp-${op.id}.index');
    FileStat? owned;
    final index = _file('index.json'), previous = _file('index.previous.json');
    var movedOld = false, promoted = false;
    final hook = store.onPhase;
    try {
      if (!invokePhases) store.onPhase = null;
      final bytes = Uint8List.fromList(
        utf8.encode(
          jsonEncode({
            'version': 1,
            'rows': [for (final row in rows.values) row.json()],
          }),
        ),
      );
      if (bytes.length > WorkLimits.manifestUtf8Bytes) {
        throw const CapacityExceeded();
      }
      StrictManifestJson.validate(bytes, admission: workspace);
      await store.phase(RepositoryPhase.writeIndex);
      await store.write(temp, bytes);
      owned = temp.statSync();
      await store.phase(RepositoryPhase.validateIndex);
      final actual = await store.read(temp, WorkLimits.manifestUtf8Bytes);
      if (crypto.sha256.convert(actual) != crypto.sha256.convert(bytes)) {
        throw const PackageFailure('private index mismatch');
      }
      StrictManifestJson.validate(actual, admission: workspace);
      await store.phase(RepositoryPhase.promoteIndex);
      if (await previous.exists()) {
        requireRegularPath(previous);
        await store.removeOwned(previous, previous.statSync());
      }
      if (await index.exists()) {
        await store.promote(index, previous);
        movedOld = true;
      }
      await store.promote(temp, index);
      _promotedIndexStat = index.statSync();
      promoted = true;
      await store.phase(RepositoryPhase.readback);
      final finalBytes = await store.read(index, WorkLimits.manifestUtf8Bytes);
      if (crypto.sha256.convert(finalBytes) != crypto.sha256.convert(bytes)) {
        throw const PackageFailure('private index readback mismatch');
      }
    } catch (_) {
      if (promoted && owned != null && await index.exists()) {
        // Renames can change ctime: identity is captured once at this owned
        // handoff, before any subsequent callback or await observes the target.
        await store.removeOwned(index, _promotedIndexStat!);
      }
      if (movedOld && !await index.exists() && await previous.exists()) {
        await store.promote(previous, index);
      }
      rethrow;
    } finally {
      _promotedIndexStat = null;
      try {
        if (owned != null) await store.removeOwned(temp, owned);
      } finally {
        store.onPhase = hook;
        try {
          await op.finish();
        } finally {
          buffers.release();
          workspace.release();
        }
      }
    }
  }

  FileStat? _promotedIndexStat;
  Future<void> _rebuild(List<FileSystemEntity> entries) async {
    final candidates =
        entries.where((e) => _snapshot.hasMatch(_name(e))).toList()
          ..sort((a, b) => _name(b).compareTo(_name(a)));
    for (final e in candidates) {
      final match = _snapshot.firstMatch(_name(e))!;
      final profile = match[1] == 'profile';
      if (e is! File) continue;
      EditorSession? owner;
      try {
        if (await store.hash(e, WorkLimits.projectCompressedBytes) !=
            match[5]) {
          continue;
        }
        owner = await _readCodec.decodeEditorSession(e);
        final p = owner.project;
        if (_idHash(p.id) != match[2] || (profile && p.id != _profileId)) {
          continue;
        }
        final key = _key(p.id, profile);
        if (_rows.containsKey(key)) continue;
        if (_rows.length >= maximumProjects + 1) throw const CapacityExceeded();
        _rows[key] = _Row(
          p.id,
          p.name,
          p.revision,
          int.parse(match[4]!),
          _name(e),
          match[5]!,
          e.statSync().modified.toUtc(),
          profile,
        );
      } on CapacityExceeded {
        rethrow;
      } catch (_) {
        /* A corrupt/linked package is not a recoverable generation. */
      } finally {
        owner?.dispose();
      }
    }
  }

  String _idHash(String id) =>
      crypto.sha256.convert(utf8.encode(id)).toString();
  @override
  Future<SaveReceipt> saveDraft(ProjectBundle bundle, {Operation? operation}) =>
      _save(bundle, operation, false);
  Future<SaveReceipt> _save(
    ProjectBundle bundle,
    Operation? operation,
    bool profile,
  ) async {
    final id = bundle.project.id, revision = bundle.project.revision;
    final generation = operation is WorkOperation
        ? operation.sessionGeneration ?? 0
        : 0;
    final claim = _SaveClaim(id, revision, generation);
    final settled = Completer<void>();
    settled.future.ignore();
    _saveDrains.add(settled.future);
    Operation? runningOperation;
    WorkCopyReservation? io;
    final drained = Completer<void>();
    var enrolled = false;
    DraftCapture? captured;
    try {
      final op =
          operation ??
          WorkOperation.create(
            projectId: id,
            revision: revision,
            sessionGeneration: generation,
          );
      runningOperation = op;
      if (op is! WorkOperation ||
          (op.projectId != null && op.projectId != id) ||
          (op.revision != null && op.revision != revision)) {
        throw const PackageFailure('operation scope mismatch');
      }
      packageCheckOperation(op);
      op.registerPending(drained.future);
      enrolled = true;
      if (_closed) {
        throw const OperationException(ProblemCode.operationCancelled);
      }
      captured = _captures.capture(bundle);
      io = budget.reserveCopy(256 * 1024);
      final stable = captured.bundle;
      return await _serial(() async {
        try {
          await _initialize();
          packageCheckOperation(op);
          final old = _rows[_key(id, profile)];
          if (!profile &&
              old != null &&
              (generation < old.generation ||
                  (generation == old.generation && revision < old.revision))) {
            return claim.make(SaveStatus.superseded);
          }
          if (old == null &&
              _rows.keys.where((k) => k.startsWith('draft:')).length >=
                  maximumProjects &&
              !profile) {
            throw const CapacityExceeded();
          }
          return await _commit(stable, op, profile, claim);
        } catch (e) {
          return _failed(claim, e);
        }
      });
    } catch (e) {
      return _failed(claim, e);
    } finally {
      try {
        captured?.release();
        // Codec/stream use has returned. Only the separately paid cache remains.
        captured = null;
        io?.release();
        if (enrolled) {
          drained.complete();
          await Future<void>.delayed(Duration.zero);
        }
        try {
          if (operation == null && runningOperation is WorkOperation) {
            await store.finishOwnedOperation(runningOperation);
          }
        } finally {
          claim.close();
        }
      } catch (e, s) {
        _saveCleanupError ??= e;
        _saveCleanupTrace ??= s;
        settled.completeError(e, s);
        rethrow;
      } finally {
        if (!settled.isCompleted) settled.complete();
        _saveDrains.remove(settled.future);
      }
    }
  }

  SaveReceipt _failed(_SaveClaim claim, Object e) {
    final problem = _problem(e);
    return claim.make(
      problem.code == ProblemCode.operationCancelled
          ? SaveStatus.cancelled
          : SaveStatus.failed,
      problem: problem,
    );
  }

  Future<SaveReceipt> _commit(
    ProjectBundle bundle,
    WorkOperation op,
    bool profile,
    _SaveClaim claim,
  ) async {
    final temp = _file('t07-tmp-${op.id}.snapshot');
    File? promoted;
    FileStat? ownedTemp, ownedPromoted;
    var confirmed = false;
    try {
      await store.phase(RepositoryPhase.writeSnapshot);
      packageCheckOperation(op);
      await store.encode(codec, bundle, temp, op);
      ownedTemp = temp.statSync();
      await store.sync(
        temp,
        RepositoryPhase.flushSnapshot,
        RepositoryPhase.closeSnapshot,
      );
      packageCheckOperation(op);
      await store.phase(RepositoryPhase.validateSnapshot);
      await _validateEncoded(temp, bundle, op);
      final hash = await store.hash(
        temp,
        WorkLimits.projectCompressedBytes,
        operation: op,
      );
      await store.phase(RepositoryPhase.promoteSnapshot);
      packageCheckOperation(op);
      requireRegularPath(temp);
      if (!_sameStat(ownedTemp, temp.statSync())) {
        throw const PackageFailure('staging ownership changed');
      }
      final seq = ++_sequence;
      if (seq > 9999999999999999 ||
          (op.sessionGeneration ?? 0) > 9999999999999999) {
        throw const CapacityExceeded();
      }
      final name =
          '${profile ? 'profile' : 'draft'}-${_idHash(bundle.project.id)}-${seq.toString().padLeft(16, '0')}-${(op.sessionGeneration ?? 0).toString().padLeft(16, '0')}-$hash.recruitproj';
      promoted = _file(name);
      // Commit boundary: cancellation after this check cannot hide persisted IO.
      await store.promote(temp, promoted);
      ownedPromoted = promoted.statSync();
      final row = _Row(
        bundle.project.id,
        bundle.project.name,
        bundle.project.revision,
        op.sessionGeneration ?? 0,
        name,
        hash,
        _now().toUtc(),
        profile,
      );
      final rows = {..._rows, _key(row.id, profile): row};
      // Snapshot readback precedes index commit; final readback below closes the
      // transaction even if a fault seam corrupts the promoted bytes meanwhile.
      if (await store.hash(promoted, WorkLimits.projectCompressedBytes) !=
          hash) {
        throw const PackageFailure('snapshot promotion mismatch');
      }
      await _writeIndex(rows);
      if (await store.hash(promoted, WorkLimits.projectCompressedBytes) !=
          hash) {
        await _writeIndex(_rows, invokePhases: false);
        throw const PackageFailure('snapshot readback mismatch');
      }
      _rows
        ..clear()
        ..addAll(rows);
      confirmed = true;
      await _prune(row);
      return claim.make(SaveStatus.completed, hash: hash);
    } finally {
      try {
        if (!confirmed && promoted != null && ownedPromoted != null) {
          await store.removeOwned(promoted, ownedPromoted);
        }
      } finally {
        if (ownedTemp != null) await store.removeOwned(temp, ownedTemp);
      }
    }
  }

  /// Lightweight trusted-producer validation: structural codec index plus every
  /// exact canonical manifest/resource digest/length/CRC. No raster decoder or
  /// heavy lease is reacquired for a snapshot already admitted by encode.
  Future<void> _validateEncoded(
    File file,
    ProjectBundle bundle,
    WorkOperation op,
  ) async {
    final workspace = AdmissionBudget.shared.reserve(8 * 1024 * 1024);
    late final WorkCopyReservation buffers;
    try {
      buffers = budget.reserveCopy(2 * WorkLimits.manifestUtf8Bytes);
    } catch (_) {
      workspace.release();
      rethrow;
    }
    try {
      final manifest = ImmutableProject.snapshot(bundle.project)
          .manifestBytes(workspace: workspace, budget: budget);
      final index = await PackageZipIO.readIndex(file, operation: op);
      final expected = <String, Uint8List>{'manifest.json': manifest};
      for (final ref in [bundle.project.photo, bundle.project.logo]) {
        if (ref != null) {
          expected['assets/${ref.sha256}.${ref.mediaType == MediaType.png ? 'png' : 'jpg'}'] =
              bundle.resources[ref.id]!;
        }
      }
      if (index.entries.length != expected.length) {
        throw const PackageFailure('snapshot entry mismatch');
      }
      for (final entry in expected.entries) {
        final actual = index.entries[entry.key];
        if (actual == null ||
            actual.method != 0 ||
            actual.expandedSize != entry.value.length ||
            actual.crc32 != PackageZipIO.crc(entry.value) ||
            await store.hash(
                  file,
                  WorkLimits.projectCompressedBytes,
                  start: actual.offset,
                  count: actual.expandedSize,
                  operation: op,
                ) !=
                crypto.sha256.convert(entry.value).toString()) {
          throw const PackageFailure('snapshot payload mismatch');
        }
      }
    } finally {
      buffers.release();
      workspace.release();
    }
  }

  Future<void> _prune(_Row row) async {
    // Cleanup is best effort after confirmation, never changes the receipt.
    try {
      final entries = await store.scan(directory, maximumDirectoryEntries);
      final files = entries.whereType<File>().where((e) {
        final m = _snapshot.firstMatch(_name(e));
        return m != null &&
            m[1] == (row.profile ? 'profile' : 'draft') &&
            m[2] == _idHash(row.id);
      }).toList()..sort((a, b) => _name(b).compareTo(_name(a)));
      var retainedValid = 0;
      for (final file in files) {
        requireRegularPath(file);
        final owned = file.statSync();
        final match = _snapshot.firstMatch(_name(file))!;
        final valid =
            await store.hash(file, WorkLimits.projectCompressedBytes) ==
            match[5];
        if (valid && retainedValid++ < 2) continue;
        await store.removeOwned(file, owned);
      }
    } catch (_) {
      /* Retain extra generations rather than lose a valid save. */
    }
  }

  Future<EditorSession?> _recover(String id, bool profile) async {
    await _initialize();
    final row = _rows[_key(id, profile)];
    if (row == null) return null;
    try {
      final file = _file(row.file);
      if (await store.hash(file, WorkLimits.projectCompressedBytes) !=
          row.hash) {
        throw const PackageFailure('snapshot digest mismatch');
      }
      final owner = await _readCodec.decodeEditorSession(file);
      if (owner.project.id != id ||
          owner.project.revision != row.revision ||
          owner.project.name != row.name) {
        owner.dispose();
        throw const PackageFailure('snapshot identity mismatch');
      }
      return owner;
    } on CapacityExceeded {
      rethrow;
    } catch (_) {
      final entries = await store.scan(directory, maximumDirectoryEntries);
      _rows.clear();
      await _rebuild(entries);
      await _writeIndex(_rows, invokePhases: false);
      final fallback = _rows[_key(id, profile)];
      if (fallback == null) return null;
      return _readCodec.decodeEditorSession(_file(fallback.file));
    }
  }

  /// Returned bundle remains paid by this repository until explicit release or
  /// close. Only one outstanding recovery is allowed, never silently evicted.
  @override
  Future<ProjectBundle?> recoverDraft(String projectId) => _serial(() async {
    validateId(projectId);
    if (_recovery != null) {
      throw const RepositoryException(
        Problem(
          code: ProblemCode.capacityExceeded,
          severity: ProblemSeverity.error,
        ),
      );
    }
    try {
      _recovery = await _recover(projectId, false);
      return _recovery?.bundle;
    } catch (e) {
      throw RepositoryException(_problem(e));
    }
  });
  void releaseRecoveredDraft(ProjectBundle bundle) {
    if (_recovery == null || !identical(_recovery!.bundle, bundle)) {
      throw ArgumentError('Foreign recovery');
    }
    _recovery!.dispose();
    _recovery = null;
  }

  @override
  Future<List<ProjectSummary>> listProjects() => _serial(() async {
    try {
      await _initialize();
      // The collection claim is provisional until construction and attachment
      // both complete. Summary scalar payments keep their separate permanent
      // policy; only this unpublished envelope rolls back on refusal.
      final ticket = AdmissionBudget.shared.reserve(8192);
      try {
        final result = List<ProjectSummary>.unmodifiable([
          for (final row in _rows.values)
            if (!row.profile)
              ProjectSummary(
                id: row.id,
                name: row.name,
                revision: row.revision,
                lastConfirmedSave: row.saved,
              ),
        ]);
        ticket.retain(result);
        return result;
      } catch (_) {
        ticket.release();
        rethrow;
      }
    } catch (e) {
      throw RepositoryException(_problem(e));
    }
  });
  @override
  Future<void> saveProfile(CompanyProfile profile) async {
    var p = Project.blank(id: _profileId);
    final keys = profile.colours.keys.toList()..sort();
    p = p.withLocation(AppLocale.ptPT, keys.join(','));
    final style = p.style;
    p = p.withStyle(
      ProjectStyle(
        ink: profile.colours['ink'] ?? style.ink,
        accent: profile.colours['accent'] ?? style.accent,
        paper: profile.colours['paper'] ?? style.paper,
        bodyPx: style.bodyPx,
        logoScale: style.logoScale,
      ),
    );
    for (final c in profile.contacts.entries) {
      p = p.withContact(AppLocale.ptPT, c.key, c.value);
    }
    if (profile.logo != null) p = p.withLogo(profile.logo!.ref);
    final bundle = ProjectBundle(p, {
      if (profile.logo != null) profile.logo!.ref.id: profile.logo!.bytes,
    }, budget: budget);
    final receipt = await _save(bundle, null, true);
    if (receipt.status != SaveStatus.completed) {
      throw RepositoryException(
        receipt.problem ??
            const Problem(
              code: ProblemCode.ioFailure,
              severity: ProblemSeverity.error,
            ),
      );
    }
  }

  @override
  Future<CompanyProfile?> loadProfile() => _serial(() async {
    if (_loadedProfile != null) {
      throw const RepositoryException(
        Problem(
          code: ProblemCode.capacityExceeded,
          severity: ProblemSeverity.error,
        ),
      );
    }
    EditorSession? owner;
    WorkCopyReservation? bytes;
    try {
      owner = await _recover(_profileId, true);
      if (owner == null) return null;
      final p = owner.project, edition = owner.project.edition(AppLocale.ptPT);
      final keys = edition.location.isEmpty
          ? <String>[]
          : edition.location.split(',');
      if (keys.toSet().length != keys.length ||
          keys.any((k) => !const {'ink', 'accent', 'paper'}.contains(k))) {
        throw const PackageFailure('invalid profile metadata');
      }
      ResourceEntry? logo;
      if (p.logo != null) {
        bytes = budget.reserveCopy(owner.bundle.resources[p.logo!.id]!.length);
        logo = ResourceEntry(
          ref: p.logo!,
          bytes: owner.bundle.resources[p.logo!.id]!,
          budget: budget,
        );
      }
      final result = CompanyProfile(
        logo: logo,
        colours: {
          for (final key in keys)
            key: switch (key) {
              'ink' => p.style.ink,
              'accent' => p.style.accent,
              _ => p.style.paper,
            },
        },
        contacts: edition.contacts,
      );
      _profileOwner = owner;
      _profileBytes = bytes;
      _loadedProfile = result;
      return result;
    } catch (e) {
      owner?.dispose();
      bytes?.release();
      throw RepositoryException(_problem(e));
    }
  });
  void releaseLoadedProfile(CompanyProfile profile) {
    if (!identical(profile, _loadedProfile)) {
      throw ArgumentError('Foreign profile');
    }
    _loadedProfile = null;
    _profileOwner?.dispose();
    _profileOwner = null;
    _profileBytes?.release();
    _profileBytes = null;
  }

  /// Optional concrete library capability; legacy LocalRepository implementers
  /// acquire no new required member. Only authenticated private generations of
  /// this ID are eligible. The continuously held repository lock serializes IO.
  Future<void> removeOwnedProject(String projectId) => _serial(() async {
    validateId(projectId);
    if (projectId == _profileId) throw ArgumentError('Not a library project');
    await _initialize();
    if (_recovery != null) throw StateError('Release recovery before removal');
    if (!_rows.containsKey(_key(projectId, false))) {
      throw StateError('Project unavailable');
    }
    final workspace = AdmissionBudget.shared.reserve(64 * 1024);
    try {
      final eligible = <(File, FileStat)>[];
      final entries = await store.scan(directory, maximumDirectoryEntries);
      for (final entry in entries) {
        final match = _snapshot.firstMatch(_name(entry));
        if (match == null ||
            match[1] != 'draft' ||
            match[2] != _idHash(projectId)) {
          continue;
        }
        if (entry is! File) throw const PackageFailure('Nonregular generation');
        requireRegularPath(entry);
        final identity = entry.statSync();
        if (await store.hash(entry, WorkLimits.projectCompressedBytes) !=
            match[5]) {
          throw const PackageFailure('Unauthenticated removal generation');
        }
        final owner = await _readCodec.decodeEditorSession(entry);
        try {
          if (owner.project.id != projectId ||
              !_sameStat(identity, entry.statSync())) {
            throw const PackageFailure('Removal identity changed');
          }
          eligible.add((entry, identity));
        } finally {
          owner.dispose();
        }
      }
      final next = {..._rows}..remove(_key(projectId, false));
      await _writeIndex(next);
      _rows
        ..clear()
        ..addAll(next);
      // Old index may contain the removed row; retire only its exact regular
      // backup identity, never external destinations or arbitrary input paths.
      final previous = _file('index.previous.json');
      if (await previous.exists()) {
        requireRegularPath(previous);
        final stat = previous.statSync();
        await _readIndex(previous);
        await store.removeOwned(previous, stat);
        if (await previous.exists()) {
          throw const PackageFailure('Removal backup residual');
        }
      }
      for (final (file, identity) in eligible) {
        await store.removeOwned(file, identity);
        if (await file.exists()) {
          throw const PackageFailure('Removal generation residual');
        }
      }
      // Evict only the idle write-cache after the serial save tails have settled.
      await _captures.close();
      _captures = DraftCapturePool(budget);
    } catch (e) {
      throw RepositoryException(_problem(e));
    } finally {
      workspace.release();
    }
  });

  Future<void>? _closing;

  Future<void> close() {
    if (_closing != null) return _closing!;
    // Completion/control metadata is covered by the constructor's existing
    // control envelope. Publish before any finalizer or adapter can reenter.
    final completion = Completer<void>();
    _closing = completion.future;
    _closed = true;
    unawaited(
      _close().then(completion.complete, onError: completion.completeError),
    );
    return completion.future;
  }

  Future<void> _close() async {
    await _tail;
    Object? error;
    StackTrace? trace;
    Future<void> attempt(FutureOr<void> Function() finalize) async {
      try {
        await finalize();
      } catch (e, s) {
        error ??= e;
        trace ??= s;
      }
    }

    // Serial IO returns before _save retires its outer pending marker and
    // owned operation. Join those real finalization tails as well.
    while (_saveDrains.isNotEmpty) {
      await attempt(() => _saveDrains.first);
    }
    error ??= _saveCleanupError;
    trace ??= _saveCleanupTrace;
    await attempt(_captures.close);
    await attempt(() => _recovery?.dispose());
    _recovery = null;
    await attempt(() {
      if (_loadedProfile != null) releaseLoadedProfile(_loadedProfile!);
    });
    final handle = _lock;
    if (handle != null) {
      await attempt(() => store.unlock(handle));
      await attempt(() => store.closeLock(handle));
    }
    _lock = null;
    if (_claimedRoot != null) _openRoots.remove(_claimedRoot);
    _claimedRoot = null;
    _rows.clear();
    _control.release();
    if (error != null) Error.throwWithStackTrace(error!, trace!);
  }
}

final class _Row {
  _Row(
    this.id,
    this.name,
    this.revision,
    this.generation,
    this.file,
    this.hash,
    this.saved,
    this.profile,
  );
  final String id, name, file, hash;
  final int revision, generation;
  final DateTime saved;
  final bool profile;
  Map<String, Object?> json() => {
    'id': id,
    'name': name,
    'revision': revision,
    'generation': generation,
    'file': file,
    'hash': hash,
    'saved': saved.toIso8601String(),
    'profile': profile,
  };
  factory _Row.read(Object? raw) {
    if (raw is! Map ||
        raw.length != 8 ||
        raw['id'] is! String ||
        raw['name'] is! String ||
        raw['revision'] is! int ||
        raw['generation'] is! int ||
        raw['file'] is! String ||
        raw['hash'] is! String ||
        raw['saved'] is! String ||
        raw['profile'] is! bool) {
      throw const PackageFailure('invalid index row');
    }
    final row = _Row(
      raw['id'] as String,
      raw['name'] as String,
      raw['revision'] as int,
      raw['generation'] as int,
      raw['file'] as String,
      raw['hash'] as String,
      DateTime.parse(raw['saved'] as String),
      raw['profile'] as bool,
    );
    validateId(row.id);
    validateText(row.name);
    final m = _snapshot.firstMatch(row.file);
    if (row.revision < 0 ||
        row.generation < 0 ||
        m == null ||
        m[5] != row.hash ||
        m[2] != crypto.sha256.convert(utf8.encode(row.id)).toString() ||
        int.parse(m[4]!) != row.generation ||
        m[1] != (row.profile ? 'profile' : 'draft')) {
      throw const PackageFailure('invalid index identity');
    }
    return row;
  }
}
