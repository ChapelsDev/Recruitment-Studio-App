part of 'document_gateway.dart';

/// Windows x64 native backend, not Dart File.rename/exists-based replacement.
/// All blocking Win32 I/O executes in short-lived Isolate.run jobs. Handles are
/// process handles and are passed as integers, never serialized FFI objects.
final class _Win32DocumentIo implements WindowsDocumentIo {
  final Map<String, _WinTarget> _targets = {};
  _WinRead? _reader;
  _WinTarget _target(String id) => _targets[id] ?? (throw _failure());
  @override
  Future<bool> exists(String path) => Isolate.run(() => _WinApi().exists(path));
  @override
  Future<String> createTemporary(String destination) async {
    if (_targets.length >= _maximumHandles) throw const CapacityExceeded();
    final id = _token();
    final path =
        '${File(destination).parent.path}${Platform.pathSeparator}.recruit-${_token()}.tmp';
    final credit = AdmissionBudget.shared.reserve(32768);
    try {
      final created = await Isolate.run(() {
        final api = _WinApi();
        final pins = api.pinParents(destination);
        int? handle;
        var createdEffect = false;
        String identity = '';
        Object? failure;
        try {
          handle = api.openRelative(pins.last.$1, api.leaf(path), create: true);
          createdEffect = true;
          identity = api.identity(handle);
        } on _WinOpenFailure catch (e) {
          handle = e.handle;
          createdEffect = e.created;
          failure = e.error;
        } catch (e) {
          failure = e;
        }
        return (handle, identity, pins, failure, createdEffect);
      });
      final target = _WinTarget(
        path,
        created.$1,
        created.$2,
        credit,
        created.$3,
      );
      target.uncreated = !created.$5;
      _targets[id] = target;
      if (created.$4 != null) {
        try {
          await discardTemporary(id);
        } catch (_) {
          throw DocumentGatewayException(
            _problem(created.$4!),
            residualPlaceholder: true,
          );
        }
        throw created.$4!;
      }
      return id;
    } catch (error) {
      if (error is _WinPinFailure) {
        _targets[id] = _WinTarget(path, null, '', credit, error.pins)
          ..uncreated = true;
        throw _failure(
          ProblemCode.ioFailure,
          'Verificar ficheiro residual',
          true,
        );
      }
      if (!_targets.containsKey(id)) credit.release();
      rethrow;
    }
  }

  @override
  Future<void> append(String id, Uint8List bytes) async {
    if (bytes.length > _chunkBytes) throw const CapacityExceeded();
    final h = _target(id).handle;
    if (h == null) throw _failure();
    await Isolate.run(() => _WinApi().write(h, bytes));
  }

  @override
  Future<void> closeOutput(String id) async {
    final t = _target(id);
    final h = t.handle;
    if (h == null) throw _failure();
    final result = await Isolate.run(() {
      final api = _WinApi();
      Object? failure;
      var closed = false;
      try {
        api.flush(h);
      } catch (e) {
        failure = e;
      }
      try {
        api.close(h);
        closed = true;
      } catch (e) {
        failure ??= e;
      }
      return (closed, failure);
    });
    if (result.$1) t.handle = null;
    if (result.$2 != null) throw result.$2!;
  }

  @override
  Future<String> temporaryPath(String id) async => _target(id).path;
  @override
  Future<void> publishNew(String id, String destination) async {
    final t = _target(id);
    if (t.handle != null) throw _failure();
    final path = t.path, identity = t.identity;
    final pins = t.pins;
    final result = await Isolate.run(() {
      final api = _WinApi();
      api.validatePins(pins);
      int h;
      try {
        h = api.openRelative(pins.last.$1, api.leaf(path), rename: true);
      } on _WinOpenFailure catch (e) {
        return (false, false, e.handle, e.error);
      }
      var promoted = false, closed = false;
      Object? failure;
      try {
        if (api.identity(h) != identity) throw _failure();
        api.validatePins(pins);
        api.renameNoReplace(h, destination, pins.last.$1);
        promoted = true;
      } catch (e) {
        failure = e;
      }
      try {
        api.close(h);
        closed = true;
      } catch (e) {
        failure ??= e;
      }
      return (promoted, closed, h, failure);
    });
    if (result.$1) {
      t.published = true;
      t.destination = destination;
    }
    if (!result.$2) t.handle = result.$3;
    if (result.$4 != null) throw result.$4!;
    // Gateway's mandatory final read uses openRead below, which binds this
    // destination to the recorded promoted identity AND retains its read handle
    // through verified close. Do not create an untracked extra reopen tail.
  }

