import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/shared/operation.dart';
import 'package:recruitment_studio/features/media/image_header_probe.dart';
import 'package:recruitment_studio/shared/problem.dart';
import 'package:recruitment_studio/features/projects/project.dart';

import 'media_test_fixtures.dart';

void main() {
  test('real baseline JPEG and both TIFF endian orientations admit without pixel decode', () {
    final jpeg = realJpeg();
    final plain = ImageHeaderProbe().inspect(jpeg);
    expect([plain.width, plain.height, plain.channels], [24, 16, 3]);
    expect(plain.mediaType, MediaType.jpeg);
    expect(plain.mimeType, 'image/jpeg');
    expect(plain.hasPrivateMetadata, isFalse);
    expect(plain.coefficientBytes, greaterThan(0));
    for (final little in [true, false]) {
      for (var o = 1; o <= 8; o++) {
        final h = ImageHeaderProbe().inspect(
          withExif(jpeg, o, little: little, gps: true),
        );
        expect(h.orientation, o);
        expect(h.hasPrivateMetadata, isTrue);
      }
    }
    expect(
      () => ImageHeaderProbe().inspect(realJpeg(gray: true)),
      returnsNormally,
    );
  });
  test('JPEG refuses truncated trailing multiframe unsupported SOF and malformed TIFF', () {
    final jpeg = realJpeg();
    final unsupported = Uint8List.fromList(jpeg);
    final sof = List.generate(
      jpeg.length - 1,
      (i) => i,
    ).firstWhere((i) => jpeg[i] == 255 && jpeg[i + 1] == 192);
    unsupported[sof + 1] = 194;
    final precision = Uint8List.fromList(jpeg)..[sof + 4] = 12;
    final sampling = Uint8List.fromList(jpeg)..[sof + 11] = 0xff;
    final badExif = withExif(jpeg, 1)..[16] = 255;
    for (final b in [
      Uint8List.fromList(jpeg.take(jpeg.length - 1).toList()),
      Uint8List.fromList([...jpeg, 0]),
      Uint8List.fromList([...jpeg, ...jpeg]),
      unsupported,
      precision,
      sampling,
      badExif,
      withExif(jpeg, 0),
      withExif(jpeg, 9),
    ]) {
      expect(
        () => ImageHeaderProbe().inspect(b),
        throwsA(isA<OperationException>()),
      );
    }
  });
  test('PNG header exposes real MIME dimensions channels and private metadata without decoding', () {
    final h = ImageHeaderProbe().inspect(realPng());
    expect(h.mediaType, MediaType.png);
    expect(h.mimeType, 'image/png');
    expect([h.width, h.height, h.orientation, h.channels], [3, 2, 1, 4]);
    expect(h.isAnimated, isFalse);
    expect(h.hasPrivateMetadata, isFalse);
    expect(
      ImageHeaderProbe()
          .inspect(insertPngChunk(realPng(), 'tEXt', [97, 0, 98]))
          .hasPrivateMetadata,
      isTrue,
    );
  });
  test('real PNG controls admit audited uint8 channel modes', () {
    for (final channels in [1, 2, 3, 4]) {
      expect(
        () => ImageHeaderProbe().inspect(realPng(channels: channels)),
        returnsNormally,
      );
    }
  });
  test('PNG admission refuses broken structure CRC ordering and unbounded auxiliaries', () {
    final png = realPng();
    final badCrc = Uint8List.fromList(png)..[29] ^= 1;
    final badSignature = Uint8List.fromList(png)..[0] = 0;
    for (final bytes in [
      Uint8List(0),
      Uint8List.fromList([1, 2, 3]),
      badCrc,
      badSignature,
      Uint8List.fromList(png.take(png.length - 1).toList()),
      Uint8List.fromList([...png, 0]),
      pngHeader(3, 2),
      pngHeader(0, 2),
      insertPngChunk(png, 'IHDR', png.sublist(16, 29)),
      insertPngChunk(png, 'ABCD', []),
      insertPngChunk(png, 'acTL', List.filled(8, 0)),
      insertPngChunk(png, 'zTXt', [97, 0, 0, 120, 156]),
      insertPngChunk(png, 'iCCP', [97, 0, 0, 120, 156]),
      insertPngChunk(png, 'iTXt', [97, 0, 1, 0, 0, 0]),
      pngHeader(3, 2, depth: 16),
      pngHeader(3, 2, color: 3),
      pngHeader(3, 2, interlace: 1),
    ]) {
      expect(
        () => ImageHeaderProbe().inspect(bytes),
        throwsA(
          isA<OperationException>().having(
            (e) => e.code,
            'safe code',
            ProblemCode.invalidResource,
          ),
        ),
      );
    }
    expect(
      () => ImageHeaderProbe().inspect(
        insertPngChunk(png, 'tEXt', List.filled(1048577, 0)),
      ),
      throwsA(isA<CapacityExceeded>()),
    );
  });
  test('valid CRC 100000 square IHDR refuses before any decoder', () {
    expect(
      () => ImageHeaderProbe().inspect(pngHeader(100000, 100000)),
      throwsA(isA<CapacityExceeded>()),
    );
  });
}
