part of 'document_gateway.dart';

// Linux/Android unnamed producers avoid pathname-based rollback altogether.
// O_TMPFILE + openat/linkat are required; unsupported filesystems refuse before
// receiving bytes. ABI flags are from Linux/AOSP uapi fcntl.h, not POSIX guesses.
abstract class _DocumentStage {
  Future<void> write(Uint8List bytes);
  Future<void> seal();
  File publish();
  Future<void> handoff();
  Future<void> discard();
  static Future<_DocumentStage> create(Directory root) async {
    if (Platform.isLinux || Platform.isAndroid) {
      return _LinuxDocumentStage.create(root);
    }
    if (Platform.isWindows) return _WindowsDocumentStage.create(root);
    throw _failure(ProblemCode.invalidSelection);
  }
}

final class _LinuxDocumentStage implements _DocumentStage {
  _LinuxDocumentStage(this.root, this.fd, this.parents, this.identity);
  final String identity;
  final String root;
  final int fd;
  final List<(int, String)> parents;
  String? published;
  bool closed = false;
  static Future<_LinuxDocumentStage> create(Directory root) async {
    final path = root.absolute.path;
    if (path.length + 64 > WorkLimits.stagingPathUnits ||
        path.split('/').where((p) => p.isNotEmpty).length > 63) {
      throw const CapacityExceeded();
    }
    final created = await Isolate.run(() {
      final api = _LinuxStageApi();
      final parents = <(int, String)>[];
      var current = -100;
      try {
        current = api.openAt(current, '/', api.directoryFlags, 0);
        parents.add((current, '/'));
        var pathSoFar = '';
        for (final name in path.split('/').where((n) => n.isNotEmpty)) {
          if (name == '.' || name == '..') {
            throw _failure(ProblemCode.invalidSelection);
          }
          current = api.openAt(current, name, api.directoryFlags, 0);
          pathSoFar = '$pathSoFar/$name';
          parents.add((current, pathSoFar));
        }
        // Unnamed, private 0600 inode in the proven directory. No truncation,
        // pathname to swap, or destructive rollback name exists during copying.
        final fd = api.openAt(
          current,
          '.',
          0x400000 | api.directoryBit | 2 | 0x80000,
          0x180,
        );
        try {
          return (fd, parents, api.identity(fd));
        } catch (_) {
          api.close(fd);
          rethrow;
        }
      } catch (_) {
        for (final p in parents.reversed) {
          try {
            api.close(p.$1);
          } catch (_) {}
        }
        rethrow;
      }
    });
    return _LinuxDocumentStage(path, created.$1, created.$2, created.$3);
  }

  void validate() {
    for (final p in parents) {
      if (FileSystemEntity.typeSync(p.$2, followLinks: false) !=
              FileSystemEntityType.directory ||
          _LinuxStageApi().identity(p.$1) !=
              _LinuxStageApi().pathIdentity(p.$2)) {
        throw _failure();
      }
    }
  }

  @override
  Future<void> write(Uint8List bytes) async {
    if (closed || published != null || bytes.length > _chunkBytes) {
      throw _failure();
    }
    final h = fd;
    await Isolate.run(() => _LinuxStageApi().write(h, bytes));
  }

  @override
  Future<void> seal() async {
    final h = fd;
    await Isolate.run(() => _LinuxStageApi().flush(h));
    validate();
  }

  @override
  File publish() {
    validate();
    final name = 'documents-${_token()}.stage';
    _LinuxStageApi().link(fd, parents.last.$1, name); // atomic no-replace
    published = '$root/$name';
    if (_LinuxStageApi().identity(fd) !=
        _LinuxStageApi().pathIdentity(published!)) {
      throw _failure();
    }
    return File(published!);
  }

  @override
  Future<void> handoff() async {
    final api = _LinuxStageApi();
    Object? error;
    // Linux close errors must not cause a reused descriptor to be closed again.
    if (!closed) {
      closed = true;
      try {
        api.close(fd);
      } catch (e) {
        error = e;
      }
    }
    for (final p in parents.reversed) {
      try {
        api.close(p.$1);
      } catch (e) {
        error ??= e;
      }
    }
    parents.clear();
    if (error != null) throw error;
  }

  @override
  Future<void> discard() async {
    // A named object is never unlinked speculatively. If publication already
    // occurred but handoff refused, retain its paid custody as a truthful residual.
    if (published != null) {
      await handoff();
      throw _failure(
        ProblemCode.ioFailure,
        'Verificar ficheiro residual',
        true,
      );
    }
    await handoff(); // dropping the last unnamed inode handle performs cleanup
  }
}

