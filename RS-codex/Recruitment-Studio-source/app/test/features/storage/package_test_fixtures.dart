import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:archive/archive.dart';
import 'package:crypto/crypto.dart';
import 'package:recruitment_studio/features/composition/export_format.dart';
import 'package:recruitment_studio/features/projects/project.dart';
import 'package:recruitment_studio/features/projects/project_bundle.dart';

import '../media/media_test_fixtures.dart';

AssetRef packageRef(
  Uint8List bytes,
  AssetKind kind, {
  String? id,
  int width = 3,
  int height = 2,
  MediaType type = MediaType.png,
}) => AssetRef(
  id: id ?? kind.name,
  kind: kind,
  mediaType: type,
  width: width,
  height: height,
  sha256: sha256.convert(bytes).toString(),
);
String assetPath(AssetRef ref) =>
    'assets/${ref.sha256}.${ref.mediaType == MediaType.png ? 'png' : 'jpg'}';

Future<ProjectBundle> fixtureBundle({bool identicalRoles = false}) async {
  final photo = realPng();
  final logo = identicalRoles ? photo : realPng(width: 4);
  final p = packageRef(photo, AssetKind.photo);
  final l = packageRef(logo, AssetKind.logo, width: identicalRoles ? 3 : 4);
  final locales = AppLocale.values.reversed.toList();
  final project = ImmutableProject(
    id: 't06-rich',
    revision: 107,
    name: 'SYNTHETIC\n É œ ß 😀',
    photo: p,
    logo: l,
    localeOrder: locales,
    contactIds: const ['second', 'first'],
    editions: {
      for (final locale in locales)
        locale: Edition(
          headline: '${locale.code}\n É œ ß 😀',
          location: locale == AppLocale.fr ? '' : ' ${locale.code} ',
          contacts: {'second': '', 'first': '${locale.code}@invalid.test'},
        ),
    },
    sections: [
      for (var n = 0; n < 2; n++)
        Section(
          id: 'section-$n',
          visible: n == 0,
          titleByLocale: {
            for (final locale in locales) locale: '${locale.code} title $n',
          },
          items: [
            for (var i = 0; i < 2; i++)
              SectionItem(
                id: 'item-$i',
                textByLocale: {
                  for (final locale in locales)
                    locale: i == 0 ? '' : '${locale.code}\nitem $n',
                },
              ),
          ],
        ),
    ],
    cropByFormat: {
      for (final f in ExportFormat.values)
        f: NormalizedRect(
          left: f.index * 0.05,
          top: 0.1,
          width: 0.7,
          height: 0.8,
        ),
    },
    style: ProjectStyle(
      ink: 0xff112233,
      accent: 0xffabcdef,
      paper: 0xfffefdfc,
      bodyPx: 34,
      logoScale: 1.7,
    ),
  );
  return ProjectBundle(project, {p.id: photo, l.id: logo});
}

Map<String, Uint8List> packagePayload(
  ProjectBundle bundle, {
  Uint8List? thumbnail,
}) {
  final manifest = bundle.project.toManifest();
  if (thumbnail != null) {
    final ref = packageRef(
      thumbnail,
      AssetKind.thumbnail,
      width: 512,
      height: 512,
    );
    manifest['thumbnailRef'] = {
      'id': ref.id,
      'kind': 'thumbnail',
      'mediaType': 'png',
      'width': ref.width,
      'height': ref.height,
      'sha256': ref.sha256,
    };
  }
  return {
    'manifest.json': Uint8List.fromList(utf8.encode(jsonEncode(manifest))),
    for (final ref in [bundle.project.photo, bundle.project.logo])
      if (ref != null) assetPath(ref): bundle.resources[ref.id]!,
    'thumbnail.png': ?thumbnail,
  };
}

/// Independent ZIP witness builder. No production writer/parser used.
Uint8List packageZip(
  Map<String, Uint8List> entries, {
  bool deflate = false,
  int flags = 0,
  int mode = 0x81a4,
  int? declaredSize,
  String? duplicateName,
  List<int> trailing = const [],
}) {
  final out = BytesBuilder(), central = BytesBuilder();
  var offset = 0;
  final rows = entries.entries.toList();
  if (duplicateName != null) {
    rows.add(MapEntry(duplicateName, Uint8List(0)));
  }
  for (final e in rows) {
    final name = utf8.encode(e.key),
        data = deflate ? ZLibCodec(raw: true).encode(e.value) : e.value;
    final crc = getCrc32(e.value), size = declaredSize ?? e.value.length;
    final local = Uint8List(30 + name.length), lv = ByteData.sublistView(local);
    lv.setUint32(0, 0x04034b50, Endian.little);
    lv.setUint16(4, 20, Endian.little);
    lv.setUint16(6, flags, Endian.little);
    lv.setUint16(8, deflate ? 8 : 0, Endian.little);
    lv.setUint32(14, crc, Endian.little);
    lv.setUint32(18, data.length, Endian.little);
    lv.setUint32(22, size, Endian.little);
    lv.setUint16(26, name.length, Endian.little);
    local.setRange(30, local.length, name);
    final c = Uint8List(46 + name.length), cv = ByteData.sublistView(c);
    cv.setUint32(0, 0x02014b50, Endian.little);
    cv.setUint16(4, 0x314, Endian.little);
    cv.setUint16(6, 20, Endian.little);
    cv.setUint16(8, flags, Endian.little);
    cv.setUint16(10, deflate ? 8 : 0, Endian.little);
    cv.setUint32(16, crc, Endian.little);
    cv.setUint32(20, data.length, Endian.little);
    cv.setUint32(24, size, Endian.little);
    cv.setUint16(28, name.length, Endian.little);
    cv.setUint32(38, mode << 16, Endian.little);
    cv.setUint32(42, offset, Endian.little);
    c.setRange(46, c.length, name);
    out.add(local);
    out.add(data);
    central.add(c);
    offset += local.length + data.length;
  }
  final cd = central.takeBytes(),
      end = Uint8List(22),
      ev = ByteData.sublistView(end);
  ev.setUint32(0, 0x06054b50, Endian.little);
  ev.setUint16(8, rows.length, Endian.little);
  ev.setUint16(10, rows.length, Endian.little);
  ev.setUint32(12, cd.length, Endian.little);
  ev.setUint32(16, offset, Endian.little);
  out.add(cd);
  out.add(end);
  out.add(trailing);
  return out.takeBytes();
}

Future<File> writePackage(Directory root, Uint8List bytes) async =>
    File('${root.path}/input.recruitproj')..writeAsBytesSync(bytes);
Uint8List jsonBytes(String text) => Uint8List.fromList(utf8.encode(text));
Uint8List mutateZip(Uint8List bytes, int offset, int value, {int width = 2}) {
  final result = Uint8List.fromList(bytes), view = ByteData.sublistView(result);
  if (width == 4) {
    view.setUint32(offset, value, Endian.little);
  } else {
    view.setUint16(offset, value, Endian.little);
  }
  return result;
}

int centralOffset(Uint8List bytes) =>
    ByteData.sublistView(bytes).getUint32(bytes.length - 6, Endian.little);