  @override
  Future<WindowsDocumentRead> openRead(String path) async {
    if (_reader != null) throw const CapacityExceeded();
    final ticket = AdmissionBudget.shared.reserve(32768);
    try {
      String? expected;
      List<(int, String)>? pins;
      for (final target in _targets.values) {
        if (target.path == path || target.destination == path) {
          expected = target.identity;
          pins = target.pins;
        }
      }
      final inheritedPins = pins;
      final opened = await Isolate.run(() {
        final api = _WinApi();
        List<(int, String)> ownPins = [];
        int? handle;
        Object? error;
        try {
          final binding = inheritedPins ?? (ownPins = api.pinParents(path));
          api.validatePins(binding);
          handle = api.openRelative(binding.last.$1, api.leaf(path));
          final actual = api.identity(handle);
          if (expected != null && actual != expected) throw _failure();
        } on _WinOpenFailure catch (e) {
          handle = e.handle;
          error = e.error;
        } on _WinPinFailure catch (e) {
          ownPins = e.pins;
          error = e.error;
        } catch (e) {
          error = e;
        }
        return (handle, ownPins, error);
      });
      late final _WinRead reader;
      reader = _WinRead(opened.$1, path, ticket, opened.$2, () {
        if (identical(_reader, reader)) _reader = null;
      });
      _reader = reader;
      if (opened.$3 != null) {
        try {
          await reader.close();
        } catch (_) {
          throw _failure(
            ProblemCode.ioFailure,
            'Verificar ficheiro residual',
            true,
          );
        }
        throw opened.$3!;
      }
      return reader;
    } catch (_) {
      if (_reader == null) ticket.release();
      rethrow;
    }
  }

  Future<void> releaseReads(String path) async {
    final reader = _reader;
    if (reader?.path == path) await reader!.close();
  }

  @override
  Future<void> discardTemporary(String id) async {
    final t = _targets[id];
    if (t == null) return;
    await releaseReads(t.path);
    if (t.destination != null) await releaseReads(t.destination!);
    if (t.deleted || t.uncreated) {
      await forget(id);
      return;
    }
    if (t.published) {
      final h = t.handle;
      if (h != null) {
        await Isolate.run(() => _WinApi().close(h));
        t.handle = null;
      }
      await forget(id);
      return;
    }
    final path = t.path, identity = t.identity, pins = t.pins;
    final retained = t.handle;
    final deleteRequested = t.deleteRequested;
    // A closed create handle does not prove absence. Without a captured identity
    // there is no safe name-based recovery: retain this paid target as residual.
    if (retained == null && identity.isEmpty) {
      throw _failure(
        ProblemCode.ioFailure,
        'Verificar ficheiro residual',
        true,
      );
    }
    final result = await Isolate.run(() {
      final api = _WinApi();
      if (retained == null) {
        api.validatePins(pins);
      }
      int h;
      try {
        h =
            retained ??
            api.openRelative(pins.last.$1, api.leaf(path), rename: true);
      } on _WinOpenFailure catch (e) {
        return (false, false, e.handle, e.error);
      }
      var closed = false, deleted = false;
      Object? failure;
      try {
        if (!deleteRequested) {
          if (identity.isNotEmpty && api.identity(h) != identity) {
            throw _failure();
          }
          api.deleteHandle(h);
        }
        deleted = true;
      } catch (e) {
        failure = e;
      }
      try {
        api.close(h);
        closed = true;
      } catch (e) {
        failure ??= e;
      }
      return (closed, deleted, h, failure);
    });
    t.handle = result.$1 ? null : result.$3;
    t.deleteRequested = t.deleteRequested || result.$2;
    if (result.$4 != null) throw result.$4!;
    t.deleted = true;
    await _closePins(t);
    _targets.remove(id);
    t.ticket.release();
  }

  Future<void> closeAll() async {
    Object? error;
    try {
      await _reader?.close();
    } catch (e) {
      error = e;
    }
    for (final id in _targets.keys.toList()) {
      try {
        await discardTemporary(id);
      } catch (e) {
        error ??= e;
      }
    }
    if (error != null) throw error;
  }

