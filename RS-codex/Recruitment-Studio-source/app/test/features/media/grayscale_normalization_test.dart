import 'dart:io';
import 'dart:typed_data';

import 'package:crypto/crypto.dart' as crypto;
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:recruitment_studio/features/editor/editor_session.dart';
import 'package:recruitment_studio/features/media/image_header_probe.dart';
import 'package:recruitment_studio/features/media/media_worker.dart';
import 'package:recruitment_studio/features/media/resource_service.dart';
import 'package:recruitment_studio/features/projects/project.dart';
import 'package:recruitment_studio/features/projects/project_bundle.dart';
import 'package:recruitment_studio/shared/operation.dart';
import 'package:recruitment_studio/shared/problem.dart';
import 'package:recruitment_studio/shared/work_budget.dart';

import 'media_test_fixtures.dart';

// Independent PNG scanline samples, not decoder channel getters or img encoders.
// Non-square, asymmetric rows include black/white and intermediate luminances.
const _samples = <int, List<List<int>>>{
  0: [
    [30, 0, 255],
    [80, 130, 200],
  ],
  4: [
    [30, 0, 0, 70, 255, 255],
    [80, 1, 130, 128, 200, 254],
  ],
  2: [
    [30, 20, 90, 0, 255, 1, 255, 0, 254],
    [80, 90, 70, 130, 160, 190, 200, 220, 240],
  ],
  6: [
    [30, 20, 90, 0, 0, 255, 1, 70, 255, 0, 254, 255],
    [80, 90, 70, 1, 130, 160, 190, 128, 200, 220, 240, 254],
  ],
};
const _rgba = <int, List<int>>{
  0: [
    30,
    30,
    30,
    255,
    0,
    0,
    0,
    255,
    255,
    255,
    255,
    255,
    80,
    80,
    80,
    255,
    130,
    130,
    130,
    255,
    200,
    200,
    200,
    255,
  ],
  4: [
    30,
    30,
    30,
    0,
    0,
    0,
    0,
    70,
    255,
    255,
    255,
    255,
    80,
    80,
    80,
    1,
    130,
    130,
    130,
    128,
    200,
    200,
    200,
    254,
  ],
  2: [
    30,
    20,
    90,
    255,
    0,
    255,
    1,
    255,
    255,
    0,
    254,
    255,
    80,
    90,
    70,
    255,
    130,
    160,
    190,
    255,
    200,
    220,
    240,
    255,
  ],
  6: [
    30,
    20,
    90,
    0,
    0,
    255,
    1,
    70,
    255,
    0,
    254,
    255,
    80,
    90,
    70,
    1,
    130,
    160,
    190,
    128,
    200,
    220,
    240,
    254,
  ],
};
const _labels = {0: 'opaque-gray', 4: 'gray-alpha', 2: 'RGB', 6: 'RGBA'};

Uint8List _fixture(int color, String shape, {bool private = false}) {
  final compressed = ZLibCodec().encode([
    for (final row in _samples[color]!) ...[0, ...row],
  ]);
  final out = BytesBuilder()..add(pngHeader(3, 2, color: color));
  if (private) {
    out.add(pngChunk('tEXt', 'Comment\u0000private synthetic label'.codeUnits));
  }
  if (shape == '4097-empty-IDAT') {
    for (var i = 0; i < 4097; i++) {
      out.add(pngChunk('IDAT', []));
    }
  }
  if (shape == 'nonempty-fragmented') {
    for (final value in compressed) {
      out.add(pngChunk('IDAT', [value]));
    }
  } else {
    out.add(pngChunk('IDAT', compressed));
  }
  out.add(pngChunk('IEND', []));
  return out.takeBytes();
}

List<(String, Uint8List)> _parts(Uint8List bytes) {
  final view = ByteData.sublistView(bytes);
  return [
    for (var p = 8; p < bytes.length; p += view.getUint32(p) + 12)
      (
        String.fromCharCodes(bytes.sublist(p + 4, p + 8)),
        Uint8List.sublistView(bytes, p + 8, p + 8 + view.getUint32(p)),
      ),
  ];
}

