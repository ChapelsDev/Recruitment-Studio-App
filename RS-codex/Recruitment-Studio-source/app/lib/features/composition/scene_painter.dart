import 'dart:ui' as ui;

import 'package:flutter/rendering.dart';

import '../../shared/operation.dart';
import '../../shared/problem.dart';
import 'layout_scene.dart';

/// The caller owns the scene and supplied UI images. They must remain live and
/// the map must not be mutated while painting. Nothing is decoded, measured,
/// disposed or retained across frames here: preview and export borrow the same
/// resolved TextOp pictures and logical geometry. An aspect-preserving viewport
/// is required; the caller may letterbox outside CustomPaint if needed.
final class ScenePainter extends CustomPainter {
  ScenePainter({required this.scene, required this.images});
  final LayoutScene scene;
  final Map<String, ui.Image> images;

  @override
  void paint(ui.Canvas canvas, ui.Size size) {
    if (!size.width.isFinite ||
        !size.height.isFinite ||
        size.width <= 0 ||
        size.height <= 0 ||
        (size.width / size.height - scene.width / scene.height).abs() > 1e-9) {
      throw const OperationException(ProblemCode.invalidSelection);
    }
    if (scene.isDisposed ||
        scene.ops.isEmpty ||
        scene.problems.any((p) => p.severity == ProblemSeverity.error)) {
      throw const OperationException(ProblemCode.invalidResource);
    }
    final background = scene.ops.first;
    if (background is! RectOp ||
        background.color.a != 1 ||
        background.bounds !=
            ui.Rect.fromLTWH(
              0,
              0,
              scene.width.toDouble(),
              scene.height.toDouble(),
            )) {
      throw const OperationException(ProblemCode.invalidResource);
    }
    // Validate every borrow before producing any draw commands.
    for (final op in scene.ops) {
      if (!op.bounds.isFinite ||
          op.bounds.isEmpty ||
          op.bounds.left < 0 ||
          op.bounds.top < 0 ||
          op.bounds.right > scene.width ||
          op.bounds.bottom > scene.height ||
          (op is TextOp && op.isDisposed)) {
        throw const OperationException(ProblemCode.invalidResource);
      }
      if (op is PhotoOp || op is LogoOp) {
        final asset = op is PhotoOp ? op.asset : (op as LogoOp).asset;
        final image = images[asset.id];
        if (image == null ||
            image.width != asset.width ||
            image.height != asset.height) {
          throw const OperationException(ProblemCode.invalidResource);
        }
        // dart:ui has no release-mode disposed getter. The draw is guarded below
        // in release; in debug refuse a dead borrow even before drawing.
        var disposed = false;
        assert(() {
          disposed = image.debugDisposed;
          return true;
        }());
        if (disposed) {
          throw const OperationException(ProblemCode.invalidResource);
        }
        if (op is PhotoOp &&
            (!op.sourceRect.isFinite ||
                op.sourceRect.isEmpty ||
                op.sourceRect.left < -1e-9 ||
                op.sourceRect.top < -1e-9 ||
                op.sourceRect.right > image.width + 1e-9 ||
                op.sourceRect.bottom > image.height + 1e-9 ||
                (op.sourceRect.width / op.sourceRect.height -
                            op.bounds.width / op.bounds.height)
                        .abs() >
                    1e-9)) {
          throw const OperationException(ProblemCode.invalidResource);
        }
        if (op is LogoOp &&
            (op.bounds.width / op.bounds.height - image.width / image.height)
                    .abs() >
                1e-9) {
          throw const OperationException(ProblemCode.invalidResource);
        }
      }
    }
    canvas.save();
    try {
      canvas.scale(size.width / scene.width, size.height / scene.height);
      final paint = ui.Paint()..filterQuality = ui.FilterQuality.high;
      for (final op in scene.ops) {
        switch (op) {
          case RectOp():
            canvas.drawRect(op.bounds, ui.Paint()..color = op.color);
          case PhotoOp():
            canvas.drawImageRect(
              images[op.asset.id]!,
              op.sourceRect,
              op.bounds,
              paint,
            );
          case LogoOp():
            canvas.drawImageRect(
              images[op.asset.id]!,
              ui.Rect.fromLTWH(
                0,
                0,
                op.asset.width.toDouble(),
                op.asset.height.toDouble(),
              ),
              op.bounds,
              paint,
            );
          case TextOp():
            op.paintTo(canvas);
        }
      }
    } on OperationException {
      rethrow;
    } catch (_) {
      throw const OperationException(ProblemCode.invalidResource);
    } finally {
      canvas.restore();
    }
  }

  @override
  bool shouldRepaint(covariant ScenePainter oldDelegate) =>
      !identical(scene, oldDelegate.scene) ||
      !identical(images, oldDelegate.images);
}
