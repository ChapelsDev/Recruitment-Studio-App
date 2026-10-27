part of 'document_gateway.dart';

/// Trusted platform frontiers. Injection is for deterministic host tests, not
/// permission to construct document capabilities or claim native verification.
abstract interface class WindowsDocumentPicker {
  Future<String?> open(Set<String> acceptedMimeTypes);
  Future<String?> save(String suggestedName, String mimeType);
}

final class FileSelectorDocumentPicker implements WindowsDocumentPicker {
  const FileSelectorDocumentPicker();
  static List<String> _extensions(Iterable<String> mimes) {
    final out = <String>{};
    for (final mime in mimes) {
      switch (mime) {
        case 'image/png':
          out.add('png');
        case 'image/jpeg':
          out.addAll(['jpg', 'jpeg']);
        case 'application/zip':
          out.add('zip');
        case 'application/x-recruitproj':
        case 'application/octet-stream':
          out.add('recruitproj');
        default:
          throw _failure(
            ProblemCode.invalidSelection,
            'Escolher formato suportado',
          );
      }
    }
    return out.toList();
  }

  @override
  Future<String?> open(Set<String> acceptedMimeTypes) async {
    if (!Platform.isWindows) {
      throw _failure(ProblemCode.invalidSelection, 'Usar Windows');
    }
    final selected = await selector.openFile(
      acceptedTypeGroups: [
        selector.XTypeGroup(
          label: 'Documento',
          extensions: _extensions(acceptedMimeTypes),
        ),
      ],
    );
    return selected?.path;
  }

  @override
  Future<String?> save(String suggestedName, String mimeType) async {
    if (!Platform.isWindows) {
      throw _failure(ProblemCode.invalidSelection, 'Usar Windows');
    }
    return (await selector.getSaveLocation(
      suggestedName: suggestedName,
      acceptedTypeGroups: [
        selector.XTypeGroup(
          label: 'Documento',
          extensions: _extensions([mimeType]),
        ),
      ],
    ))?.path;
  }
}

abstract interface class WindowsDocumentRead {
  Future<Uint8List> read(int maximum);
  Future<void> close();
}

abstract interface class WindowsDocumentIo {
  Future<bool> exists(String path);
  Future<String> createTemporary(String destination);
  Future<void> append(String id, Uint8List bytes);
  Future<void> closeOutput(String id);
  Future<String> temporaryPath(String id);

  /// Must be atomic no-replace, bound to the owned temp's native file identity.
  /// A lexical exists() check followed by File.rename is NOT an implementation.
  Future<void> publishNew(String id, String destination);
  Future<WindowsDocumentRead> openRead(String path);
  Future<void> discardTemporary(String id);
  Future<void> forget(String id);
}

final class WindowsDocumentGateway extends _Gateway {
  WindowsDocumentGateway({
    WindowsDocumentPicker? picker,
    WindowsDocumentIo? io,
    super.stagingDirectory,
    super.budget,
  }) : _picker = picker ?? const FileSelectorDocumentPicker(),
       _io = io ?? _Win32DocumentIo();
  final WindowsDocumentPicker _picker;
  final WindowsDocumentIo _io;
  final Map<String, String> _paths = {};
  final Map<String, String> _temporaries = {};
  String _path(_Entry e) => _paths[e.ref.id] ?? (throw _failure());
  void _pathLimit(String path) {
    if (path.isEmpty ||
        path.length > WorkLimits.stagingPathUnits ||
        path.contains('\u0000')) {
      throw const CapacityExceeded();
    }
  }

