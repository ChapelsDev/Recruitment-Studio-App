import 'dart:ffi' as ffi;

import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/features/documents/_native_argument_owner.dart';
import 'package:recruitment_studio/shared/problem.dart';

// Ordinary-host bounded-owner controls using real calloc/free pointers. These
// callbacks do NOT inject native allocator faults or execute the Win32 adapter.
final class Heap {
  final dll = ffi.DynamicLibrary.process();
  late final alloc = dll
      .lookupFunction<
        ffi.Pointer<ffi.Void> Function(ffi.IntPtr, ffi.IntPtr),
        ffi.Pointer<ffi.Void> Function(int, int)
      >('calloc');
  late final release = dll
      .lookupFunction<
        ffi.Void Function(ffi.Pointer<ffi.Void>),
        void Function(ffi.Pointer<ffi.Void>)
      >('free');
  final live = <int>{};
  final frees = <int>[];
  int calls = 0;
  int? failAllocation, failFree;
  bool nullFailure = true;
  final cause = const CapacityExceeded();
  final safeIo = StateError('finite-safe-io');
  ffi.Pointer<ffi.Void> allocate(int bytes) {
    calls++;
    if (calls == failAllocation) {
      if (nullFailure) return ffi.nullptr;
      throw cause;
    }
    final p = alloc(bytes, 1);
    if (p.address == 0) throw cause;
    live.add(p.address);
    return p;
  }

  void free(ffi.Pointer<ffi.Void> p) {
    expect(
      live.remove(p.address),
      isTrue,
      reason: 'exactly one attempt per real pointer',
    );
    frees.add(p.address);
    release(p);
    // Throw only AFTER real free. Never induce unsafe native free failure.
    if (frees.length == failFree) throw StateError('raw-secret-path');
  }

  NativeArgumentOwner owner({bool bytesFail = false, bool wideFail = false}) =>
      NativeArgumentOwner(
        allocate: allocate,
        free: free,
        sanitize: (e) => e is CapacityExceeded ? e : safeIo,
        capacity: () => cause,
        populateBytes: bytesFail
            ? (p, b) {
                p.asTypedList(b.length).setAll(0, b);
                throw StateError('raw-population-path');
              }
            : null,
        populateUnits: wideFail
            ? (p, b) {
                p.asTypedList(b.length).setAll(0, b);
                throw StateError('raw-population-path');
              }
            : null,
      );
}