final class _LinuxStageApi {
  _LinuxStageApi() {
    final abi = ffi.Abi.current();
    if (abi != ffi.Abi.linuxX64 &&
        abi != ffi.Abi.androidX64 &&
        abi != ffi.Abi.linuxArm64 &&
        abi != ffi.Abi.androidArm64 &&
        abi != ffi.Abi.androidArm &&
        abi != ffi.Abi.androidIA32) {
      throw _failure();
    }
    directoryBit =
        (abi == ffi.Abi.linuxArm64 ||
            abi == ffi.Abi.androidArm64 ||
            abi == ffi.Abi.androidArm)
        ? 0x4000
        : 0x10000;
    nofollowBit = directoryBit == 0x4000 ? 0x8000 : 0x20000;
    inodeOffset = abi == ffi.Abi.androidArm
        ? 96
        : abi == ffi.Abi.androidIA32
        ? 88
        : 8;
  }
  final dll = ffi.DynamicLibrary.process();
  late final int directoryBit, nofollowBit, inodeOffset;
  int get directoryFlags => directoryBit | nofollowBit | 0x80000;
  late final alloc = dll
      .lookupFunction<
        ffi.Pointer<ffi.Void> Function(ffi.IntPtr, ffi.IntPtr),
        ffi.Pointer<ffi.Void> Function(int, int)
      >('calloc');
  late final free = dll
      .lookupFunction<
        ffi.Void Function(ffi.Pointer<ffi.Void>),
        void Function(ffi.Pointer<ffi.Void>)
      >('free');
  late final open = dll
      .lookupFunction<
        ffi.Int32 Function(
          ffi.Int32,
          ffi.Pointer<ffi.Uint8>,
          ffi.Int32,
          ffi.Uint32,
        ),
        int Function(int, ffi.Pointer<ffi.Uint8>, int, int)
      >('openat');
  late final closeFd = dll
      .lookupFunction<ffi.Int32 Function(ffi.Int32), int Function(int)>(
        'close',
      );
  late final fsync = dll
      .lookupFunction<ffi.Int32 Function(ffi.Int32), int Function(int)>(
        'fsync',
      );
  late final writeFd = dll
      .lookupFunction<
        ffi.IntPtr Function(ffi.Int32, ffi.Pointer<ffi.Void>, ffi.IntPtr),
        int Function(int, ffi.Pointer<ffi.Void>, int)
      >('write');
  late final linkAt = dll
      .lookupFunction<
        ffi.Int32 Function(
          ffi.Int32,
          ffi.Pointer<ffi.Uint8>,
          ffi.Int32,
          ffi.Pointer<ffi.Uint8>,
          ffi.Int32,
        ),
        int Function(
          int,
          ffi.Pointer<ffi.Uint8>,
          int,
          ffi.Pointer<ffi.Uint8>,
          int,
        )
      >('linkat');
  // Linux/bionic x64/arm64: dev at 0, inode at 8. Bionic stat/stat64
  // are synonyms: ARM32 inode at 96, IA32 at 88 (AOSP sys/stat.h).
  // Allocate beyond the complete 144/128-byte ABI; only documented fields read.
  late final fstat = dll
      .lookupFunction<
        ffi.Int32 Function(ffi.Int32, ffi.Pointer<ffi.Void>),
        int Function(int, ffi.Pointer<ffi.Void>)
      >('fstat');
  late final lstat = dll
      .lookupFunction<
        ffi.Int32 Function(ffi.Pointer<ffi.Uint8>, ffi.Pointer<ffi.Void>),
        int Function(ffi.Pointer<ffi.Uint8>, ffi.Pointer<ffi.Void>)
      >('lstat');
  String identity(int fd) {
    final p = alloc(256, 1);
    if (p.address == 0) throw const CapacityExceeded();
    try {
      if (fstat(fd, p) != 0) throw _failure();
      final dev = p.cast<ffi.Uint64>().value,
          ino = (p.cast<ffi.Uint8>() + inodeOffset).cast<ffi.Uint64>().value;
      return '$dev:$ino';
    } finally {
      free(p);
    }
  }

  NativeArgumentOwner arguments() {
    // Resolve both symbols before the first allocation; lookup failures cannot
    // strand an argument, including during a later free.
    final allocate = alloc, release = free;
    return NativeArgumentOwner(
      allocate: (bytes) => allocate(bytes, 1),
      free: release,
      sanitize: _nativeArgumentFailure,
      capacity: () => const CapacityExceeded(),
    );
  }

