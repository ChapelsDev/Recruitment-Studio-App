import 'dart:convert';
import 'dart:ffi' as ffi;

import '../../shared/work_limits.dart';

/// Internal synchronous argument custody, not a gateway API or global fault
/// seam. Fixed storage exists before the first allocator call. Instance-local
/// callbacks permit safe ordinary-host controls without loading native adapters.
final class NativeArgumentOwner {
  NativeArgumentOwner({
    required ffi.Pointer<ffi.Void> Function(int) allocate,
    required void Function(ffi.Pointer<ffi.Void>) free,
    required Object Function(Object) sanitize,
    required Object Function() capacity,
    void Function(ffi.Pointer<ffi.Uint8>, List<int>)? populateBytes,
    void Function(ffi.Pointer<ffi.Uint16>, List<int>)? populateUnits,
    // Named internal callback arguments intentionally do not expose private fields.
    // ignore: prefer_initializing_formals
  }) : _allocate = allocate,
       // ignore: prefer_initializing_formals
       _free = free,
       // ignore: prefer_initializing_formals
       _sanitize = sanitize,
       // ignore: prefer_initializing_formals
       _capacity = capacity,
       _populateBytes = populateBytes ?? _bytes,
       _populateUnits = populateUnits ?? _units;

  final ffi.Pointer<ffi.Void> Function(int) _allocate;
  final void Function(ffi.Pointer<ffi.Void>) _free;
  final Object Function(Object) _sanitize;
  final Object Function() _capacity;
  final void Function(ffi.Pointer<ffi.Uint8>, List<int>) _populateBytes;
  final void Function(ffi.Pointer<ffi.Uint16>, List<int>) _populateUnits;
  final _owned = List<ffi.Pointer<ffi.Void>?>.filled(5, null);
  int _count = 0;
  bool _running = false, _used = false;

  static void _bytes(ffi.Pointer<ffi.Uint8> p, List<int> b) =>
      p.asTypedList(b.length).setAll(0, b);
  static void _units(ffi.Pointer<ffi.Uint16> p, List<int> b) =>
      p.asTypedList(b.length + 1).setAll(0, b);

  T run<T>(T Function() action) {
    if (_used) throw _capacity();
    _used = true;
    _running = true;
    Object? first;
    late T result;
    try {
      result = action();
    } catch (error) {
      first = _sanitize(error);
    } finally {
      _running = false;
      // Every successful allocation gets an independent attempt. Mark detached
      // before invoking free: never retry a pointer potentially already freed.
      while (_count > 0) {
        final p = _owned[--_count]!;
        _owned[_count] = null;
        try {
          _free(p);
        } catch (error) {
          first ??= _sanitize(error);
        }
      }
    }
    if (first != null) throw first;
    return result;
  }

  ffi.Pointer<ffi.Void> allocate(int bytes) {
    if (!_running ||
        _count == _owned.length ||
        bytes < 1 ||
        bytes > 4 * WorkLimits.stagingPathUnits + 64) {
      throw _capacity();
    }
    final p = _allocate(bytes);
    if (p.address == 0) throw _capacity();
    _owned[_count++] = p; // ownership precedes every view/population operation
    return p;
  }

  ffi.Pointer<ffi.Uint8> text(String text) {
    if (text.length > WorkLimits.stagingPathUnits || text.contains('\u0000')) {
      throw _capacity();
    }
    final bytes = utf8.encode(text);
    final p = allocate(bytes.length + 1).cast<ffi.Uint8>();
    _populateBytes(p, bytes);
    return p;
  }

  ffi.Pointer<ffi.Uint16> wide(String text) {
    if (text.length > WorkLimits.stagingPathUnits || text.contains('\u0000')) {
      throw _capacity();
    }
    final p = allocate(2 * (text.length + 1)).cast<ffi.Uint16>();
    _populateUnits(p, text.codeUnits);
    return p;
  }

  /// Transfer one fully populated single argument to an existing caller's
  /// try/finally; never transfer before population, or from a multi-buffer scope.
  ffi.Pointer<T> transfer<T extends ffi.NativeType>(ffi.Pointer<T> pointer) {
    if (!_running || _count != 1 || _owned[0]!.address != pointer.address) {
      throw _capacity();
    }
    _owned[0] = null;
    _count = 0;
    return pointer;
  }
}