  String _basename(String path) => path.split(RegExp(r'[/\\]')).last;
  @override
  Future<DocumentRef?> pickOpen(
    Set<String> acceptedMimeTypes, {
    Operation? operation,
  }) async {
    if (acceptedMimeTypes.isEmpty || acceptedMimeTypes.length > 8) {
      throw _failure(ProblemCode.invalidSelection);
    }
    for (final mime in acceptedMimeTypes) {
      _mime(mime);
    }
    final own = operation == null;
    final op = _work(operation ?? Operation.create());
    try {
      final result = await _run(op, () async {
        final path = await _picker.open(acceptedMimeTypes);
        if (path == null) return null;
        _pathLimit(path);
        op.throwIfCancelled();
        final e = _issue(op, own, _token(), _basename(path));
        _paths[e.ref.id] = path;
        return e.ref;
      });
      if (result == null && own) await op.finish();
      return result;
    } catch (_) {
      if (own) await op.finish();
      rethrow;
    }
  }

  @override
  Future<PreparedDestination?> prepareSave(
    List<String> suggestedNames,
    String mimeType, {
    Operation? operation,
    DocumentRef? replace,
    bool overwriteApproved = false,
  }) async {
    _newOnly(suggestedNames, mimeType, replace);
    final own = operation == null;
    final op = _work(operation ?? Operation.create());
    try {
      final result = await _run(op, () async {
        final path = await _picker.save(suggestedNames.single, mimeType);
        if (path == null) return null;
        _pathLimit(path);
        op.throwIfCancelled();
        if (await _io.exists(path)) {
          throw _failure(ProblemCode.invalidSelection, 'Guardar uma cópia');
        }
        final e = _issue(
          op,
          own,
          _token(),
          _basename(path),
          approvedName: suggestedNames.single,
        );
        _paths[e.ref.id] = path;
        return e.destination;
      });
      if (result == null && own) await op.finish();
      return result;
    } catch (_) {
      if (own) await op.finish();
      rethrow;
    }
  }

  @override
  Future<void> _releaseAdapter() async {
    final io = _io;
    if (io is _Win32DocumentIo) await io.closeAll();
  }

  @override
  Future<void> _releaseNative(_Entry e) async {
    final io = _io;
    final path = _paths[e.ref.id];
    if (io is _Win32DocumentIo && path != null) await io.releaseReads(path);
    final temp = _temporaries[e.ref.id];
    if (temp != null) await _io.discardTemporary(temp);
    _temporaries.remove(e.ref.id);
    _paths.remove(e.ref.id);
  }

  @override
  Future<void> abortPrepared(
    PreparedDestination destination, {
    Operation? operation,
  }) async {
    final e = _lookup(destination.opaqueId, destination, operation);
    await _run(
      e.operation,
      () async {
        try {
          await _releaseNative(e);
          _forget(e);
        } catch (_) {
          _settleFailedDrain(e);
          rethrow;
        }
      },
      allowCancelled: true,
      finishImplicit: e.implicit,
    );
  }

  Future<_Digest> _readPath(
    String path,
    int maximum, {
    _DocumentStage? output,
    WorkOperation? op,
  }) async {
    final input = await _io.openRead(path);
    final digest = _DigestSink();
    final hash = sha256.startChunkedConversion(digest);
    var count = 0;
    try {
      while (true) {
        op?.throwIfCancelled();
        final requested = _chunkBytes.clamp(1, maximum - count + 1);
        final bytes = await input.read(requested);
        if (bytes.length > requested) throw _failure();
        if (bytes.isEmpty) break;
        count += bytes.length;
        if (count > maximum) throw const CapacityExceeded();
        hash.add(bytes);
        await output?.write(bytes);
      }
    } finally {
      hash.close();
      await input.close();
    }
    return _Digest(count, digest.value.toString());
  }

  @override
  Future<File> stageRead(
    DocumentRef ref,
    int maximumBytes, {
    Operation? operation,
  }) async {
    _limit(maximumBytes);
    final e = _lookup(ref.id, ref, operation);
    return _stageOwned(e, (file) async {
      await _readPath(_path(e), maximumBytes, output: file, op: e.operation);
    });
  }

