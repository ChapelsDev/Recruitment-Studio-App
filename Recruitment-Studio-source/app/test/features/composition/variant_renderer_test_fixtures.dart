import 'dart:convert';
import 'dart:io';
import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:crypto/crypto.dart';
import 'package:flutter/painting.dart';
import 'package:image/image.dart' as img;
import 'package:recruitment_studio/features/composition/export_format.dart';
import 'package:recruitment_studio/features/projects/project.dart';
import 'package:recruitment_studio/features/projects/project_bundle.dart';

// Explicit test-only manual content. No production defaults/translations.
const rendererHeadlines = {
  AppLocale.ptPT: 'Equipa São João\nOfício e precisão',
  AppLocale.en: 'Craft and care\nRiverstone team',
  AppLocale.fr: 'Équipe œuvre\nSavoir-faire',
  AppLocale.it: 'Squadra qualità\nArte e mestiere',
  AppLocale.deDE: 'Zürich Straße\nPräzision',
  AppLocale.deCH: 'Zürich Müller\nHandwerk',
  AppLocale.es: 'Equipo José\nOficio y calidad',
};
const photoColors = [
  [176, 80, 52],
  [47, 120, 94],
  [62, 87, 170],
  [201, 156, 57],
];
const logoColor = [40, 62, 180];

ProjectBundle rendererFixture({
  bool jpegPhoto = false,
  bool small = false,
  bool corrupt = false,
  bool wrongDimensions = false,
  bool wrongType = false,
  bool alternativeLogo = false,
}) {
  final width = small ? 60 : 600;
  final height = small ? 80 : 800;
  final photo = img.Image(width: width, height: height, numChannels: 3);
  for (var y = 0; y < height; y++) {
    for (var x = 0; x < width; x++) {
      final c =
          photoColors[(y < height ~/ 2 ? 0 : 2) + (x < width ~/ 2 ? 0 : 1)];
      photo.setPixelRgb(x, y, c[0], c[1], c[2]);
    }
  }
  final pb = corrupt
      ? Uint8List.fromList([1, 2, 3, 4])
      : jpegPhoto
      ? img.encodeJpg(photo, quality: 95)
      : img.encodePng(photo);
  final logo = img.Image(width: 240, height: 80, numChannels: 4);
  for (var y = 10; y < 70; y++) {
    for (var x = 40; x < 200; x++) {
      logo.setPixelRgba(
        x,
        y,
        alternativeLogo ? 195 : logoColor[0],
        logoColor[1],
        logoColor[2],
        255,
      );
    }
  }
  final lb = img.encodePng(logo);
  final p = AssetRef(
    id: 't05-photo',
    kind: AssetKind.photo,
    mediaType: wrongType
        ? MediaType.jpeg
        : jpegPhoto
        ? MediaType.jpeg
        : MediaType.png,
    width: wrongDimensions ? width + 1 : width,
    height: height,
    sha256: sha256.convert(pb).toString(),
  );
  final l = AssetRef(
    id: 't05-logo',
    kind: AssetKind.logo,
    mediaType: MediaType.png,
    width: 240,
    height: 80,
    sha256: sha256.convert(lb).toString(),
  );
  final project = ImmutableProject(
    id: 't05-manual',
    name: 'INTERNAL NEVER PUBLISH',
    photo: p,
    logo: l,
    localeOrder: AppLocale.values,
    contactIds: const ['mail'],
    editions: {
      for (final locale in AppLocale.values)
        locale: Edition(
          headline: rendererHeadlines[locale]!,
          location: 'São João – Zürich',
          contacts: {'mail': '${locale.code}@invalid.test'},
        ),
    },
    sections: [
      Section(
        id: 'craft',
        titleByLocale: {for (final l in AppLocale.values) l: 'Prática œuvre'},
        items: [
          SectionItem(
            id: 'a',
            textByLocale: {
              for (final l in AppLocale.values) l: 'Müller-São João',
            },
          ),
        ],
      ),
    ],
  );
  return ProjectBundle(project, {p.id: pb, l.id: lb});
}

String bundleFingerprint(ProjectBundle bundle) => jsonEncode({
  'project': bundle.project.toManifest(),
  'resources': {
    for (final e in bundle.resources.entries)
      e.key: sha256.convert(e.value).toString(),
  },
});

// Independent approved-layout coordinates and cover oracle. Never calls painter.
Rect oraclePhoto(ExportFormat f) => switch (f) {
  ExportFormat.square => const Rect.fromLTWH(620, 0, 460, 676),
  ExportFormat.portrait => const Rect.fromLTWH(604, 0, 476, 862),
  ExportFormat.story => const Rect.fromLTWH(588, 0, 492, 1152),
};
Offset oracleLogo(ExportFormat f) => switch (f) {
  ExportFormat.square => const Offset(48, 32),
  ExportFormat.portrait => const Offset(58, 44),
  ExportFormat.story => const Offset(64, 120),
};
int oracleFooter(ExportFormat f) => switch (f) {
  ExportFormat.square => 912,
  ExportFormat.portrait => 1142,
  ExportFormat.story => 1660,
};
List<int> oraclePhotoColor(Project p, ExportFormat f, double dx, double dy) {
  final dest = oraclePhoto(f);
  final photo = p.photo!;
  final crop = p.cropByFormat[f];
  final left = (crop?.left ?? 0) * photo.width;
  final top = (crop?.top ?? 0) * photo.height;
  final width = (crop?.width ?? 1) * photo.width;
  final height = (crop?.height ?? 1) * photo.height;
  final scale = math.max(dest.width / width, dest.height / height);
  final sx = left + width / 2 + (dx - .5) * dest.width / scale;
  final sy = top + height / 2 + (dy - .5) * dest.height / scale;
  return photoColors[(sy < photo.height / 2 ? 0 : 2) +
      (sx < photo.width / 2 ? 0 : 1)];
}

Future<ui.Image> fixtureUiImage(Uint8List bytes) async {
  final codec = await ui.instantiateImageCodec(bytes);
  try {
    return (await codec.getNextFrame()).image;
  } finally {
    codec.dispose();
  }
}

Future<Uint8List> raster(ui.Picture picture, int w, int h) async {
  final image = await picture.toImage(w, h);
  try {
    final b = (await image.toByteData(format: ui.ImageByteFormat.png))!;
    return b.buffer.asUint8List(b.offsetInBytes, b.lengthInBytes);
  } finally {
    image.dispose();
  }
}

void saveRendererArtifact(
  String name,
  Uint8List bytes,
  Map<String, Object?> metadata,
) {
  final path = Platform.environment['T05_EVIDENCE_DIR'];
  if (path == null) {
    return;
  }
  final dir = Directory(path)..createSync(recursive: true);
  File('${dir.path}/$name').writeAsBytesSync(bytes, flush: true);
  File('${dir.path}/$name.json').writeAsStringSync(
    jsonEncode({
      ...metadata,
      'sha256': sha256.convert(bytes).toString(),
      'bytes': bytes.length,
      'visualApproval': false,
      'evidenceKind': 'real T05 renderer; provisional host image',
    }),
  );
}