  Future<void> _closePins(_WinTarget t) async {
    Object? failure;
    for (var i = t.pins.length - 1; i >= 0; i--) {
      final h = t.pins[i].$1;
      try {
        await Isolate.run(() => _WinApi().close(h));
        t.pins.removeAt(i);
      } catch (e) {
        failure ??= e;
      }
    }
    if (failure != null) throw failure;
  }

  @override
  Future<void> forget(String id) async {
    final target = _targets[id];
    if (target?.handle != null) throw _failure();
    if (target != null &&
        !target.uncreated &&
        !target.deleted &&
        !target.published) {
      throw _failure(
        ProblemCode.ioFailure,
        'Verificar ficheiro residual',
        true,
      );
    }
    if (target != null) await _closePins(target);
    _targets.remove(id)?.ticket.release();
  }
}

final class _WinOpenFailure implements Exception {
  _WinOpenFailure(this.handle, this.error, {this.created = false});
  final int handle;
  final Object error;
  final bool created;
  @override
  String toString() => 'Native argument cleanup failed';
}

final class _WinPinFailure implements Exception {
  _WinPinFailure(this.pins, this.error);
  final List<(int, String)> pins;
  final Object error;
}

final class _WinTarget {
  _WinTarget(this.path, this.handle, this.identity, this.ticket, this.pins);
  final List<(int, String)> pins;
  final String path, identity;
  final AdmissionTicket ticket;
  int? handle;
  String? destination;
  bool published = false,
      deleted = false,
      uncreated = false,
      deleteRequested = false;
}

final class _WinRead implements WindowsDocumentRead {
  _WinRead(this._handle, this.path, this.ticket, this.pins, this.onClosed);
  final List<(int, String)> pins;
  final String path;
  final AdmissionTicket ticket;
  final void Function() onClosed;
  int? _handle;
  @override
  Future<Uint8List> read(int maximum) async {
    if (maximum < 1 || maximum > _chunkBytes) throw const CapacityExceeded();
    final h = _handle;
    if (h == null) throw _failure();
    return Isolate.run(() => _WinApi().read(h, maximum));
  }

  @override
  Future<void> close() async {
    final h = _handle;
    Object? error;
    if (h != null) {
      try {
        await Isolate.run(() => _WinApi().close(h));
        _handle = null;
      } catch (e) {
        error = e;
      }
    }
    for (var i = pins.length - 1; i >= 0; i--) {
      final h = pins[i].$1;
      try {
        await Isolate.run(() => _WinApi().close(h));
        pins.removeAt(i);
      } catch (e) {
        error ??= e;
      }
    }
    if (error != null) throw error;
    ticket.release();
    onClosed();
  }
}

