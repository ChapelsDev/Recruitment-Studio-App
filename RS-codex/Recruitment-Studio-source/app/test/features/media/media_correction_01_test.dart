import 'dart:typed_data';

import 'package:crypto/crypto.dart' as crypto;
import 'package:image/image.dart' as img;
import 'package:recruitment_studio/shared/work_limits.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/features/editor/editor_session.dart';
import 'package:recruitment_studio/features/media/resource_service.dart';
import 'package:recruitment_studio/features/media/image_header_probe.dart';
import 'package:recruitment_studio/features/media/media_worker.dart';
import 'package:recruitment_studio/shared/operation.dart';
import 'package:recruitment_studio/shared/problem.dart';
import 'package:recruitment_studio/features/projects/project.dart';
import 'package:recruitment_studio/features/projects/project_bundle.dart';
import 'package:recruitment_studio/shared/work_budget.dart';

import 'media_test_fixtures.dart';

// AssetRef promises six metadata values, not identity after manifest copying.
List<Object> _metadata(AssetRef ref) => [
  ref.id,
  ref.kind,
  ref.mediaType,
  ref.width,
  ref.height,
  ref.sha256,
];

Uint8List _dimensionPng(int width, int height) => Uint8List.fromList([
  ...pngHeader(width, height),
  ...pngChunk('IDAT', []),
  ...pngChunk('IEND', []),
]);

Future<void> _refusesPreservingEditor(
  Uint8List input,
  Matcher refusal, {
  bool embedded = false,
  AssetRef? expected,
}) async {
  final budget = WorkBudgetController();
  final phases = <String>[];
  final service = ResourceService(
    budget: budget,
    worker: MediaWorker(onPhase: phases.add),
  );
  final editor = EditorSession(
    Project.blank(id: 'prior')
        .withHeadline(AppLocale.ptPT, 'Manual prior headline')
        .withContact(AppLocale.ptPT, 'contact', 'manual@invalid.test'),
    budget: budget,
  );
  final beforeInput = Uint8List.fromList(input);
  ResourceEntry? valid;
  ResourceEntry? unexpected;
  try {
    valid = await service.importImage(realPng(), AssetKind.photo);
    editor.attachResource(valid);
    final beforeManifest = editor.project.toManifest();
    final beforeResources = editor.bundle.resources;
    final beforeCharge = budget.reservedBytes;
    phases.clear();
    Object? error;
    try {
      if (embedded) {
        await service.validateEmbedded(input, expected!);
      } else {
        unexpected = await service.importImage(input, AssetKind.photo);
      }
    } catch (e) {
      error = e;
    }
    expect(error, refusal);
    expect(phases, isEmpty, reason: 'Header refusal must precede worker spawn');
    expect(input, beforeInput);
    expect(editor.project.toManifest(), beforeManifest);
    expect(editor.bundle.resources, beforeResources);
    expect(budget.reservedBytes, beforeCharge);
  } finally {
    editor.dispose();
    if (valid != null) await service.release(valid);
    if (unexpected != null) await service.release(unexpected);
  }
  expect(budget.reservedBytes, 0);
}

List<int> _dqtOffsets(Uint8List input) {
  final view = ByteData.sublistView(input);
  final offsets = <int>[];
  for (var p = 2; p < input.length;) {
    expect(input[p++], 255);
    final marker = input[p++];
    if (marker == 218) break;
    final end = p + view.getUint16(p);
    if (marker == 219) {
      for (var q = p + 2; q < end; q += 65) {
        expect(input[q] >> 4, 0, reason: 'genuine baseline 8-bit DQT');
        offsets.add(q + 1);
      }
    }
    p = end;
  }
  expect(offsets, isNotEmpty);
  return offsets;
}

AssetRef _trueRef(Uint8List input, MediaType type, int width, int height) =>
    AssetRef(
      id: 'true-hash',
      kind: AssetKind.photo,
      mediaType: type,
      width: width,
      height: height,
      sha256: crypto.sha256.convert(input).toString(),
    );

List<(String, Uint8List)> _pngParts(Uint8List bytes) {
  final v = ByteData.sublistView(bytes);
  return [
    for (var p = 8; p < bytes.length; p += v.getUint32(p) + 12)
      (
        String.fromCharCodes(bytes.sublist(p + 4, p + 8)),
        Uint8List.fromList(bytes.sublist(p + 8, p + 8 + v.getUint32(p))),
      ),
  ];
}

