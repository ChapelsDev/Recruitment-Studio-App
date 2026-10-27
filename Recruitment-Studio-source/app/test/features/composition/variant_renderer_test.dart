import 'dart:async';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/painting.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:recruitment_studio/features/composition/editorial_layout.dart';
import 'package:recruitment_studio/features/composition/export_format.dart';
import 'package:recruitment_studio/features/composition/font_catalog.dart';
import 'package:recruitment_studio/features/composition/layout_scene.dart';
import 'package:recruitment_studio/features/composition/scene_painter.dart';
import 'package:recruitment_studio/features/composition/variant_renderer.dart';
import 'package:recruitment_studio/features/projects/project.dart';
import 'package:recruitment_studio/features/projects/project_bundle.dart';
import 'package:recruitment_studio/shared/operation.dart';
import 'package:recruitment_studio/shared/problem.dart';
import 'package:recruitment_studio/shared/work_budget.dart';
import 'package:recruitment_studio/shared/work_limits.dart';

import 'variant_renderer_test_fixtures.dart';

Matcher refusal(ProblemCode code) =>
    isA<OperationException>().having((e) => e.code, 'code', code);
void pixel(
  img.Image image,
  int x,
  int y,
  List<int> expected, {
  int tolerance = 0,
}) {
  final p = image.getPixel(x, y);
  final actual = [p.r.toInt(), p.g.toInt(), p.b.toInt()];
  for (var i = 0; i < 3; i++) {
    expect(
      actual[i],
      inInclusiveRange(expected[i] - tolerance, expected[i] + tolerance),
      reason: 'pixel ($x,$y), channel $i',
    );
  }
  expect(p.a.toInt(), 255);
}