// Stable Win32 x64 ABI. No additional pub dependency or guessed POSIX mode.
final class _WinApi {
  _WinApi() {
    if (!Platform.isWindows || ffi.sizeOf<ffi.IntPtr>() != 8) {
      throw _failure(ProblemCode.invalidSelection, 'Usar Windows x64');
    }
    _dll = ffi.DynamicLibrary.open('kernel32.dll');
    // Resolve and warm the FFI error getter before any fallible Win32 call.
    _lastError();
  }
  late final ffi.DynamicLibrary _dll;
  late final _alloc = _dll
      .lookupFunction<
        ffi.Pointer<ffi.Void> Function(ffi.Uint32, ffi.IntPtr),
        ffi.Pointer<ffi.Void> Function(int, int)
      >('LocalAlloc');
  late final _free = _dll
      .lookupFunction<
        ffi.Pointer<ffi.Void> Function(ffi.Pointer<ffi.Void>),
        ffi.Pointer<ffi.Void> Function(ffi.Pointer<ffi.Void>)
      >('LocalFree');
  late final _create = _dll
      .lookupFunction<
        ffi.IntPtr Function(
          ffi.Pointer<ffi.Uint16>,
          ffi.Uint32,
          ffi.Uint32,
          ffi.Pointer<ffi.Void>,
          ffi.Uint32,
          ffi.Uint32,
          ffi.IntPtr,
        ),
        int Function(
          ffi.Pointer<ffi.Uint16>,
          int,
          int,
          ffi.Pointer<ffi.Void>,
          int,
          int,
          int,
        )
      >('CreateFileW');
  late final _close = _dll
      .lookupFunction<ffi.Int32 Function(ffi.IntPtr), int Function(int)>(
        'CloseHandle',
      );
  late final _flush = _dll
      .lookupFunction<ffi.Int32 Function(ffi.IntPtr), int Function(int)>(
        'FlushFileBuffers',
      );
  late final _read = _dll
      .lookupFunction<
        ffi.Int32 Function(
          ffi.IntPtr,
          ffi.Pointer<ffi.Void>,
          ffi.Uint32,
          ffi.Pointer<ffi.Uint32>,
          ffi.Pointer<ffi.Void>,
        ),
        int Function(
          int,
          ffi.Pointer<ffi.Void>,
          int,
          ffi.Pointer<ffi.Uint32>,
          ffi.Pointer<ffi.Void>,
        )
      >('ReadFile');
  late final _write = _dll
      .lookupFunction<
        ffi.Int32 Function(
          ffi.IntPtr,
          ffi.Pointer<ffi.Void>,
          ffi.Uint32,
          ffi.Pointer<ffi.Uint32>,
          ffi.Pointer<ffi.Void>,
        ),
        int Function(
          int,
          ffi.Pointer<ffi.Void>,
          int,
          ffi.Pointer<ffi.Uint32>,
          ffi.Pointer<ffi.Void>,
        )
      >('WriteFile');
  late final _info = _dll
      .lookupFunction<
        ffi.Int32 Function(ffi.IntPtr, ffi.Pointer<ffi.Void>),
        int Function(int, ffi.Pointer<ffi.Void>)
      >('GetFileInformationByHandle');
  late final _setInfo = _dll
      .lookupFunction<
        ffi.Int32 Function(
          ffi.IntPtr,
          ffi.Int32,
          ffi.Pointer<ffi.Void>,
          ffi.Uint32,
        ),
        int Function(int, int, ffi.Pointer<ffi.Void>, int)
      >('SetFileInformationByHandle');
  late final _attributes = _dll
      .lookupFunction<
        ffi.Uint32 Function(ffi.Pointer<ffi.Uint16>),
        int Function(ffi.Pointer<ffi.Uint16>)
      >('GetFileAttributesW');
  late final _lastError = _dll
      .lookupFunction<ffi.Uint32 Function(), int Function()>('GetLastError');
  ffi.Pointer<ffi.Void> _memory(int bytes) {
    final p = _alloc(0x40, bytes);
    if (p.address == 0) throw const CapacityExceeded();
    return p;
  }

  NativeArgumentOwner _arguments() {
    final allocate = _alloc, release = _free;
    return NativeArgumentOwner(
      allocate: (bytes) => allocate(0x40, bytes),
      free: (p) {
        if (release(p).address != 0) throw _failure();
      },
      sanitize: _nativeArgumentFailure,
      capacity: () => const CapacityExceeded(),
    );
  }

  ffi.Pointer<ffi.Uint16> _wide(String path) {
    final arguments = _arguments();
    return arguments.run(() => arguments.transfer(arguments.wide(path)));
  }

  Never _error() => _codeError(_lastError());
  Never _codeError(int e) {
    throw _failure(switch (e) {
      5 => ProblemCode.permissionDenied,
      112 => ProblemCode.noSpace,
      80 || 183 => ProblemCode.invalidSelection,
      _ => ProblemCode.ioFailure,
    }, e == 80 || e == 183 ? 'Guardar uma cópia' : 'Tentar novamente');
  }

  bool exists(String path) {
    final p = _wide(path);
    try {
      final attrs = _attributes(p);
      if (attrs == 0xffffffff) {
        final e = _lastError();
        if (e == 2 || e == 3) return false;
        _error();
      }
      return true;
    } finally {
      _free(p.cast());
    }
  }

  String leaf(String path) => path.replaceAll('/', '\\').split('\\').last;

