import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/painting.dart';

import '../../shared/problem.dart';
import '../projects/project.dart';
import 'export_format.dart';
import 'font_catalog.dart';
import 'layout_scene.dart';
import 'variant_validator.dart';

/// Host geometry choices, not native readability/capacity calibration.
final class EditorialRegions {
  const EditorialRegions({
    required this.photo,
    required this.logo,
    required this.headline,
    required this.location,
    required this.content,
    required this.footer,
    required this.contacts,
    required this.headlinePx,
  });
  final Rect photo;
  final Rect logo;
  final Rect headline;
  final Rect location;
  final Rect content;
  final Rect footer;
  final Rect contacts;
  final double headlinePx;

  static EditorialRegions forFormat(ExportFormat format) => switch (format) {
    ExportFormat.square => const EditorialRegions(
      photo: Rect.fromLTWH(620, 0, 460, 676),
      logo: Rect.fromLTWH(48, 32, 524, 72),
      headline: Rect.fromLTWH(48, 140, 524, 410),
      location: Rect.fromLTWH(48, 610, 524, 50),
      content: Rect.fromLTWH(48, 714, 984, 150),
      footer: Rect.fromLTWH(0, 912, 1080, 168),
      contacts: Rect.fromLTWH(48, 944, 984, 104),
      headlinePx: 64,
    ),
    ExportFormat.portrait => const EditorialRegions(
      photo: Rect.fromLTWH(604, 0, 476, 862),
      logo: Rect.fromLTWH(58, 44, 488, 80),
      headline: Rect.fromLTWH(58, 160, 488, 560),
      location: Rect.fromLTWH(58, 780, 488, 58),
      content: Rect.fromLTWH(58, 908, 964, 176),
      footer: Rect.fromLTWH(0, 1142, 1080, 208),
      contacts: Rect.fromLTWH(58, 1184, 964, 124),
      headlinePx: 76,
    ),
    ExportFormat.story => const EditorialRegions(
      photo: Rect.fromLTWH(588, 0, 492, 1152),
      logo: Rect.fromLTWH(64, 120, 460, 100),
      headline: Rect.fromLTWH(64, 288, 460, 656),
      location: Rect.fromLTWH(64, 1018, 460, 82),
      content: Rect.fromLTWH(64, 1212, 952, 372),
      footer: Rect.fromLTWH(0, 1660, 1080, 260),
      contacts: Rect.fromLTWH(64, 1700, 952, 124),
      headlinePx: 82,
    ),
  };
}

final class EditorialLayout implements LayoutEngine {
  EditorialLayout({FontCatalog? fonts}) : fonts = fonts ?? FontCatalog.bundled;
  final FontCatalog fonts;