Future<void> idle() => Future<void>.delayed(Duration.zero);

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late ProjectBundle fixture;
  late ProjectBundle jpegFixture;
  setUpAll(() async {
    await FontCatalog.load();
    fixture = rendererFixture();
    jpegFixture = rendererFixture(jpegPhoto: true);
  });
  for (final format in ExportFormat.values) {
    for (final locale in AppLocale.values) {
      for (final encoding in ImageEncoding.values) {
        test('real ${encoding.name} ${format.name} ${locale.code}', () async {
          final bundle = encoding == ImageEncoding.jpg ? jpegFixture : fixture;
          final before = bundleFingerprint(bundle);
          final budget = WorkBudgetController();
          final events = <String>[];
          final renderer = CanvasVariantRenderer(
            budget: budget,
            testHooks: RendererTestHooks(onEvent: events.add),
          );
          final result = await renderer.render(
            bundle,
            locale,
            format,
            encoding,
          );
          try {
            expect(result.width, 1080);
            expect(result.height, format.height);
            expect(result.locale, locale);
            expect(result.format, format);
            expect(result.encoding, encoding);
            expect(
              result.bytes.length,
              lessThanOrEqualTo(WorkLimits.exportImageBytes),
            );
            expect(() => result.bytes[0] = 0, throwsUnsupportedError);
            final decoded = img.decodeImage(result.bytes)!;
            expect(decoded.width, 1080);
            expect(decoded.height, format.height);
            expect(
              result.bytes.take(encoding == ImageEncoding.png ? 8 : 2).toList(),
              encoding == ImageEncoding.png
                  ? [137, 80, 78, 71, 13, 10, 26, 10]
                  : [255, 216],
            );
            final tolerance = encoding == ImageEncoding.png ? 0 : 8;
            pixel(decoded, 10, 10, [244, 241, 233], tolerance: tolerance);
            pixel(decoded, 10, oracleFooter(format) + 8, [
              32,
              91,
              80,
            ], tolerance: tolerance);
            final r = oraclePhoto(format);
            for (final dx in [.25, .75]) {
              for (final dy in [.25, .75]) {
                pixel(
                  decoded,
                  (r.left + r.width * dx).toInt(),
                  (r.height * dy).toInt(),
                  oraclePhotoColor(bundle.project, format, dx, dy),
                  tolerance: tolerance,
                );
              }
            }
            final logo = oracleLogo(format);
            pixel(decoded, logo.dx.toInt() + 3, logo.dy.toInt() + 3, [
              244,
              241,
              233,
            ], tolerance: tolerance);
            pixel(
              decoded,
              logo.dx.toInt() + 72,
              logo.dy.toInt() + 24,
              logoColor,
              tolerance: tolerance,
            );
            final scene = EditorialLayout().compose(
              bundle.project,
              locale,
              format,
            );
            try {
              expect(scene.textRuns, [
                rendererHeadlines[locale]!,
                'São João – Zürich',
                'Prática œuvre',
                'Müller-São João',
                '${locale.code}@invalid.test',
              ]);
              expect(
                scene.textRuns.join(),
                isNot(contains('INTERNAL NEVER PUBLISH')),
              );
              expect(
                scene.problems.where(
                  (p) => p.severity == ProblemSeverity.error,
                ),
                isEmpty,
              );
              expect(
                scene.ops.whereType<TextOp>().every((t) => !t.isDisposed),
                isTrue,
              );
            } finally {
              scene.dispose();
            }
            expect(events.where((e) => e == 'sourceImageDisposed').length, 2);
            expect(
              events,
              containsAll([
                'sceneDisposed',
                'pictureDisposed',
                'rasterDisposed',
                'resultTransferred',
              ]),
            );
            if (encoding == ImageEncoding.jpg) {
              expect(events, containsAll(['workerStarted', 'workerExited']));
            }
            expect(budget.reservedBytes, result.bytes.length);
            if (locale == AppLocale.ptPT || locale == AppLocale.deDE) {
              saveRendererArtifact(
                '${format.name}-${locale.code}.${encoding.name}',
                result.bytes,
                {
                  'format': format.name,
                  'locale': locale.code,
                  'encoding': encoding.name,
                  'width': result.width,
                  'height': result.height,
                  'bundleFingerprint': before,
                  'manualHeadline': rendererHeadlines[locale],
                  'jpgQuality': 95,
                },
              );
            }
          } finally {
            await result.dispose();
          }
          await idle();
          expect(budget.reservedBytes, 0);
          expect(budget.queuedCount, 0);
          expect(bundleFingerprint(bundle), before);
        });
      }
    }
  }

  test('shared painter preview export uses immutable resolved text and resources', () async {
    final scene = EditorialLayout().compose(
      fixture.project,
      AppLocale.ptPT,
      ExportFormat.square,
    );
    final originalRuns = scene.textRuns.toList();
    final originalBounds = scene.textBounds.toList();
    final images = <String, ui.Image>{};
    for (final e in fixture.resources.entries) {
      images[e.key] = await fixtureUiImage(e.value);
    }
    final painter = ScenePainter(scene: scene, images: images);
    try {
      final rec = ui.PictureRecorder();
      painter.paint(ui.Canvas(rec), const Size(540, 540));
      final pic = rec.endRecording();
      late img.Image preview;
      try {
        preview = img.decodePng(await raster(pic, 540, 540))!;
      } finally {
        pic.dispose();
      }
      final renderer = CanvasVariantRenderer();
      final exported = await renderer.render(
        fixture,
        AppLocale.ptPT,
        ExportFormat.square,
        ImageEncoding.png,
      );
      try {
        final full = img.decodePng(exported.bytes)!;
        for (final point in [
          const Offset(10, 10),
          const Offset(800, 160),
          const Offset(970, 520),
          const Offset(10, 920),
        ]) {
          final a = full.getPixel(point.dx.toInt(), point.dy.toInt());
          pixel(preview, (point.dx / 2).toInt(), (point.dy / 2).toInt(), [
            a.r.toInt(),
            a.g.toInt(),
            a.b.toInt(),
          ]);
        }
        // Real ink must occupy the independently resolved headline glyph boxes.
        final headline = scene.ops.whereType<TextOp>().first;
        var fullInk = 0, previewInk = 0;
        for (final box in headline.boxes) {
          for (var y = box.top.ceil(); y < box.bottom.floor(); y += 2) {
            for (var x = box.left.ceil(); x < box.right.floor(); x += 2) {
              if (full.getPixel(x, y).g < 150) {
                fullInk++;
              }
              if (preview.getPixel(x ~/ 2, y ~/ 2).g < 150) {
                previewInk++;
              }
            }
          }
        }
        expect(fullInk, greaterThan(100));
        expect(previewInk, greaterThan(100));
        expect(scene.textRuns, originalRuns);
        expect(scene.textBounds, originalBounds);
        expect(scene.isDisposed, isFalse);
        expect(scene.ops.whereType<TextOp>().any((t) => t.isDisposed), isFalse);
      } finally {
        await exported.dispose();
      }
      final again = ScenePainter(scene: scene, images: images);
      expect(painter.shouldRepaint(again), isFalse);
      expect(
        painter.shouldRepaint(ScenePainter(scene: scene, images: {...images})),
        isTrue,
      );
    } finally {
      for (final image in images.values) {
        image.dispose();
      }
      scene.dispose();
    }
  });

  test(
    'manual headline changes pixels but internal project name does not',
    () async {
      final renderer = CanvasVariantRenderer();
      final a = await renderer.render(
        fixture,
        AppLocale.ptPT,
        ExportFormat.square,
        ImageEncoding.png,
      );
      final b = await renderer.render(
        fixture.withProject(
          fixture.project.withHeadline(AppLocale.ptPT, 'Nova equipa'),
        ),
        AppLocale.ptPT,
        ExportFormat.square,
        ImageEncoding.png,
      );
      final c = await renderer.render(
        fixture.withProject(
          fixture.project.withName('EDITOR RULERS DRAFT GUIDES'),
        ),
        AppLocale.ptPT,
        ExportFormat.square,
        ImageEncoding.png,
      );
      try {
        expect(a.bytes, isNot(b.bytes));
        expect(a.bytes, c.bytes);
      } finally {
        await a.dispose();
        await b.dispose();
        await c.dispose();
      }
    },
  );
  test('per format manual crop selects correct source pixels', () async {
    final before = bundleFingerprint(fixture);
    final changed = fixture.withProject(
      fixture.project.withCrop(
        ExportFormat.square,
        NormalizedRect(left: 0, top: 0, width: .45, height: 1),
      ),
    );
    final renderer = CanvasVariantRenderer();
    final a = await renderer.render(
      fixture,
      AppLocale.ptPT,
      ExportFormat.square,
      ImageEncoding.png,
    );
    final b = await renderer.render(
      changed,
      AppLocale.ptPT,
      ExportFormat.square,
      ImageEncoding.png,
    );
    final c = await renderer.render(
      changed,
      AppLocale.ptPT,
      ExportFormat.portrait,
      ImageEncoding.png,
    );
    try {
      expect(a.bytes, isNot(b.bytes));
      final decoded = img.decodePng(b.bytes)!;
      pixel(decoded, 965, 169, photoColors[0]);
      pixel(decoded, 965, 507, photoColors[2]);
      pixel(img.decodePng(c.bytes)!, 961, 215, photoColors[1]);
      expect(bundleFingerprint(fixture), before);
    } finally {
      await a.dispose();
      await b.dispose();
      await c.dispose();
    }
  });
  test('transparent proportional logo scale and actual resource replacement change pixels', () async {
    final renderer = CanvasVariantRenderer();
    final scaled = fixture.withProject(
      fixture.project.withStyle(ProjectStyle(logoScale: 2)),
    );
    final a = await renderer.render(
      fixture,
      AppLocale.ptPT,
      ExportFormat.square,
      ImageEncoding.png,
    );
    final b = await renderer.render(
      scaled,
      AppLocale.ptPT,
      ExportFormat.square,
      ImageEncoding.png,
    );
    final c = await renderer.render(
      rendererFixture(alternativeLogo: true),
      AppLocale.ptPT,
      ExportFormat.square,
      ImageEncoding.png,
    );
    try {
      expect(a.bytes, isNot(b.bytes));
      expect(a.bytes, isNot(c.bytes));
      pixel(img.decodePng(a.bytes)!, 168, 72, [244, 241, 233]);
      pixel(img.decodePng(b.bytes)!, 168, 72, logoColor);
      pixel(img.decodePng(c.bytes)!, 120, 56, [195, 62, 180]);
    } finally {
      await a.dispose();
      await b.dispose();
      await c.dispose();
    }
  });
  test(
    'JPG bytes match real quality 95 encoder of production PNG raster',
    () async {
      final renderer = CanvasVariantRenderer();
      final a = await renderer.render(
        fixture,
        AppLocale.fr,
        ExportFormat.square,
        ImageEncoding.png,
      );
      final b = await renderer.render(
        fixture,
        AppLocale.fr,
        ExportFormat.square,
        ImageEncoding.jpg,
      );
      try {
        expect(b.bytes, img.encodeJpg(img.decodePng(a.bytes)!, quality: 95));
        expect(b.bytes, isNot(a.bytes));
        expect(b.bytes.sublist(b.bytes.length - 2), [255, 217]);
      } finally {
        await a.dispose();
        await b.dispose();
      }
    },
  );
  test('warning only low resolution and contrast remains renderable', () async {
    final low = rendererFixture(small: true);
    final bundle = low.withProject(
      low.project.withStyle(ProjectStyle(ink: 0xfff4f1e9)),
    );
    final before = bundleFingerprint(bundle);
    final scene = EditorialLayout().compose(
      bundle.project,
      AppLocale.ptPT,
      ExportFormat.square,
    );
    try {
      expect(
        scene.problems.map((p) => p.code),
        containsAll([
          ProblemCode.insufficientResolution,
          ProblemCode.lowContrast,
        ]),
      );
      expect(
        scene.problems.where((p) => p.severity == ProblemSeverity.error),
        isEmpty,
      );
    } finally {
      scene.dispose();
    }
    final r = await CanvasVariantRenderer().render(
      bundle,
      AppLocale.ptPT,
      ExportFormat.square,
      ImageEncoding.png,
    );
    try {
      expect(img.decodePng(r.bytes)!.width, 1080);
      expect(bundleFingerprint(bundle), before);
    } finally {
      await r.dispose();
    }
  });
  for (final entry in <String, ProblemCode>{
    'headline': ProblemCode.missingHeadline,
    'contact': ProblemCode.missingContact,
    'geometry': ProblemCode.invalidResource,
    'glyph': ProblemCode.unsupportedGlyph,
    'overflow': ProblemCode.textOverflow,
    'section': ProblemCode.incompleteSection,
  }.entries) {
    test(
      'scene ERROR ${entry.key} typed refusal preserves manual bundle',
      () async {
        final p = switch (entry.key) {
          'headline' => fixture.project.withHeadline(AppLocale.ptPT, ''),
          'contact' => fixture.project.withContact(AppLocale.ptPT, 'mail', ''),
          'geometry' => fixture.project.withCrop(
            ExportFormat.square,
            NormalizedRect(left: .5, top: .5, width: 1e-300, height: 1e-300),
          ),
          'glyph' => fixture.project.withHeadline(AppLocale.ptPT, '\u{1f9ec}'),
          'overflow' => fixture.project.withHeadline(
            AppLocale.ptPT,
            List.filled(100, 'Título muito longo').join('\n'),
          ),
          _ => fixture.project.withSections([
            Section(id: 'orphan', titleByLocale: {AppLocale.ptPT: 'Orphan'}),
          ]),
        };
        final bundle = fixture.withProject(p);
        final before = bundleFingerprint(bundle);
        final budget = WorkBudgetController();
        await expectLater(
          CanvasVariantRenderer(budget: budget).render(
            bundle,
            AppLocale.ptPT,
            ExportFormat.square,
            ImageEncoding.png,
          ),
          throwsA(refusal(entry.value)),
        );
        expect(bundleFingerprint(bundle), before);
        expect(budget.reservedBytes, 0);
      },
    );
  }
  for (final kind in ['corrupt', 'dimension', 'type']) {
    test('resource $kind typed refusal preserves true digest input', () async {
      final bundle = rendererFixture(
        corrupt: kind == 'corrupt',
        wrongDimensions: kind == 'dimension',
        wrongType: kind == 'type',
      );
      final before = bundleFingerprint(bundle);
      final budget = WorkBudgetController();
      await expectLater(
        CanvasVariantRenderer(budget: budget).render(
          bundle,
          AppLocale.ptPT,
          ExportFormat.square,
          ImageEncoding.png,
        ),
        throwsA(refusal(ProblemCode.invalidResource)),
      );
      expect(bundleFingerprint(bundle), before);
      expect(budget.reservedBytes, 0);
    });
  }
  test('missing bundle resource rejected by accepted readonly host before rendering', () {
    final before = bundleFingerprint(fixture);
    expect(
      () => ProjectBundle(fixture.project, {
        't05-logo': fixture.resources['t05-logo']!,
      }),
      throwsArgumentError,
    );
    expect(bundleFingerprint(fixture), before);
  });
  test(
    'missing required photo typed refusal retains incomplete manual project',
    () async {
      final blank = ProjectBundle(
        Project.blank(id: 'no-photo')
            .withHeadline(AppLocale.ptPT, 'Manual')
            .withContact(AppLocale.ptPT, 'mail', 'test@invalid.test'),
        {},
      );
      final before = bundleFingerprint(blank);
      await expectLater(
        CanvasVariantRenderer().render(
          blank,
          AppLocale.ptPT,
          ExportFormat.square,
          ImageEncoding.png,
        ),
        throwsA(refusal(ProblemCode.missingPhoto)),
      );
      expect(bundleFingerprint(blank), before);
    },
  );
  test('inactive locale typed refusal no fallback', () async {
    final one = fixture.withProject(
      fixture.project.withoutLocale(AppLocale.fr),
    );
    final before = bundleFingerprint(one);
    await expectLater(
      CanvasVariantRenderer().render(
        one,
        AppLocale.fr,
        ExportFormat.square,
        ImageEncoding.png,
      ),
      throwsA(refusal(ProblemCode.invalidSelection)),
    );
    expect(bundleFingerprint(one), before);
  });
  test('painter rejects disposed scene before drawing', () {
    final s = EditorialLayout().compose(
      fixture.project,
      AppLocale.ptPT,
      ExportFormat.square,
    )..dispose();
    final rec = ui.PictureRecorder();
    try {
      expect(
        () => ScenePainter(
          scene: s,
          images: {},
        ).paint(ui.Canvas(rec), const Size(1080, 1080)),
        throwsA(refusal(ProblemCode.invalidResource)),
      );
    } finally {
      rec.endRecording().dispose();
    }
  });
  test('painter rejects unavailable images and wrong preview aspect', () async {
    final s = EditorialLayout().compose(
      fixture.project,
      AppLocale.ptPT,
      ExportFormat.square,
    );
    final rec = ui.PictureRecorder();
    final canvas = ui.Canvas(rec);
    try {
      expect(
        () => ScenePainter(
          scene: s,
          images: {},
        ).paint(canvas, const Size(1080, 1080)),
        throwsA(refusal(ProblemCode.invalidResource)),
      );
      expect(
        () => ScenePainter(
          scene: s,
          images: {},
        ).paint(canvas, const Size(500, 100)),
        throwsA(refusal(ProblemCode.invalidSelection)),
      );
      expect(
        () => ScenePainter(scene: s, images: {}).paint(canvas, Size.zero),
        throwsA(refusal(ProblemCode.invalidSelection)),
      );
    } finally {
      rec.endRecording().dispose();
      s.dispose();
    }
  });
  test('painter rejects a scene without explicit opaque background', () {
    final s = LayoutScene(
      project: fixture.project,
      locale: AppLocale.ptPT,
      format: ExportFormat.square,
      textRuns: [],
      ops: [const RectOp(Rect.fromLTWH(0, 0, 1080, 1080), Color(0x00ffffff))],
      problems: [],
    );
    final rec = ui.PictureRecorder();
    try {
      expect(
        () => ScenePainter(
          scene: s,
          images: {},
        ).paint(ui.Canvas(rec), const Size(1080, 1080)),
        throwsA(refusal(ProblemCode.invalidResource)),
      );
    } finally {
      rec.endRecording().dispose();
      s.dispose();
    }
  });
  test(
    'precancel releases no output and leaves caller operation unclosed',
    () async {
      final op = WorkOperation.create()..cancel();
      final budget = WorkBudgetController();
      await expectLater(
        CanvasVariantRenderer(budget: budget).render(
          fixture,
          AppLocale.ptPT,
          ExportFormat.square,
          ImageEncoding.png,
          operation: op,
        ),
        throwsA(refusal(ProblemCode.operationCancelled)),
      );
      expect(op.isFinishing, isFalse);
      await op.finish();
      expect(budget.reservedBytes, 0);
    },
  );
  for (final action in ['cancel', 'finish']) {
    test(
      '$action while real JPG worker alive waits actual exit and disposals',
      () async {
        final gate = Completer<void>();
        final started = Completer<void>();
        final events = <String>[];
        final budget = WorkBudgetController();
        final op = WorkOperation.create();
        final renderer = CanvasVariantRenderer(
          budget: budget,
          testHooks: RendererTestHooks(
            onEvent: events.add,
            beforeJpgEncode: () {
              started.complete();
              return gate.future;
            },
          ),
        );
        final future = renderer.render(
          fixture,
          AppLocale.ptPT,
          ExportFormat.square,
          ImageEncoding.jpg,
          operation: op,
        );
        final rejected = expectLater(
          future,
          throwsA(refusal(ProblemCode.operationCancelled)),
        );
        await started.future;
        expect(events, contains('workerStarted'));
        expect(events, isNot(contains('workerExited')));
        final charged = budget.reservedBytes;
        expect(charged, greaterThan(0));
        if (action == 'cancel') {
          op.cancel();
        }
        var finished = false;
        final drain = op.finish().then((_) {
          finished = true;
        });
        await idle();
        expect(finished, isFalse);
        expect(budget.reservedBytes, charged);
        gate.complete();
        await rejected;
        await drain;
        await idle();
        expect(
          events,
          containsAll([
            'workerExited',
            'rasterDisposed',
            'pictureDisposed',
            'sceneDisposed',
          ]),
        );
        expect(events, isNot(contains('resultTransferred')));
        expect(budget.reservedBytes, 0);
        expect(budget.queuedCount, 0);
        saveRendererArtifact(
          'lifecycle-$action.json',
          uiBytes(events.join(',')),
          {
            'events': events,
            'reservedDuringWorker': charged,
            'finalReserved': budget.reservedBytes,
            'measurement':
                'accounting and real exit/disposal observations, not RSS',
          },
        );
      },
    );
  }
  test(
    'deterministic live worker failure typed IO refusal then normal recovery',
    () async {
      final budget = WorkBudgetController();
      final op = WorkOperation.create();
      final events = <String>[];
      final renderer = CanvasVariantRenderer(
        budget: budget,
        testHooks: RendererTestHooks(
          onEvent: events.add,
          beforeJpgEncode: () async {
            throw StateError('test-only worker fault');
          },
        ),
      );
      await expectLater(
        renderer.render(
          fixture,
          AppLocale.ptPT,
          ExportFormat.square,
          ImageEncoding.jpg,
          operation: op,
        ),
        throwsA(refusal(ProblemCode.ioFailure)),
      );
      expect(op.isFinishing, isFalse);
      await op.finish();
      await idle();
      expect(budget.reservedBytes, 0);
      expect(
        events,
        containsAll([
          'workerStarted',
          'workerExited',
          'sourceImageDisposed',
          'rasterDisposed',
          'pictureDisposed',
          'sceneDisposed',
        ]),
      );
      final r = await CanvasVariantRenderer(
        budget: budget,
      ).render(fixture, AppLocale.ptPT, ExportFormat.square, ImageEncoding.jpg);
      await r.dispose();
      await idle();
      expect(budget.reservedBytes, 0);
    },
  );
  test(
    'capacity refusal is preallocation and recovers without increasing rails',
    () async {
      final budget = WorkBudgetController(capacityBytes: 1);
      final events = <String>[];
      await expectLater(
        CanvasVariantRenderer(
          budget: budget,
          testHooks: RendererTestHooks(onEvent: events.add),
        ).render(
          fixture,
          AppLocale.ptPT,
          ExportFormat.square,
          ImageEncoding.png,
        ),
        throwsA(isA<CapacityExceeded>()),
      );
      expect(events, isNot(contains('sourceImageDecoded')));
      expect(events, isNot(contains('rasterCreated')));
      expect(budget.reservedBytes, 0);
      expect(budget.queuedCount, 0);
      final owner = WorkOperation.create();
      final lease = await budget.acquire(owner, 1);
      lease.release();
      await owner.finish();
      expect(budget.reservedBytes, 0);
    },
  );
  test(
    'queued heavy render cancelled while held worker normal queued recovery',
    () async {
      final gate = Completer<void>(), started = Completer<void>();
      final budget = WorkBudgetController();
      final owner = WorkOperation.create();
      final waiter = WorkOperation.create();
      final first =
          CanvasVariantRenderer(
            budget: budget,
            testHooks: RendererTestHooks(
              beforeJpgEncode: () {
                started.complete();
                return gate.future;
              },
            ),
          ).render(
            fixture,
            AppLocale.ptPT,
            ExportFormat.square,
            ImageEncoding.jpg,
            operation: owner,
          );
      await started.future;
      final second = CanvasVariantRenderer(budget: budget).render(
        fixture,
        AppLocale.ptPT,
        ExportFormat.square,
        ImageEncoding.png,
        operation: waiter,
      );
      final rejected = expectLater(
        second,
        throwsA(refusal(ProblemCode.operationCancelled)),
      );
      await idle();
      expect(budget.queuedCount, 1);
      waiter.cancel();
      await rejected;
      await waiter.finish();
      expect(budget.queuedCount, 0);
      final third = CanvasVariantRenderer(
        budget: budget,
      ).render(fixture, AppLocale.fr, ExportFormat.portrait, ImageEncoding.png);
      await idle();
      expect(budget.queuedCount, 1);
      gate.complete();
      final a = await first;
      final b = await third;
      expect(owner.isFinishing, isFalse);
      await owner.finish();
      await a.dispose();
      await b.dispose();
      await idle();
      expect(budget.reservedBytes, 0);
    },
  );
  test('caller remains reusable sequential outputs explicitly transfer byte ownership', () async {
    final budget = WorkBudgetController();
    final owner = WorkOperation.create();
    final renderer = CanvasVariantRenderer(budget: budget);
    for (final f in ExportFormat.values) {
      final result = await renderer.render(
        fixture,
        AppLocale.ptPT,
        f,
        ImageEncoding.png,
        operation: owner,
      );
      expect(owner.isFinishing, isFalse);
      expect(budget.reservedBytes, result.bytes.length);
      await result.dispose();
      await result.dispose();
      await idle();
      expect(budget.reservedBytes, 0);
    }
    await owner.finish();
    expect(budget.reservedBytes, 0);
    expect(budget.queuedCount, 0);
  });
  test('null caller operation normal render output stays paid beyond private finish', () async {
    final budget = WorkBudgetController();
    final r = await CanvasVariantRenderer(budget: budget)
        .render(fixture, AppLocale.ptPT, ExportFormat.story, ImageEncoding.png);
    expect(budget.reservedBytes, r.bytes.length);
    expect(img.decodePng(r.bytes)!.height, 1920);
    await r.dispose();
    await idle();
    expect(budget.reservedBytes, 0);
  });
}

// Evidence-only UTF8 bytes; never an image fixture or production renderer seam.
Uint8List uiBytes(String text) => Uint8List.fromList(text.codeUnits);