  // Open each component relative to the preceding validated native directory.
  // No FILE_SHARE_DELETE: every ancestor stays pinned until final forget/discard.
  // RootDirectory binding, not an attributes snapshot, controls native resolution.
  List<(int, String)> pinParents(String path) {
    final full = File(path).absolute.path.replaceAll('/', '\\');
    if (!RegExp(r'^[A-Za-z]:\\').hasMatch(full)) {
      throw _failure(ProblemCode.invalidSelection);
    }
    final names = full.substring(3).split('\\');
    if (names.isEmpty || names.length > 64) {
      throw _failure(ProblemCode.invalidSelection);
    }
    for (final n in names) {
      _name(n);
    }
    final pins = <(int, String)>[];
    final root = _wide(full.substring(0, 3));
    try {
      final h = _create(root, 0xa0, 3, ffi.nullptr, 3, 0x02200000, 0);
      if (h == -1) _error();
      pins.add((h, ''));
      pins[pins.length - 1] = (h, identity(h, directory: true));
      for (final name in names.take(names.length - 1)) {
        final h = openRelative(pins.last.$1, name, directory: true);
        pins.add((h, ''));
        pins[pins.length - 1] = (h, identity(h, directory: true));
      }
      return pins;
    } catch (error) {
      final cause = error is _WinOpenFailure ? error.error : error;
      if (error is _WinOpenFailure) pins.add((error.handle, ''));
      for (var i = pins.length - 1; i >= 0; i--) {
        try {
          close(pins[i].$1);
          pins.removeAt(i);
        } catch (_) {
          /* retain failed handle */
        }
      }
      if (pins.isNotEmpty) throw _WinPinFailure(pins, cause);
      throw cause;
    } finally {
      _free(root.cast());
    }
  }

  void validatePins(List<(int, String)> pins) {
    for (final pin in pins) {
      if (identity(pin.$1, directory: true) != pin.$2) throw _failure();
    }
  }

  // Native x64 OBJECT_ATTRIBUTES (48), UNICODE_STRING (16), IO_STATUS_BLOCK
  // (16). Microsoft documents NtCreateFile for user mode and handle-relative
  // names. FILE_CREATE (2) is exclusive; FILE_OPEN (1) never truncates.
  late final _nt = ffi.DynamicLibrary.open('ntdll.dll');
  late final _ntCreate = _nt
      .lookupFunction<
        ffi.Int32 Function(
          ffi.Pointer<ffi.IntPtr>,
          ffi.Uint32,
          ffi.Pointer<ffi.Void>,
          ffi.Pointer<ffi.Void>,
          ffi.Pointer<ffi.Void>,
          ffi.Uint32,
          ffi.Uint32,
          ffi.Uint32,
          ffi.Uint32,
          ffi.Pointer<ffi.Void>,
          ffi.Uint32,
        ),
        int Function(
          ffi.Pointer<ffi.IntPtr>,
          int,
          ffi.Pointer<ffi.Void>,
          ffi.Pointer<ffi.Void>,
          ffi.Pointer<ffi.Void>,
          int,
          int,
          int,
          int,
          ffi.Pointer<ffi.Void>,
          int,
        )
      >('NtCreateFile');
  late final _ntError = _nt
      .lookupFunction<ffi.Uint32 Function(ffi.Int32), int Function(int)>(
        'RtlNtStatusToDosError',
      );
  late final _ntSetInformation = _nt
      .lookupFunction<
        ffi.Int32 Function(
          ffi.IntPtr,
          ffi.Pointer<ffi.Void>,
          ffi.Pointer<ffi.Void>,
          ffi.Uint32,
          ffi.Int32,
        ),
        int Function(
          int,
          ffi.Pointer<ffi.Void>,
          ffi.Pointer<ffi.Void>,
          int,
          int,
        )
      >('NtSetInformationFile');

  int openRelative(
    int parent,
    String name, {
    bool directory = false,
    bool create = false,
    bool rename = false,
  }) {
    _name(name);
    final arguments = _arguments();
    int? opened;
    try {
      return arguments.run(() {
        final wide = arguments.wide(name),
            unicode = arguments.allocate(16),
            attributes = arguments.allocate(48),
            io = arguments.allocate(16),
            out = arguments.allocate(8);
        unicode.cast<ffi.Uint16>()[0] = name.length * 2;
        unicode.cast<ffi.Uint16>()[1] = (name.length + 1) * 2;
        (unicode.cast<ffi.Uint8>() + 8).cast<ffi.IntPtr>().value = wide.address;
        attributes.cast<ffi.Uint32>().value = 48;
        (attributes.cast<ffi.Uint8>() + 8).cast<ffi.IntPtr>().value = parent;
        (attributes.cast<ffi.Uint8>() + 16).cast<ffi.IntPtr>().value =
            unicode.address;
        (attributes.cast<ffi.Uint8>() + 24).cast<ffi.Uint32>().value =
            0x1040; // OBJ_DONT_REPARSE | CASE_INSENSITIVE
        final status = _ntCreate(
          out.cast(),
          directory
              ? 0x1000a0
              : 0x80000000 |
                    0x100000 | // SYNCHRONIZE for synchronous NtCreateFile.
                    (create
                        ? 0x40010000
                        : rename
                        ? 0x10000
                        : 0),
          attributes,
          io,
          ffi.nullptr,
          0x80,
          directory ? 3 : 0,
          create ? 2 : 1,
          0x20 | (directory ? 1 : 0x40 | 0x200000),
          ffi.nullptr,
          0,
        );
        if (status < 0) {
          _codeError(_ntError(status));
        }
        opened = out.cast<ffi.IntPtr>().value;
        return opened!; // caller records custody before identity verification
      });
    } catch (error) {
      // A successful exclusive create is an effect, not just a live handle.
      // Transfer it before any close so the paid caller can delete by that exact
      // handle. Noncreation opens retain their existing close/failure protocol.
      if (opened != null) {
        if (create) {
          throw _WinOpenFailure(
            opened!,
            _nativeArgumentFailure(error),
            created: true,
          );
        }
        try {
          close(opened!);
        } catch (_) {
          throw _WinOpenFailure(opened!, _nativeArgumentFailure(error));
        }
      }
      rethrow;
    }
  }