void _assertShape(Uint8List input, String shape) {
  final idats = _parts(input).where((p) => p.$1 == 'IDAT').toList();
  if (shape == '4097-empty-IDAT') {
    expect(idats.where((p) => p.$2.isEmpty).length, 4097);
    expect(idats.where((p) => p.$2.isNotEmpty).length, 1);
  } else if (shape == 'nonempty-fragmented') {
    expect(idats.length, greaterThan(1));
    expect(idats.every((p) => p.$2.length == 1), isTrue);
  } else {
    expect(idats.length, 1);
    expect(idats.single.$2, isNotEmpty);
  }
}

void _assertRaster(Uint8List bytes, List<int> expected) {
  final header = ImageHeaderProbe().inspect(bytes);
  expect(header.width, 3);
  expect(header.height, 2);
  expect(header.channels, 4);
  expect(header.orientation, 1);
  expect(header.hasPrivateMetadata, isFalse);
  expect(_parts(bytes).map((p) => p.$1).toList(), ['IHDR', 'IDAT', 'IEND']);
  final pixels = img.decodePng(bytes)!;
  expect(pixels.width, 3);
  expect(pixels.height, 2);
  expect(pixels.numChannels, 4);
  expect(
    pixels.getBytes(order: img.ChannelOrder.rgba),
    expected,
    reason: 'Every canonical RGBA component at every x/y must be preserved',
  );
}

AssetRef _ref(Uint8List input) => AssetRef(
  id: 'independent-gray',
  kind: AssetKind.photo,
  mediaType: MediaType.png,
  width: 3,
  height: 2,
  sha256: crypto.sha256.convert(input).toString(),
);

