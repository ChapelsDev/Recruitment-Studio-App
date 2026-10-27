import 'dart:typed_data';
import 'dart:io';

import 'package:archive/archive.dart';
import 'package:image/image.dart' as img;

Uint8List realPng({int width = 3, int height = 2, int channels = 4}) {
  final pixels = img.Image(width: width, height: height, numChannels: channels);
  for (var y = 0; y < height; y++) {
    for (var x = 0; x < width; x++) {
      pixels.setPixelRgba(x, y, 30 + x * 50, 20 + y * 70, 90, 70 + x * 60);
    }
  }
  return img.encodePng(pixels);
}

Uint8List insertPngChunk(Uint8List bytes, String type, List<int> data) =>
    Uint8List.fromList([
      ...bytes.take(33),
      ...pngChunk(type, data),
      ...bytes.skip(33),
    ]);

Uint8List realJpeg({
  int width = 24,
  int height = 16,
  bool gray = false,
  img.JpegChroma chroma = img.JpegChroma.yuv444,
}) {
  final pixels = img.Image(
    width: width,
    height: height,
    numChannels: gray ? 1 : 3,
  );
  for (var y = 0; y < height; y++) {
    for (var x = 0; x < width; x++) {
      pixels.setPixelRgb(
        x,
        y,
        x < width ~/ 2 ? 230 : 20,
        y < height ~/ 2 ? 220 : 20,
        x < width ~/ 2 ? 15 : 220,
      );
    }
  }
  return img.encodeJpg(pixels, quality: 100, chroma: chroma);
}

Uint8List jpegSegment(int marker, List<int> data) {
  final out = Uint8List(data.length + 4);
  out[0] = 255;
  out[1] = marker;
  ByteData.sublistView(out).setUint16(2, data.length + 2);
  out.setRange(4, out.length, data);
  return out;
}

Uint8List withExif(
  Uint8List jpeg,
  int orientation, {
  bool little = true,
  bool gps = false,
}) {
  final tiff = Uint8List(gps ? 44 : 26);
  final endian = little ? Endian.little : Endian.big;
  tiff[0] = tiff[1] = little ? 73 : 77;
  final v = ByteData.sublistView(tiff);
  v.setUint16(2, 42, endian);
  v.setUint32(4, 8, endian);
  v.setUint16(8, gps ? 2 : 1, endian);
  v.setUint16(10, 0x112, endian);
  v.setUint16(12, 3, endian);
  v.setUint32(14, 1, endian);
  v.setUint16(18, orientation, endian);
  if (gps) {
    v.setUint16(22, 0x8825, endian);
    v.setUint16(24, 4, endian);
    v.setUint32(26, 1, endian);
    v.setUint32(30, 38, endian);
  }
  return Uint8List.fromList([
    255,
    216,
    ...jpegSegment(225, [69, 120, 105, 102, 0, 0, ...tiff]),
    ...jpeg.skip(2),
  ]);
}

Uint8List pngWithRaw(
  List<int> raw, {
  int width = 1,
  int height = 1,
  int level = 6,
  int strategy = 0,
}) => Uint8List.fromList([
  ...pngHeader(width, height),
  ...pngChunk('IDAT', ZLibCodec(level: level, strategy: strategy).encode(raw)),
  ...pngChunk('IEND', []),
]);

Uint8List pngChunk(String type, List<int> data) {
  final out = Uint8List(data.length + 12);
  ByteData.sublistView(out).setUint32(0, data.length);
  out.setRange(4, 8, type.codeUnits);
  out.setRange(8, 8 + data.length, data);
  ByteData.sublistView(out).setUint32(
    out.length - 4,
    getCrc32(Uint8List.sublistView(out, 4, out.length - 4)),
  );
  return out;
}

Uint8List pngHeader(
  int width,
  int height, {
  int depth = 8,
  int color = 6,
  int interlace = 0,
}) {
  final ihdr = Uint8List(13);
  final view = ByteData.sublistView(ihdr);
  view.setUint32(0, width);
  view.setUint32(4, height);
  ihdr[8] = depth;
  ihdr[9] = color;
  ihdr[12] = interlace;
  return Uint8List.fromList([
    137,
    80,
    78,
    71,
    13,
    10,
    26,
    10,
    ...pngChunk('IHDR', ihdr),
  ]);
}