  String identity(int h, {bool directory = false}) {
    final p = _memory(52);
    try {
      if (_info(h, p) == 0) _error();
      final words = p.cast<ffi.Uint32>().asTypedList(13);
      if (words[0] & 0x400 != 0 ||
          (words[0] & 0x10 != 0) != directory ||
          (!directory && words[10] != 1)) {
        throw _failure(ProblemCode.invalidSelection, 'Escolher ficheiro local');
      }
      return '${words[7]}:${words[11]}:${words[12]}';
    } finally {
      _free(p);
    }
  }

  void close(int h) {
    if (_close(h) == 0) _error();
  }

  void flush(int h) {
    if (_flush(h) == 0) _error();
  }

  void write(int h, Uint8List data) {
    final offset = (data.length + 3) & ~3;
    final p = _memory(offset + 4);
    final n = (p.cast<ffi.Uint8>() + offset).cast<ffi.Uint32>();
    try {
      p.cast<ffi.Uint8>().asTypedList(data.length).setAll(0, data);
      if (_write(h, p, data.length, n, ffi.nullptr) == 0 ||
          n.value != data.length) {
        _error();
      }
    } finally {
      _free(p);
    }
  }

  Uint8List read(int h, int maximum) {
    final offset = (maximum + 3) & ~3;
    final p = _memory(offset + 4);
    final n = (p.cast<ffi.Uint8>() + offset).cast<ffi.Uint32>();
    try {
      if (_read(h, p, maximum, n, ffi.nullptr) == 0) _error();
      if (n.value > maximum) throw _failure();
      return Uint8List.fromList(p.cast<ffi.Uint8>().asTypedList(n.value));
    } finally {
      _free(p);
    }
  }

  void renameNoReplace(int h, String destination, int parent) {
    final full = leaf(destination);
    // FILE_RENAME_INFORMATION on x64: flags at 0, root HANDLE at 8,
    // FileNameLength at 16 and UTF-16 FileName at 20. ReplaceIfExists=FALSE.
    // Keep the synchronous IO_STATUS_BLOCK in the same bounded allocation.
    final informationBytes = 24 + 2 * (full.length + 1);
    final ioOffset = (informationBytes + 7) & ~7;
    final p = _memory(ioOffset + 16);
    try {
      (p.cast<ffi.Uint8>() + 8).cast<ffi.IntPtr>().value =
          parent; // RootDirectory
      (p.cast<ffi.Uint8>() + 16).cast<ffi.Uint32>().value = 2 * full.length;
      (p.cast<ffi.Uint8>() + 20)
          .cast<ffi.Uint16>()
          .asTypedList(full.length)
          .setAll(0, full.codeUnits);
      final io = (p.cast<ffi.Uint8>() + ioOffset).cast<ffi.Void>();
      final status = _ntSetInformation(h, io, p, informationBytes, 10);
      if (status < 0) _codeError(_ntError(status));
    } finally {
      _free(p);
    }
  }

  void deleteHandle(int h) {
    final p = _memory(1);
    try {
      p.cast<ffi.Uint8>().value = 1;
      if (_setInfo(h, 4, p, 1) == 0) _error();
    } finally {
      _free(p);
    }
  }
}