void main() {
  for (final count in [2, 5]) {
    for (var index = 1; index <= count; index++) {
      for (final nullFailure in [true, false]) {
        test(
          'HOST owner $count buffers allocation $index null=$nullFailure frees all predecessors',
          () {
            final heap = Heap()
              ..failAllocation = index
              ..nullFailure = nullFailure;
            final owner = heap.owner();
            expect(
              () => owner.run(() {
                for (var i = 0; i < count; i++) {
                  owner.allocate(48);
                }
                fail('native callback must not run with incomplete arguments');
              }),
              throwsA(same(heap.cause)),
            );
            expect(heap.calls, index);
            expect(heap.frees, hasLength(index - 1));
            expect(heap.live, isEmpty);
          },
        );
      }
      test(
        'HOST owner $count buffers population $index frees every successful allocation',
        () {
          final heap = Heap(), ownerHeap = Heap();
          final owner = ownerHeap.owner();
          expect(
            () => owner.run(() {
              for (var i = 1; i <= count; i++) {
                owner
                    .allocate(48)
                    .cast<ffi.Uint8>()
                    .asTypedList(48)
                    .fillRange(0, 48, 1);
                if (i == index) throw heap.cause;
              }
            }),
            throwsA(same(heap.cause)),
          );
          expect(ownerHeap.frees, hasLength(index));
          expect(ownerHeap.live, isEmpty);
        },
      );
    }
    for (var index = 1; index <= count; index++) {
      test(
        'HOST owner $count buffers late free $index independently attempts remaining frees',
        () {
          final heap = Heap()..failFree = index;
          final owner = heap.owner();
          expect(
            () => owner.run(() {
              for (var i = 0; i < count; i++) {
                owner.allocate(48);
              }
              return 23;
            }),
            throwsA(same(heap.safeIo)),
          );
          expect(heap.frees, hasLength(count));
          expect(heap.live, isEmpty);
        },
      );
    }
    test(
      'HOST owner $count buffers syscall cause wins over late cleanup fault',
      () {
        final heap = Heap()..failFree = 1;
        final owner = heap.owner();
        expect(
          () => owner.run(() {
            for (var i = 0; i < count; i++) {
              owner.allocate(48);
            }
            throw heap.cause;
          }),
          throwsA(same(heap.cause)),
        );
        expect(heap.frees, hasLength(count));
        expect(heap.live, isEmpty);
      },
    );
  }
  for (final wide in [true, false]) {
    test(
      'HOST ${wide ? 'wide' : 'UTF8'} population callback failure releases allocated pointer',
      () {
        final heap = Heap(), owner = Heap();
        final arguments = owner.owner(bytesFail: !wide, wideFail: wide);
        expect(
          () => arguments.run(
            () => wide ? arguments.wide('é') : arguments.text('é'),
          ),
          throwsA(same(owner.safeIo)),
        );
        expect(owner.live, isEmpty);
        expect(owner.frees, hasLength(1));
        expect(heap.calls, 0);
      },
    );
  }
  test('HOST owner success emits terminated UTF8 and UTF16 then frees five buffers', () {
    final heap = Heap(), owner = Heap();
    final arguments = owner.owner();
    expect(
      arguments.run(() {
        final text = arguments.text('é'), wide = arguments.wide('é');
        expect(text.asTypedList(3), [0xc3, 0xa9, 0]);
        expect(wide.asTypedList(2), [0xe9, 0]);
        arguments.allocate(16);
        arguments.allocate(48);
        arguments.allocate(8);
        return 17;
      }),
      17,
    );
    expect(owner.frees, hasLength(5));
    expect(owner.live, isEmpty);
    expect(heap.calls, 0);
  });
  test('HOST owner sixth allocation refuses before allocator and independently frees five', () {
    final heap = Heap();
    final owner = heap.owner();
    expect(
      () => owner.run(() {
        for (var i = 0; i < 6; i++) {
          owner.allocate(8);
        }
      }),
      throwsA(same(heap.cause)),
    );
    expect(heap.calls, 5);
    expect(heap.frees, hasLength(5));
    expect(heap.live, isEmpty);
    expect(() => owner.run(() {}), throwsA(same(heap.cause)));
    expect(() => owner.allocate(8), throwsA(same(heap.cause)));
  });
  test('HOST owner rejects unbounded and zero-containing arguments before allocation', () {
    for (final wide in [true, false]) {
      for (final value in ['x' * 4097, 'bad\u0000name']) {
        final heap = Heap();
        final owner = heap.owner();
        expect(
          () => owner.run(() => wide ? owner.wide(value) : owner.text(value)),
          throwsA(same(heap.cause)),
        );
        expect(heap.calls, 0);
      }
    }
    for (final size in [0, 16449]) {
      final heap = Heap();
      final owner = heap.owner();
      expect(
        () => owner.run(() => owner.allocate(size)),
        throwsA(same(heap.cause)),
      );
      expect(heap.calls, 0);
    }
  });
  test('HOST single fully populated argument transfer leaves exact pointer with caller', () {
    final heap = Heap();
    final owner = heap.owner();
    final pointer = owner.run(() => owner.transfer(owner.text('safe')));
    expect(heap.live, {pointer.address});
    expect(heap.frees, isEmpty);
    heap.free(pointer.cast());
    expect(heap.live, isEmpty);
    final refused = heap.owner();
    expect(
      () => refused.run(() {
        final first = refused.allocate(8);
        refused.allocate(8);
        return refused.transfer(first);
      }),
      throwsA(same(heap.cause)),
    );
    expect(heap.live, isEmpty);
  });
}
