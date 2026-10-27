import 'dart:async';
import 'dart:io';

import '../../shared/admission_budget.dart';
import '../../shared/problem.dart';
import '../../shared/operation.dart';
import '../../shared/work_budget.dart';
import 'private_file_io.dart';
import 'package_zip_io.dart';
import '../../shared/work_limits.dart';

/// Finite, explicitly paid custody for actual unclosed descriptors. No GC refund
/// and no detached, unobserved close. Failed records remain strongly reachable.
final class PrivateEffectCustody {
  PrivateEffectCustody(this.io) : _credit = _admit() {
    _live.add(this);
  }
  static final Set<PrivateEffectCustody> _live = {};
  static AdmissionTicket _admit() {
    if (_live.length >= 32) throw const CapacityExceeded();
    return AdmissionBudget.shared.reserve(64 * 1024);
  }

  static int get retainedCount => _live.length;

  /// Retry only transferred residuals. True never certifies active invocation
  /// retirement; a live producer still has its independent owner/barrier.
  static Future<bool> reap() async {
    var retired = true;
    for (final record in _live.where((record) => record._residual).toList()) {
      if (!await record.retire()) retired = false;
    }
    return retired;
  }

  final PrivateFileIo io;
  final AdmissionTicket _credit;
  RandomAccessFile? handle;
  WorkCopyReservation? temporaryPayment;
  Directory? _directory;
  File? _file;
  FileStat? _fileIdentity;
  FileStat? _directoryIdentity;
  Object? _firstCause;
  Future<File> createStage(Directory root, String prefix, String name) async {
    if (_directory != null ||
        _retired ||
        root.path.length + 128 > WorkLimits.stagingPathUnits) {
      throw const CapacityExceeded();
    }
    requireRegularPath(File('${root.path}/probe'), absent: true);
    _directory = await root.createTemp(prefix);
    _directoryIdentity = _directory!.statSync();
    _file = File('${_directory!.path}/$name');
    requireRegularPath(_file!, absent: true);
    return _file!;
  }

  bool _trackedCreation = false;
  void trackCreatedFile() {
    requireRegularPath(_file!);
    _directoryIdentity = _directory!.statSync();
    _fileIdentity = _file!.statSync();
    _trackedCreation = true;
  }

  void sealProducedFile() {
    final file = _file!;
    requireRegularPath(file);
    if (_trackedCreation &&
        !_same(_directory!.statSync(), _directoryIdentity!)) {
      throw const OperationException(ProblemCode.ioFailure);
    }
    _fileIdentity = file.statSync();
    _directoryIdentity = _directory!.statSync();
  }

  bool _same(FileStat now, FileStat owned) =>
      now.type == owned.type &&
      now.size == owned.size &&
      now.modified == owned.modified &&
      now.changed == owned.changed &&
      now.mode == owned.mode;
  Problem? get problem => _firstCause == null
      ? null
      : const Problem(
          code: ProblemCode.ioFailure,
          severity: ProblemSeverity.error,
        );
  Future<bool>? _retiring;
  bool _retired = false, _residual = false;
  Future<void> closeHandle() async {
    final owned = handle;
    if (owned == null) return;
    try {
      await io.close(owned);
      handle = null;
    } catch (error) {
      _firstCause ??= error;
      rethrow;
    }
  }

  Future<bool> retire() {
    if (_retiring != null) return _retiring!;
    final done = Completer<bool>();
    _retiring = done.future;
    _drain().then(
      (value) {
        _residual = !value;
        _retiring = null;
        done.complete(value);
      },
      onError: (Object error, StackTrace _) {
        _firstCause ??= error;
        _residual = true;
        _retiring = null;
        done.complete(false);
      },
    );
    return done.future;
  }

  Future<bool> _drain() async {
    if (_retired) return true;
    try {
      await closeHandle();
    } catch (_) {
      /* paid residual */
    }
    if (handle == null) {
      temporaryPayment?.release();
      temporaryPayment = null;
    }
    final file = _file, directory = _directory;
    if (file != null) {
      try {
        if (FileSystemEntity.typeSync(file.path, followLinks: false) ==
            FileSystemEntityType.notFound) {
          _file = null;
        } else {
          requireRegularPath(file);
          if (_fileIdentity == null ||
              !_same(file.statSync(), _fileIdentity!)) {
            throw const OperationException(ProblemCode.ioFailure);
          }
          if (directory == null ||
              _directoryIdentity == null ||
              !_same(directory.statSync(), _directoryIdentity!)) {
            throw const OperationException(ProblemCode.ioFailure);
          }
          await io.deleteFile(file);
          _file = null;
          _directoryIdentity = directory
              .statSync(); // our own successful unlink
        }
      } catch (error) {
        _firstCause ??= error;
      }
    }
    if (directory != null) {
      try {
        requireRegularPath(File('${directory.path}/probe'), absent: true);
        if (_directoryIdentity == null ||
            !_same(directory.statSync(), _directoryIdentity!)) {
          throw const OperationException(ProblemCode.ioFailure);
        }
        // NEVER recursive: foreign additions make this fail and stay paid.
        await io.deleteDirectory(directory);
        _directory = null;
      } catch (error) {
        _firstCause ??= error;
      }
    }
    if (handle != null || _file != null || _directory != null) return false;
    _retired = true;
    _live.remove(this);
    _credit.release();
    return true;
  }
}