Uint8List _fragmentedPng({
  int empty = 0,
  bool split = false,
  int channels = 4,
}) {
  final original = realPng(channels: channels);
  final parts = _pngParts(original);
  final payload = Uint8List.fromList([
    for (final p in parts)
      if (p.$1 == 'IDAT') ...p.$2,
  ]);
  final out = BytesBuilder()..add(original.sublist(0, 33));
  for (var i = 0; i < empty; i++) {
    out.add(pngChunk('IDAT', []));
  }
  if (split) {
    for (final value in payload) {
      out.add(pngChunk('IDAT', [value]));
    }
  } else {
    out.add(pngChunk('IDAT', payload));
  }
  out.add(pngChunk('IEND', []));
  return out.takeBytes();
}

int _pngPaidEnvelope(int n, int width, int height) {
  final p = width * height, raw = 4 * p + height;
  int encoded(int r) => r + (r >> 12) + (r >> 14) + (r >> 25) + 65536 + 57;
  const t = 512 * 512, tr = 4 * t + 512;
  return 6 * n +
      8 * p +
      4 * raw +
      5 * encoded(raw) +
      32 * width +
      4 * t +
      2 * tr +
      5 * encoded(tr) +
      4 * (512 + 512) +
      8 * 1024 * 1024;
}

List<int> _pixels(Uint8List input) =>
    img.decodePng(input)!.getBytes(order: img.ChannelOrder.rgba).toList();

