import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/painting.dart';
import 'package:recruitment_studio/features/composition/layout_scene.dart';
import 'package:recruitment_studio/features/composition/export_format.dart';
import 'package:recruitment_studio/features/projects/project.dart';

const manualHeadlines = {
  AppLocale.ptPT: 'Equipa São João\nOfício e precisão',
  AppLocale.en: 'Craft and care\nRiverstone team',
  AppLocale.fr: 'Équipe œuvre\nSavoir-faire',
  AppLocale.it: 'Squadra qualità\nArte e mestiere',
  AppLocale.deDE: 'Zürich Straße\nPräzision',
  AppLocale.deCH: 'Zürich Müller\nHandwerk',
  AppLocale.es: 'Equipo José\nOficio y calidad',
};

Project compositionFixture({ProjectStyle? style}) {
  return ImmutableProject(
    id: 'synthetic-t04',
    name: 'INTERNAL NEVER PUBLISH',
    style: style,
    photo: AssetRef(
      id: 'synthetic-photo',
      kind: AssetKind.photo,
      mediaType: MediaType.png,
      width: 1800,
      height: 2400,
      sha256: '0' * 64,
    ),
    logo: AssetRef(
      id: 'synthetic-logo',
      kind: AssetKind.logo,
      mediaType: MediaType.png,
      width: 240,
      height: 80,
      sha256: '1' * 64,
    ),
    cropByFormat: {
      for (final f in ExportFormat.values)
        f: NormalizedRect(left: 0.1, top: 0.1, width: 0.8, height: 0.8),
    },
    localeOrder: AppLocale.values,
    contactIds: const ['mail'],
    editions: {
      for (final l in AppLocale.values)
        l: Edition(
          headline: manualHeadlines[l]!,
          location: 'São João – Zürich',
          contacts: {'mail': '${l.code}@invalid.test'},
        ),
    },
    sections: [
      Section(
        id: 'practice',
        titleByLocale: {for (final l in AppLocale.values) l: 'Prática œuvre'},
        items: [
          SectionItem(
            id: 'item-a',
            textByLocale: {
              for (final l in AppLocale.values) l: 'Müller-São João',
            },
          ),
          SectionItem(
            id: 'item-b',
            textByLocale: {
              for (final l in AppLocale.values) l: 'Ética e precisão',
            },
          ),
        ],
      ),
    ],
  );
}

List<double> _rect(Rect r) => [r.left, r.top, r.width, r.height];

/// Synthetic host development evidence only. Never a T05 renderer, native
/// screenshot, production company content or an automatically approved golden.
Map<String, Object?> sceneEvidence(LayoutScene scene) => {
  'evidenceKind': 'T04 synthetic resolved scene; development only; not T05/native/export approval',
  'width': scene.width,
  'height': scene.height,
  'locale': scene.locale.code,
  'format': scene.format.name,
  'modelVersion': scene.project.modelVersion,
  'textRuns': scene.textRuns,
  'textBounds': scene.textBounds.map(_rect).toList(),
  'problems': [
    for (final p in scene.problems)
      {
        'code': p.code.name,
        'severity': p.severity.name,
        'locale': p.locale?.code,
        'format': p.format?.name,
        'sectionId': p.sectionId,
        'field': p.field,
        'action': p.actionLabel,
      },
  ],
  'ops': [
    for (final op in scene.ops)
      {
        'kind': op.runtimeType.toString(),
        'bounds': _rect(op.bounds),
        if (op is RectOp) 'color': op.color.toARGB32(),
        if (op is PhotoOp) 'sourceRect': _rect(op.sourceRect),
        if (op is PhotoOp) 'assetId': op.asset.id,
        if (op is LogoOp) 'assetId': op.asset.id,
        if (op is TextOp) ...{
          'text': op.text,
          'field': op.field,
          'sectionId': op.sectionId,
          'family': op.family,
          'weight': op.weight,
          'fontSize': op.fontSize,
          'color': op.color.toARGB32(),
          'boxes': op.boxes.map(_rect).toList(),
          'lines': [
            for (final m in op.lineMetrics)
              {
                'number': m.lineNumber,
                'width': m.width,
                'height': m.height,
                'baseline': m.baseline,
                'ascent': m.ascent,
                'descent': m.descent,
                'left': m.left,
                'hardBreak': m.hardBreak,
              },
          ],
        },
      },
  ],
};

Future<ui.Image> _syntheticImage(bool logo) async {
  final recorder = ui.PictureRecorder();
  final canvas = ui.Canvas(recorder);
  final width = logo ? 240 : 1800;
  final height = logo ? 80 : 2400;
  if (logo) {
    canvas.drawRect(
      const Rect.fromLTWH(0, 8, 52, 64),
      Paint()..color = const Color(0xff205b50),
    );
    canvas.drawRect(
      const Rect.fromLTWH(68, 18, 172, 14),
      Paint()..color = const Color(0xff173e38),
    );
    canvas.drawRect(
      const Rect.fromLTWH(68, 48, 136, 10),
      Paint()..color = const Color(0xff626b63),
    );
  } else {
    canvas.drawRect(
      const Rect.fromLTWH(0, 0, 1800, 2400),
      Paint()..color = const Color(0xffb7c9c4),
    );
    for (var y = 0; y < height; y += 200) {
      for (var x = 0; x < width; x += 200) {
        canvas.drawRect(
          Rect.fromLTWH(x.toDouble(), y.toDouble(), 196, 196),
          Paint()..color = Color((x + y) % 400 == 0 ? 0xffd2c6ae : 0xff77968f),
        );
      }
    }
    canvas.drawCircle(
      const Offset(1050, 650),
      250,
      Paint()..color = const Color(0xfff4f1e9),
    );
    canvas.drawRect(
      const Rect.fromLTWH(760, 900, 580, 1380),
      Paint()..color = const Color(0xff205b50),
    );
  }
  final picture = recorder.endRecording();
  try {
    return await picture.toImage(width, height);
  } finally {
    picture.dispose();
  }
}

/// Test-only bounded drawer: text consumes TextOp.paintTo's recorded picture,
/// never a TextPainter. Photo/logo pixels are synthetic and generated locally.
Future<Uint8List> developmentPreview(LayoutScene scene) async {
  final photo = await _syntheticImage(false);
  final logo = await _syntheticImage(true);
  final recorder = ui.PictureRecorder();
  final canvas = ui.Canvas(recorder);
  for (final op in scene.ops) {
    switch (op) {
      case RectOp():
        canvas.drawRect(op.bounds, Paint()..color = op.color);
      case PhotoOp():
        canvas.drawImageRect(photo, op.sourceRect, op.bounds, Paint());
      case LogoOp():
        canvas.drawImageRect(
          logo,
          const Rect.fromLTWH(0, 0, 240, 80),
          op.bounds,
          Paint(),
        );
      case TextOp():
        op.paintTo(canvas);
    }
  }
  final picture = recorder.endRecording();
  try {
    final image = await picture.toImage(scene.width, scene.height);
    try {
      final bytes = (await image.toByteData(format: ui.ImageByteFormat.png))!;
      return Uint8List.fromList(
        bytes.buffer.asUint8List(bytes.offsetInBytes, bytes.lengthInBytes),
      );
    } finally {
      image.dispose();
    }
  } finally {
    picture.dispose();
    photo.dispose();
    logo.dispose();
  }
}