  @override
  LayoutScene compose(Project project, AppLocale locale, ExportFormat format) {
    final regions = EditorialRegions.forFormat(format);
    final edition = project.edition(locale);
    final style = project.style;
    final runs = <String>[];
    final problems = [
      ...VariantValidator.contentProblems(project, locale, format),
    ];
    void diagnostic(
      ProblemCode code,
      String field,
      String? sectionId,
      String action,
    ) {
      problems.add(
        Problem(
          code: code,
          severity: ProblemSeverity.error,
          locale: locale,
          format: format,
          sectionId: sectionId,
          field: field,
          actionLabel: action,
        ),
      );
    }

    final paper = Color.alphaBlend(Color(style.paper), const Color(0xffffffff));
    final footer = Color.alphaBlend(Color(style.accent), paper);
    final ops = <SceneOp>[
      RectOp(Rect.fromLTWH(0, 0, 1080, format.height.toDouble()), paper),
      RectOp(regions.footer, footer),
    ];
    final photo = project.photo;
    if (photo != null) {
      final crop = project.cropByFormat[format];
      final raw = crop == null
          ? Rect.fromLTWH(0, 0, photo.width.toDouble(), photo.height.toDouble())
          : Rect.fromLTWH(
              crop.left * photo.width,
              crop.top * photo.height,
              crop.width * photo.width,
              crop.height * photo.height,
            );
      Rect? source;
      if (raw.isFinite && !raw.isEmpty && raw.width > 0 && raw.height > 0) {
        final factor = math.max(
          regions.photo.width / raw.width,
          regions.photo.height / raw.height,
        );
        if (factor.isFinite && factor > 0) {
          final resolved = Rect.fromCenter(
            center: raw.center,
            width: regions.photo.width / factor,
            height: regions.photo.height / factor,
          );
          if (resolved.isFinite &&
              !resolved.isEmpty &&
              resolved.width > 0 &&
              resolved.height > 0 &&
              (resolved.width / resolved.height -
                          regions.photo.width / regions.photo.height)
                      .abs() <=
                  1e-9 &&
              (resolved.center.dx - raw.center.dx).abs() <= 1e-9 &&
              (resolved.center.dy - raw.center.dy).abs() <= 1e-9 &&
              resolved.left >= raw.left - 1e-9 &&
              resolved.top >= raw.top - 1e-9 &&
              resolved.right <= raw.right + 1e-9 &&
              resolved.bottom <= raw.bottom + 1e-9) {
            source = resolved;
          }
        }
      }
      if (source == null) {
        diagnostic(
          ProblemCode.invalidResource,
          'photo',
          null,
          'Alargar ou repor o recorte da fotografia para obter uma área útil',
        );
      } else {
        ops.add(PhotoOp(regions.photo, photo, source));
        if (source.width < regions.photo.width ||
            source.height < regions.photo.height) {
          problems.add(
            Problem(
              code: ProblemCode.insufficientResolution,
              severity: ProblemSeverity.warning,
              locale: locale,
              format: format,
              field: 'photo',
              actionLabel:
                  'Escolher fotografia com mais resolução ou alargar o recorte; ${source.width.toStringAsFixed(0)}×${source.height.toStringAsFixed(0)} px úteis',
            ),
          );
        }
      }
    }
    final logo = project.logo;
    if (logo != null) {
      final factor = math.min(
        math.min(144 / logo.width, 80 / logo.height) * style.logoScale,
        math.min(
          regions.logo.width / logo.width,
          regions.logo.height / logo.height,
        ),
      );
      ops.add(
        LogoOp(
          Rect.fromLTWH(
            regions.logo.left,
            regions.logo.top,
            logo.width * factor,
            logo.height * factor,
          ),
          logo,
        ),
      );
    }
    double add(
      String text,
      Rect region, {
      String family = 'DM Sans',
      int weight = 400,
      double? size,
      Color? color,
      required String field,
      String? sectionId,
    }) {
      if (text.trim().isEmpty) {
        return 0;
      }
      runs.add(text);
      final unsupported = fonts.face(family, weight).unsupported(text);
      if (unsupported.isNotEmpty) {
        diagnostic(
          ProblemCode.unsupportedGlyph,
          field,
          sectionId,
          'Editar os caracteres sem glifo local: ${unsupported.map((r) => 'U+${r.toRadixString(16).toUpperCase()}').join(', ')}',
        );
        return 0;
      }
      final painter = TextPainter(
        text: TextSpan(
          text: text,
          style: TextStyle(
            fontFamily: family,
            fontWeight: FontWeight.values[weight ~/ 100 - 1],
            fontSize: size ?? style.bodyPx.toDouble(),
            color: color ?? Color(style.ink),
            height: 1.2,
          ),
        ),
        textDirection: TextDirection.ltr,
        textScaler: TextScaler.noScaling,
      )..layout(maxWidth: region.width);
      final bounds = Rect.fromLTWH(
        region.left,
        region.top,
        painter.width,
        painter.height,
      );
      final lines = painter.computeLineMetrics();
      final boxes = painter
          .getBoxesForSelection(
            TextSelection(baseOffset: 0, extentOffset: text.length),
          )
          .map((box) => box.toRect().shift(region.topLeft))
          .toList();
      final height = painter.height;
      if (bounds.bottom > region.bottom + 0.001 ||
          lines.any((line) => line.width > region.width + 0.001) ||
          boxes.any(
            (box) =>
                box.left < region.left - 0.001 ||
                box.right > region.right + 0.001 ||
                box.bottom > region.bottom + 0.001,
          )) {
        diagnostic(
          ProblemCode.textOverflow,
          field,
          sectionId,
          'Editar/ocultar/reordenar o bloco ou mudar formato; área ${region.width.toStringAsFixed(1)}×${region.height.toStringAsFixed(1)} px, texto ${bounds.width.toStringAsFixed(1)}×${height.toStringAsFixed(1)} px',
        );
        painter.dispose();
        return height;
      }
      final recorder = ui.PictureRecorder();
      painter.paint(ui.Canvas(recorder), Offset.zero);
      final picture = recorder.endRecording();
      ops.add(
        TextOp(
          bounds: bounds,
          text: text,
          field: field,
          sectionId: sectionId,
          family: family,
          weight: weight,
          fontSize: size ?? style.bodyPx.toDouble(),
          color: color ?? Color(style.ink),
          lineMetrics: lines,
          boxes: boxes,
          picture: picture,
        ),
      );
      painter.dispose();
      return height;
    }

    add(
      edition.headline,
      regions.headline,
      family: 'DM Serif Display',
      size: regions.headlinePx,
      field: 'headline',
    );
    add(edition.location, regions.location, field: 'location');
    var y = regions.content.top;
    for (final section in project.sections.where((s) => s.visible)) {
      final title = section.title(locale);
      y += add(
        title,
        Rect.fromLTWH(
          regions.content.left,
          y,
          regions.content.width,
          math.max(0, regions.content.bottom - y),
        ),
        size: style.bodyPx * 0.72,
        weight: 600,
        field: 'title',
        sectionId: section.id,
      );
      for (final item in section.items) {
        y += add(
          item.text(locale),
          Rect.fromLTWH(
            regions.content.left,
            y,
            regions.content.width,
            math.max(0, regions.content.bottom - y),
          ),
          field: 'item:${item.id}',
          sectionId: section.id,
        );
      }
      if (title.trim().isNotEmpty ||
          section.items.any((i) => i.text(locale).trim().isNotEmpty)) {
        y += 16;
      }
    }
    y = regions.contacts.top;
    for (final id in project.contactIds) {
      y += add(
        edition.contacts[id]!,
        Rect.fromLTWH(
          regions.contacts.left,
          y,
          regions.contacts.width,
          math.max(0, regions.contacts.bottom - y),
        ),
        color: const Color(0xffffffff),
        field: 'contact:$id',
      );
    }
    return LayoutScene(
      project: project,
      locale: locale,
      format: format,
      textRuns: runs,
      ops: ops,
      problems: problems,
    );
  }
}