void main() {
  for (final color in [0, 4, 2, 6]) {
    for (final shape in [
      'ordinary',
      '4097-empty-IDAT',
      'nonempty-fragmented',
    ]) {
      for (final kind in AssetKind.values) {
        // Separate public-seam tests ensure a resource RED cannot hide preview RED.
        for (final output in ['resource', 'preview']) {
          test(
            'grayscale normalization ${_labels[color]} $shape ${kind.name} $output canonical RGBA',
            () async {
              final input = _fixture(color, shape, private: true);
              final before = Uint8List.fromList(input);
              _assertShape(input, shape);
              final inputHeader = ImageHeaderProbe().inspect(input);
              expect(inputHeader.hasPrivateMetadata, isTrue);
              expect(inputHeader.orientation, 1);
              final budget = WorkBudgetController();
              final phases = <String>[];
              final service = ResourceService(
                budget: budget,
                worker: MediaWorker(onPhase: phases.add),
              );
              final op = WorkOperation.create();
              ResourceEntry? entry;
              try {
                entry = await service.importImage(input, kind, operation: op);
                final preview = service.previewFor(entry);
                expect(input, before);
                expect(entry.ref.kind, kind);
                expect(entry.ref.id, 'media-${kind.name}-${entry.ref.sha256}');
                expect(entry.ref.mediaType, MediaType.png);
                expect(entry.ref.width, 3);
                expect(entry.ref.height, 2);
                expect(
                  entry.ref.sha256,
                  crypto.sha256.convert(entry.bytes).toString(),
                );
                expect(
                  entry.warnings.map((p) => p.code).toList(),
                  kind == AssetKind.photo
                      ? [ProblemCode.insufficientResolution]
                      : <ProblemCode>[],
                );
                expect(
                  budget.reservedBytes,
                  entry.bytes.length + preview.length,
                );
                expect(budget.queuedCount, 0);
                expect(phases.where((p) => p == 'spawned').length, 1);
                expect(phases.where((p) => p == 'drained').length, 1);
                _assertRaster(
                  output == 'resource' ? entry.bytes : preview,
                  _rgba[color]!,
                );
              } finally {
                if (entry != null) {
                  await service.release(entry);
                }
                await op.finish();
                expect(input, before);
                expect(budget.reservedBytes, 0);
                expect(budget.queuedCount, 0);
              }
            },
          );
        }
      }
    }
  }

  for (final shape in ['ordinary', '4097-empty-IDAT', 'nonempty-fragmented']) {
    test(
      'grayscale normalization $shape embedded borrowed lease retains parent ownership',
      () async {
        final input = _fixture(0, shape);
        final before = Uint8List.fromList(input);
        final budget = WorkBudgetController();
        final phases = <(String, int)>[];
        final service = ResourceService(
          budget: budget,
          worker: MediaWorker(
            onPhase: (p) => phases.add((p, budget.reservedBytes)),
          ),
        );
        await service.validateEmbedded(input, _ref(input));
        expect(budget.reservedBytes, 0);
        phases.clear();
        final op = WorkOperation.create();
        final lease = await budget.acquire(op, 7);
        try {
          await service.validateEmbeddedWithLease(
            input,
            _ref(input),
            operation: op,
            lease: lease,
          );
          final verified = phases.where((p) => p.$1 == 'verified').toList();
          expect(verified.length, 1);
          expect(
            verified.single.$2,
            7 +
                input.length * 2 +
                1024 * 1024 +
                mediaAllocationEstimate(
                  ImageHeaderProbe().inspect(input),
                  input.length,
                ),
          );
          expect(budget.reservedBytes, 7);
          expect(budget.queuedCount, 0);
          expect(lease.forChild(op), same(lease));
          expect(input, before);
        } finally {
          lease.release();
          await op.finish();
        }
        expect(budget.reservedBytes, 0);
      },
    );
  }

  for (final refusal in [
    'CRC',
    'truncated-deflate',
    'private-embedded',
    'cancelled',
  ]) {
    test(
      'grayscale normalization $refusal refusal preserves prior editor and accounting',
      () async {
        final valid = _fixture(0, 'ordinary');
        final input = switch (refusal) {
          'CRC' => Uint8List.fromList(valid)..[29] ^= 1,
          'truncated-deflate' => Uint8List.fromList([
            ...pngHeader(3, 2, color: 0),
            ...pngChunk('IDAT', [0x78, 0x9c]),
            ...pngChunk('IEND', []),
          ]),
          'private-embedded' => _fixture(0, 'ordinary', private: true),
          _ => Uint8List.fromList(valid),
        };
        final before = Uint8List.fromList(input);
        final budget = WorkBudgetController();
        final service = ResourceService(budget: budget);
        final editor = EditorSession(
          Project.blank(id: 'prior')
              .withHeadline(AppLocale.ptPT, 'manual headline'),
          budget: budget,
        );
        final op = WorkOperation.create();
        ResourceEntry? entry;
        try {
          entry = await service.importImage(
            _fixture(6, 'ordinary'),
            AssetKind.photo,
          );
          editor.attachResource(entry);
          final manifest = editor.project.toManifest();
          final resources = editor.bundle.resources;
          final retained = budget.reservedBytes;
          if (refusal == 'cancelled') {
            op.cancel();
          }
          final matcher = isA<OperationException>().having(
            (e) => e.code,
            'code',
            refusal == 'cancelled'
                ? ProblemCode.operationCancelled
                : ProblemCode.invalidResource,
          );
          if (refusal == 'private-embedded') {
            await expectLater(
              service.validateEmbedded(input, _ref(input), operation: op),
              throwsA(matcher),
            );
          } else {
            await expectLater(
              service.importImage(input, AssetKind.photo, operation: op),
              throwsA(matcher),
            );
          }
          expect(input, before);
          expect(editor.project.toManifest(), manifest);
          expect(editor.bundle.resources, resources);
          expect(budget.reservedBytes, retained);
          expect(budget.queuedCount, 0);
        } finally {
          await op.finish();
          editor.dispose();
          if (entry != null) {
            await service.release(entry);
          }
        }
        expect(budget.reservedBytes, 0);
      },
    );
  }
}