  @override
  Future<WriteReceipt> writePrepared(
    File source,
    PreparedDestination destination,
    String selectedName, {
    Operation? operation,
  }) async {
    _Entry? admittedEntry;
    try {
      final e = _lookup(destination.opaqueId, destination, operation);
      return await _run(
        e.operation,
        () async {
          admittedEntry = e;
          try {
            AdmissionBudget.shared.reserve(8192);
          } catch (error) {
            try {
              await _releaseNative(e);
              _forget(e);
            } catch (_) {
              e.residualKnown = true;
              _settleFailedDrain(e);
            }
            rethrow;
          }
          return _writeOwned(source, destination, selectedName, e);
        },
        allowCancelled: true,
        finishImplicit: e.implicit,
      );
    } catch (error) {
      return _receipt(
        WriteStatus.failed,
        destination.operationId,
        target: admittedEntry?.ref,
        problem: _problem(error),
        residual: admittedEntry?.residualKnown ?? false,
      );
    }
  }

  Future<WriteReceipt> _writeOwned(
    File source,
    PreparedDestination destination,
    String selectedName,
    _Entry e,
  ) async {
    String? temp;
    var published = false;
    var commitAttempted = false;
    try {
      if (!destination.approvedNames.contains(selectedName)) {
        throw _failure(ProblemCode.invalidSelection);
      }
      return await (() async {
        final path = _path(e);
        final expected = await _hashFile(
          source,
          _maximumDocumentBytes,
          operation: e.operation,
        );
        if (await _io.exists(path)) {
          throw _failure(ProblemCode.invalidSelection, 'Guardar uma cópia');
        }
        temp = await _io.createTemporary(path);
        _temporaries[e.ref.id] = temp!;
        final input = await source.open();
        final buffer = Uint8List(_chunkBytes);
        var count = 0;
        try {
          while (true) {
            e.operation.throwIfCancelled();
            final n = await input.readInto(buffer);
            if (n == 0) break;
            count += n;
            if (count > expected.bytes) throw _failure();
            await _io.append(temp!, Uint8List.sublistView(buffer, 0, n));
          }
        } finally {
          await input.close();
        }
        await _io.closeOutput(temp!);
        final staged = await _readPath(
          await _io.temporaryPath(temp!),
          expected.bytes,
          op: e.operation,
        );
        if (!staged.matches(expected)) throw _failure();
        _work(e.operation); // last cancellable point before no-replace commit
        commitAttempted = true;
        await _io.publishNew(temp!, path);
        published = true;
        // Once promotion starts, finish actual reconciliation even if cancelled.
        final actual = await _readPath(path, expected.bytes);
        if (!actual.matches(expected)) throw _failure();
        await _io.forget(temp!);
        _temporaries.remove(e.ref.id);
        _paths.remove(e.ref.id);
        _forget(e);
        return _receipt(
          WriteStatus.completed,
          e.operation.id,
          target: e.ref,
          digest: actual,
        );
      })();
    } catch (error) {
      final p = _problem(error);
      return _receipt(
        p.code == ProblemCode.operationCancelled && !published
            ? WriteStatus.cancelled
            : WriteStatus.failed,
        e.operation.id,
        target: commitAttempted ? e.ref : null,
        problem: p,
        residual:
            commitAttempted ||
            (error is DocumentGatewayException && error.residualPlaceholder),
      );
    } finally {
      try {
        if (temp != null) {
          // Native backend independently knows whether promotion took effect.
          if (published) {
            await _io.forget(temp!);
          } else {
            await _io.discardTemporary(temp!);
          }
        }
        _temporaries.remove(e.ref.id);
        _paths.remove(e.ref.id);
        if (!e.consumed) _forget(e);
      } catch (error) {
        // Retain paid entry/maps until close can retry exact cleanup.
        e.residualKnown = true;
        _settleFailedDrain(e);
        return _receipt(
          WriteStatus.failed,
          e.operation.id,
          target: commitAttempted ? e.ref : null,
          problem: _problem(error),
          residual: true,
        );
      }
    }
  }
}