  String pathIdentity(String path) {
    final arguments = this.arguments();
    return arguments.run(() {
      final n = arguments.text(path), p = arguments.allocate(256);
      if (lstat(n, p) != 0) throw _failure();
      final dev = p.cast<ffi.Uint64>().value,
          ino = (p.cast<ffi.Uint8>() + inodeOffset).cast<ffi.Uint64>().value;
      return '$dev:$ino';
    });
  }

  ffi.Pointer<ffi.Uint8> text(String s) {
    final arguments = this.arguments();
    return arguments.run(() => arguments.transfer(arguments.text(s)));
  }

  int openAt(int parent, String name, int flags, int mode) {
    final p = text(name);
    try {
      final fd = open(parent, p, flags, mode);
      if (fd < 0) throw _failure();
      return fd;
    } finally {
      free(p.cast());
    }
  }

  void write(int fd, Uint8List bytes) {
    final p = alloc(bytes.length, 1);
    if (p.address == 0) throw const CapacityExceeded();
    try {
      p.cast<ffi.Uint8>().asTypedList(bytes.length).setAll(0, bytes);
      var offset = 0;
      while (offset < bytes.length) {
        final n = writeFd(
          fd,
          (p.cast<ffi.Uint8>() + offset).cast(),
          bytes.length - offset,
        );
        if (n <= 0) throw _failure();
        offset += n;
      }
    } finally {
      free(p);
    }
  }

  void flush(int fd) {
    if (fsync(fd) != 0) throw _failure();
  }

  void close(int fd) {
    if (closeFd(fd) != 0) throw _failure();
  }

  void link(int fd, int directory, String name) {
    final arguments = this.arguments();
    arguments.run(() {
      final from = arguments.text('/proc/self/fd/$fd'),
          to = arguments.text(name);
      if (linkAt(-100, from, directory, to, 0x400) != 0) throw _failure();
    });
  }
}

final class _WindowsDocumentStage implements _DocumentStage {
  _WindowsDocumentStage(this.file, this.handle, this.pins, this.uncreated);
  bool deleted = false;
  final bool uncreated;
  String? identity;
  final List<(int, String)> pins;
  final File file;
  int? handle;
  static Future<_WindowsDocumentStage> create(Directory root) async {
    final path = root.absolute.path;
    if (path.length + 64 > WorkLimits.stagingPathUnits ||
        path.split(RegExp(r'[/\\]')).where((p) => p.isNotEmpty).length > 63) {
      throw const CapacityExceeded();
    }
    final file = File(
      '$path${Platform.pathSeparator}documents-${_token()}.stage',
    );
    final opened = await Isolate.run(() {
      final api = _WinApi();
      try {
        final pins = api.pinParents(file.path);
        try {
          final handle = api.openRelative(
            pins.last.$1,
            api.leaf(file.path),
            create: true,
          );
          return (handle, pins, null as Object?, true);
        } on _WinOpenFailure catch (error) {
          return (error.handle, pins, error.error, error.created);
        } catch (error) {
          return (null, pins, error, false);
        }
      } on _WinPinFailure catch (error) {
        return (null, error.pins, error.error, false);
      }
    });
    final stage = _WindowsDocumentStage(file, opened.$1, opened.$2, !opened.$4);
    if (opened.$3 != null) throw _StageCreationFailure(stage, opened.$3!);
    return stage;
  }

  @override
  Future<void> write(Uint8List bytes) async {
    final h = handle!;
    await Isolate.run(() => _WinApi().write(h, bytes));
  }

  @override
  Future<void> seal() async {
    final h = handle!;
    identity = await Isolate.run(() {
      final api = _WinApi();
      api.flush(h);
      return api.identity(h);
    });
  }

  @override
  File publish() {
    _WinApi().validatePins(pins);
    return file;
  }

  @override
  Future<void> handoff() async {
    final h = handle;
    Object? error;
    if (h != null) {
      try {
        await Isolate.run(() => _WinApi().close(h));
        handle = null;
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
  }

  @override
  Future<void> discard() async {
    final h = handle;
    if (h == null) {
      await handoff();
      if (uncreated || deleted) return;
      throw _failure(
        ProblemCode.ioFailure,
        'Verificar ficheiro residual',
        true,
      );
    }
    if (!deleted) {
      await Isolate.run(() => _WinApi().deleteHandle(h));
      deleted = true;
    }
    await handoff();
  }
}
