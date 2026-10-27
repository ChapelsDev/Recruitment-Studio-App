import 'dart:ui' as ui;

import 'package:flutter/painting.dart';

import '../../shared/problem.dart';
import '../projects/project.dart';
import 'export_format.dart';

abstract interface class LayoutEngine {
  LayoutScene compose(Project project, AppLocale locale, ExportFormat format);
}

sealed class SceneOp {
  const SceneOp(this.bounds);
  final Rect bounds;
}

final class RectOp extends SceneOp {
  const RectOp(super.bounds, this.color);
  final Color color;
}

final class PhotoOp extends SceneOp {
  const PhotoOp(super.bounds, this.asset, this.sourceRect);
  final AssetRef asset;

  /// Cover crop in original resource pixels; aspect equals destination aspect.
  final Rect sourceRect;
}

final class LogoOp extends SceneOp {
  const LogoOp(super.bounds, this.asset);
  final AssetRef asset;
}

/// A resolved text draw operation owns an immutable recorded picture, never a
/// mutable TextPainter. The painter is disposed immediately after recording.
/// Future consumers call paintTo, without layout/remeasurement. Scene is sole
/// owner: consumers must finish drawing before disposing the scene.
final class TextOp extends SceneOp {
  TextOp({
    required Rect bounds,
    required this.text,
    required this.field,
    this.sectionId,
    required this.family,
    required this.weight,
    required this.fontSize,
    required this.color,
    required Iterable<ui.LineMetrics> lineMetrics,
    required Iterable<Rect> boxes,
    required this._picture,
  }) : lineMetrics = List.unmodifiable(lineMetrics),
       boxes = List.unmodifiable(boxes),
       super(bounds);

  final String text;
  final String field;
  final String? sectionId;
  final String family;
  final int weight;
  final double fontSize;
  final Color color;
  final List<ui.LineMetrics> lineMetrics;
  final List<Rect> boxes;
  final ui.Picture _picture;
  bool _disposed = false;
  bool get isDisposed => _disposed;

  void paintTo(ui.Canvas canvas) {
    if (_disposed) {
      throw StateError('Text scene already disposed');
    }
    canvas.save();
    canvas.translate(bounds.left, bounds.top);
    canvas.drawPicture(_picture);
    canvas.restore();
  }

  void dispose() {
    if (!_disposed) {
      _disposed = true;
      _picture.dispose();
    }
  }
}

final class LayoutScene {
  LayoutScene({
    required this.project,
    required this.locale,
    required this.format,
    required Iterable<String> textRuns,
    required Iterable<SceneOp> ops,
    required Iterable<Problem> problems,
  }) : textRuns = List.unmodifiable(textRuns),
       ops = List.unmodifiable(ops),
       problems = List.unmodifiable(problems),
       textBounds = List.unmodifiable(
         ops.whereType<TextOp>().map((op) => op.bounds),
       );

  final Project project;
  final AppLocale locale;
  final ExportFormat format;
  int get width => format.width;
  int get height => format.height;
  final List<String> textRuns;
  final List<SceneOp> ops;
  final List<Problem> problems;
  final List<Rect> textBounds;
  bool _disposed = false;
  bool get isDisposed => _disposed;

  void dispose() {
    if (!_disposed) {
      _disposed = true;
      for (final op in ops.whereType<TextOp>()) {
        op.dispose();
      }
    }
  }
}