void main() {
  for (final shape in ['ordinary', '4097-empty', 'nonempty-fragmented']) {
    Uint8List fixture() => _fragmentedPng(
      empty: shape == '4097-empty' ? 4097 : 0,
      split: shape == 'nonempty-fragmented',
    );
    test(
      'correction PNG $shape prepaid preparation has exactly one IDAT and identical pixels',
      () async {
        final input = fixture(), before = Uint8List.fromList(input);
        final parts = _pngParts(input).where((p) => p.$1 == 'IDAT').toList();
        if (shape == '4097-empty') {
          expect(parts.where((p) => p.$2.isEmpty).length, 4097);
        }
        if (shape == 'nonempty-fragmented') {
          expect(parts.length, greaterThan(1));
          expect(parts.every((p) => p.$2.isNotEmpty), isTrue);
        }
        final budget = WorkBudgetController(), op = WorkOperation.create();
        final h = ImageHeaderProbe().inspect(input);
        final amount = mediaAllocationEstimate(h, input.length);
        final lease = await budget.acquire(op, amount);
        try {
          final prepared = preparePngForDecode(
            input,
            lease: lease,
            operation: op,
          );
          expect(_pngParts(prepared).map((p) => p.$1).toList(), [
            'IHDR',
            'IDAT',
            'IEND',
          ]);
          expect(prepared.length, lessThanOrEqualTo(input.length));
          expect(validatePngExpansion(prepared), 2 * (3 * 4 + 1));
          expect(_pixels(prepared), _pixels(realPng()));
          expect(input, before);
          expect(budget.reservedBytes, amount);
        } finally {
          lease.release();
          await op.finish();
        }
        expect(budget.reservedBytes, 0);
      },
    );
    test(
      'correction PNG $shape actual import embedded and borrowed lease use paid common path',
      () async {
        final input = fixture(), before = Uint8List.fromList(input);
        final budget = WorkBudgetController();
        final phases = <(String, int)>[];
        final service = ResourceService(
          budget: budget,
          worker: MediaWorker(
            onPhase: (p) => phases.add((p, budget.reservedBytes)),
          ),
        );
        final h = ImageHeaderProbe().inspect(input);
        final amount = mediaAllocationEstimate(h, input.length);
        expect(amount, _pngPaidEnvelope(input.length, 3, 2));
        final entry = await service.importImage(input, AssetKind.photo);
        try {
          expect(_pixels(entry.bytes), _pixels(realPng()));
          expect(
            entry.ref.sha256,
            crypto.sha256.convert(entry.bytes).toString(),
          );
          expect(_pngParts(entry.bytes).map((p) => p.$1).toList(), [
            'IHDR',
            'IDAT',
            'IEND',
          ]);
          final importRows = phases
              .where((r) => r.$1 == 'spawned' || r.$1 == 'result')
              .toList();
          expect(importRows.length, 2);
          for (final r in importRows) {
            expect(r.$2, 2 * input.length + 1048576 + amount);
          }
          final retained =
              entry.bytes.length + service.previewFor(entry).length;
          expect(budget.reservedBytes, retained);
          phases.clear();
          await service.validateEmbedded(
            input,
            _trueRef(input, MediaType.png, 3, 2),
          );
          final verifyRows = phases.where((r) => r.$1 == 'verified').toList();
          expect(verifyRows.length, 1);
          expect(
            verifyRows.single.$2,
            retained + 2 * input.length + 1048576 + amount,
          );
          expect(budget.reservedBytes, retained);
          final outer = WorkOperation.create();
          final lease = await budget.acquire(outer, 7);
          try {
            phases.clear();
            await service.validateEmbeddedWithLease(
              input,
              _trueRef(input, MediaType.png, 3, 2),
              operation: outer,
              lease: lease,
            );
            final borrowed = phases.where((r) => r.$1 == 'verified').toList();
            expect(borrowed.length, 1);
            expect(
              borrowed.single.$2,
              retained + 7 + 2 * input.length + 1048576 + amount,
            );
            expect(budget.reservedBytes, retained + 7);
            lease.forChild(outer);
          } finally {
            lease.release();
            await outer.finish();
          }
          expect(input, before);
        } finally {
          await service.release(entry);
        }
        expect(budget.reservedBytes, 0);
      },
    );
  }
  test('correction PNG preparation strips permitted private metadata without pixel mutation', () async {
    final input = insertPngChunk(_fragmentedPng(split: true), 'tEXt', [
      65,
      0,
      66,
    ]);
    final before = Uint8List.fromList(input);
    final budget = WorkBudgetController(), op = WorkOperation.create();
    final lease = await budget.acquire(
      op,
      mediaAllocationEstimate(ImageHeaderProbe().inspect(input), input.length),
    );
    try {
      final out = preparePngForDecode(input, lease: lease, operation: op);
      expect(ImageHeaderProbe().inspect(out).hasPrivateMetadata, isFalse);
      expect(_pixels(out), _pixels(realPng()));
      expect(input, before);
    } finally {
      lease.release();
      await op.finish();
    }
    expect(budget.reservedBytes, 0);
  });
  for (final channels in [1, 2, 3, 4]) {
    test(
      'correction PNG bounded preparation preserves admitted channel count $channels',
      () async {
        final input = _fragmentedPng(split: true, channels: channels);
        final before = Uint8List.fromList(input);
        final budget = WorkBudgetController(), op = WorkOperation.create();
        final h = ImageHeaderProbe().inspect(input);
        final lease = await budget.acquire(
          op,
          mediaAllocationEstimate(h, input.length),
        );
        try {
          final out = preparePngForDecode(input, lease: lease, operation: op);
          expect(ImageHeaderProbe().inspect(out).channels, channels);
          expect(_pixels(out), _pixels(realPng(channels: channels)));
          expect(input, before);
        } finally {
          lease.release();
          await op.finish();
        }
        expect(budget.reservedBytes, 0);
      },
    );
  }
  for (final damage in ['crc', 'noncontiguous']) {
    test(
      'correction PNG preparation refuses $damage before coalescing can launder it',
      () async {
        var input = _fragmentedPng(split: true);
        if (damage == 'crc') {
          input[41] ^= 1;
        } else {
          final parts = _pngParts(input);
          input = Uint8List.fromList([
            ...input.sublist(0, 33),
            ...pngChunk('IDAT', parts[1].$2),
            ...pngChunk('tEXt', [65, 0, 66]),
            for (final p in parts.skip(2)) ...pngChunk(p.$1, p.$2),
          ]);
        }
        final before = Uint8List.fromList(input);
        final budget = WorkBudgetController(), op = WorkOperation.create();
        final lease = await budget.acquire(op, 32 * 1024 * 1024);
        final refusal = isA<OperationException>().having(
          (e) => e.code,
          'code',
          ProblemCode.invalidResource,
        );
        try {
          expect(
            () => preparePngForDecode(input, lease: lease, operation: op),
            throwsA(refusal),
          );
          expect(input, before);
        } finally {
          lease.release();
          await op.finish();
        }
        expect(budget.reservedBytes, 0);
        await _refusesPreservingEditor(input, refusal);
      },
    );
  }
  test('correction PNG prepaid estimate covers wide-row list and refuses insufficient lease before preparation', () async {
    final input = _fragmentedPng(empty: 4097);
    final h = ImageHeaderProbe().inspect(input);
    final amount = _pngPaidEnvelope(input.length, 3, 2);
    expect(mediaAllocationEstimate(h, input.length), amount);
    final budget = WorkBudgetController(), op = WorkOperation.create();
    final lease = await budget.acquire(op, amount - 1);
    final before = Uint8List.fromList(input);
    try {
      expect(
        () => preparePngForDecode(input, lease: lease, operation: op),
        throwsA(isA<CapacityExceeded>()),
      );
      expect(
        () => normalizeMedia(input, lease: lease, operation: op),
        throwsA(isA<CapacityExceeded>()),
      );
      expect(input, before);
    } finally {
      lease.release();
      await op.finish();
    }
    expect(budget.reservedBytes, 0);
    final wide = ImageHeaderProbe().inspect(_dimensionPng(12000000, 1));
    expect(
      mediaAllocationEstimate(wide, 100),
      _pngPaidEnvelope(100, 12000000, 1),
    );
    expect(
      mediaAllocationEstimate(wide, 100),
      greaterThan(WorkLimits.ownedBufferBytes),
    );
    final foreign = WorkOperation.create();
    final charge = budget.reserve(foreign, budget.capacityBytes - amount);
    final caller = WorkOperation.create();
    try {
      expect(
        () => budget.acquire(caller, amount + 1),
        throwsA(isA<CapacityExceeded>()),
      );
    } finally {
      charge.release();
      await foreign.finish();
      await caller.finish();
    }
    expect(budget.reservedBytes, 0);
  });
  test('correction PNG synchronous common normalization uses bounded preparation and unchanged input', () async {
    final input = _fragmentedPng(split: true, empty: 4097),
        before = Uint8List.fromList(_fragmentedPng(split: true, empty: 4097));
    final budget = WorkBudgetController(), op = WorkOperation.create();
    final lease = await budget.acquire(
      op,
      mediaAllocationEstimate(ImageHeaderProbe().inspect(input), input.length),
    );
    try {
      final result = normalizeMedia(input, lease: lease, operation: op);
      expect(_pixels(result.bytes), _pixels(realPng()));
      expect(_pngParts(result.bytes).map((p) => p.$1).toList(), [
        'IHDR',
        'IDAT',
        'IEND',
      ]);
      expect(input, before);
    } finally {
      lease.release();
      await op.finish();
    }
    expect(budget.reservedBytes, 0);
  });
  for (final mutation in [
    'first',
    'middle',
    'last',
    'second-table',
    'all-zero',
  ]) {
    Uint8List fixture() {
      final input = realJpeg();
      final offsets = _dqtOffsets(input);
      expect(input[offsets.first - 1], 0, reason: 'legal Pq0/Tq0 control');
      if (mutation == 'all-zero') {
        for (final q in offsets) {
          input.fillRange(q, q + 64, 0);
        }
      } else {
        final table = mutation == 'second-table' ? offsets[1] : offsets.first;
        final index = mutation == 'middle'
            ? 31
            : mutation == 'last'
            ? 63
            : 0;
        expect(input[table + index], greaterThan(0));
        input[table + index] = 0;
      }
      return input;
    }

    final refusal = isA<OperationException>().having(
      (e) => e.code,
      'code',
      ProblemCode.invalidResource,
    );
    test('correction JPEG zero DQT $mutation header refuses', () {
      final input = fixture();
      final before = Uint8List.fromList(input);
      expect(() => ImageHeaderProbe().inspect(input), throwsA(refusal));
      expect(input, before);
    });
    test(
      'correction JPEG zero DQT $mutation import refuses without laundering or project mutation',
      () async {
        await _refusesPreservingEditor(fixture(), refusal);
      },
    );
    test(
      'correction JPEG zero DQT $mutation true-hash embedded refuses preserving editor',
      () async {
        final input = fixture();
        await _refusesPreservingEditor(
          input,
          refusal,
          embedded: true,
          expected: _trueRef(input, MediaType.jpeg, 24, 16),
        );
      },
    );
  }
  test('correction JPEG real nonzero DQT and legal table ID0 precision0 remain admitted', () async {
    final input = realJpeg();
    final before = Uint8List.fromList(input);
    final offsets = _dqtOffsets(input);
    expect(input[offsets.first - 1], 0);
    for (final q in offsets) {
      expect(input.sublist(q, q + 64).every((v) => v >= 1 && v <= 255), isTrue);
    }
    final budget = WorkBudgetController();
    final service = ResourceService(budget: budget);
    await service.validateEmbedded(
      input,
      _trueRef(input, MediaType.jpeg, 24, 16),
    );
    final entry = await service.importImage(input, AssetKind.photo);
    try {
      expect(entry.ref.mediaType, MediaType.png);
      expect(entry.ref.width, 24);
      expect(entry.ref.height, 16);
      await service.validateEmbedded(entry.bytes, entry.ref);
      expect(input, before);
    } finally {
      await service.release(entry);
    }
    expect(budget.reservedBytes, 0);
  });
  for (final dimensions in [
    (0xffffffff, 0xffffffff),
    (0x80000000, 0x80000000),
    (0xffffffff, 1),
    (1, 0xffffffff),
    (0x80000000, 1),
    (1, 0x80000000),
  ]) {
    final name = '${dimensions.$1}x${dimensions.$2}';
    test('correction PNG integer domain header refuses $name', () {
      final input = _dimensionPng(dimensions.$1, dimensions.$2);
      final before = Uint8List.fromList(input);
      expect(
        () => ImageHeaderProbe().inspect(input),
        throwsA(
          isA<OperationException>().having(
            (e) => e.code,
            'code',
            ProblemCode.invalidResource,
          ),
        ),
      );
      expect(input, before);
    });
    test(
      'correction PNG integer domain import refuses $name preserving editor and accounting',
      () async {
        await _refusesPreservingEditor(
          _dimensionPng(dimensions.$1, dimensions.$2),
          isA<OperationException>().having(
            (e) => e.code,
            'code',
            ProblemCode.invalidResource,
          ),
        );
      },
    );
  }
  test('correction PNG legitimate pixel cap is typed before decode', () async {
    for (final dimensions in [
      (100000, 100000),
      (0x7fffffff, 1),
      (1, 0x7fffffff),
    ]) {
      final input = _dimensionPng(dimensions.$1, dimensions.$2);
      expect(
        () => ImageHeaderProbe().inspect(input),
        throwsA(isA<CapacityExceeded>()),
      );
      await _refusesPreservingEditor(input, isA<CapacityExceeded>());
    }
  });
  test('correction PNG ordinary supported channels keep real import and embedded verification', () async {
    final budget = WorkBudgetController();
    final service = ResourceService(budget: budget);
    for (final channels in [1, 2, 3, 4]) {
      final input = realPng(channels: channels);
      final before = Uint8List.fromList(input);
      final header = ImageHeaderProbe().inspect(input);
      expect(header.width, 3);
      expect(header.height, 2);
      final entry = await service.importImage(input, AssetKind.photo);
      try {
        await service.validateEmbedded(entry.bytes, entry.ref);
        expect(input, before);
      } finally {
        await service.release(entry);
      }
    }
    expect(budget.reservedBytes, 0);
  });
  test(
    'correction role identities are distinct and same-role imports stable',
    () async {
      final budget = WorkBudgetController();
      final service = ResourceService(budget: budget);
      final input = realPng();
      final before = Uint8List.fromList(input);
      final entries = <ResourceEntry>[];
      try {
        for (final kind in [
          AssetKind.photo,
          AssetKind.logo,
          AssetKind.thumbnail,
          AssetKind.photo,
        ]) {
          entries.add(await service.importImage(input, kind));
        }
        final photo = entries[0],
            logo = entries[1],
            thumbnail = entries[2],
            repeated = entries[3];
        expect({photo.ref.id, logo.ref.id, thumbnail.ref.id}.length, 3);
        expect(_metadata(repeated.ref), _metadata(photo.ref));
        expect(photo.ref.sha256, logo.ref.sha256);
        expect(photo.ref.sha256, thumbnail.ref.sha256);
        expect(photo.bytes, logo.bytes);
        expect(photo.bytes, thumbnail.bytes);
        for (final entry in entries) {
          expect(
            entry.ref.sha256,
            crypto.sha256.convert(entry.bytes).toString(),
          );
          await service.validateEmbedded(entry.bytes, entry.ref);
        }
        expect(input, before);
      } finally {
        for (final entry in entries) {
          await service.release(entry);
        }
      }
      expect(budget.reservedBytes, 0);
    },
  );

  test('correction role identity attaches equal pixels without changing content digest or nonmedia data', () async {
    final budget = WorkBudgetController();
    final service = ResourceService(budget: budget);
    final editor = EditorSession(
      Project.blank(id: 'correction')
          .withHeadline(AppLocale.ptPT, 'Manual headline')
          .withContact(AppLocale.ptPT, 'contact', 'manual@invalid.test'),
      budget: budget,
    );
    final input = realPng();
    final before = Uint8List.fromList(input);
    final entries = <ResourceEntry>[];
    try {
      final photo = await service.importImage(input, AssetKind.photo);
      entries.add(photo);
      final logo = await service.importImage(input, AssetKind.logo);
      entries.add(logo);
      editor.attachResource(photo);
      final prior = editor.bundle;
      editor.attachResource(logo);
      expect(_metadata(editor.project.photo!), _metadata(photo.ref));
      expect(_metadata(editor.project.logo!), _metadata(logo.ref));
      expect(prior.project.logo, isNull);
      final expected = prior.project.withLogo(logo.ref);
      expect(editor.project.toManifest(), expected.toManifest());
      final checked = ProjectBundle(editor.project, editor.bundle.resources);
      expect(checked.resources.keys.toSet(), {photo.ref.id, logo.ref.id});
      expect(checked.resources[photo.ref.id], photo.bytes);
      expect(checked.resources[logo.ref.id], logo.bytes);
      // Logical blob keys remain content-addressed; no storage gateway exists yet.
      expect(
        {
          for (final ref in [photo.ref, logo.ref])
            '${ref.sha256}.${ref.mediaType.name}',
        }.length,
        1,
      );
      for (final entry in entries) {
        expect(entry.ref.sha256, crypto.sha256.convert(entry.bytes).toString());
        await service.validateEmbedded(entry.bytes, entry.ref);
      }
      expect(input, before);
    } finally {
      editor.dispose();
      for (final entry in entries) {
        await service.release(entry);
      }
    }
    expect(budget.reservedBytes, 0);
  });

  test('correction different-pixel logo preserves all photo values and nonmedia manifest', () async {
    final budget = WorkBudgetController();
    final service = ResourceService(budget: budget);
    final editor = EditorSession(
      Project.blank(id: 'different')
          .withHeadline(AppLocale.ptPT, 'Manual headline')
          .withContact(AppLocale.ptPT, 'contact', 'manual@invalid.test'),
      budget: budget,
    );
    final entries = <ResourceEntry>[];
    try {
      final photo = await service.importImage(realPng(), AssetKind.photo);
      entries.add(photo);
      final logo = await service.importImage(realPng(width: 4), AssetKind.logo);
      entries.add(logo);
      expect(logo.ref.sha256, isNot(photo.ref.sha256));
      editor.attachResource(photo);
      final prior = editor.project;
      editor.attachResource(logo);
      expect(_metadata(editor.project.photo!), _metadata(photo.ref));
      expect(_metadata(editor.project.logo!), _metadata(logo.ref));
      expect(
        editor.project.toManifest(),
        prior.withLogo(logo.ref).toManifest(),
      );
      final checked = ProjectBundle(editor.project, editor.bundle.resources);
      expect(checked.resources[photo.ref.id], photo.bytes);
      expect(checked.resources[logo.ref.id], logo.bytes);
    } finally {
      editor.dispose();
      for (final entry in entries) {
        await service.release(entry);
      }
    }
    expect(budget.reservedBytes, 0);
  });
}
