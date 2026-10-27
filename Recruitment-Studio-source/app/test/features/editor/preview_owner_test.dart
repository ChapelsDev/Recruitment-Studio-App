import 'dart:async';
import 'dart:io';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/rendering.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/features/composition/editorial_layout.dart';
import 'package:recruitment_studio/features/composition/export_format.dart';
import 'package:recruitment_studio/features/composition/font_catalog.dart';
import 'package:recruitment_studio/features/composition/layout_scene.dart';
import 'package:recruitment_studio/features/composition/variant_renderer.dart';
import 'package:recruitment_studio/features/editor/editor_session.dart';
import 'package:recruitment_studio/features/editor/preview_owner.dart';
import 'package:recruitment_studio/features/editor/editor_host_controller.dart';
import 'package:recruitment_studio/features/projects/project.dart';
import 'package:recruitment_studio/features/projects/project_bundle.dart';
import 'package:recruitment_studio/shared/operation.dart';
import 'package:recruitment_studio/shared/problem.dart';
import 'package:recruitment_studio/shared/work_budget.dart';

import '../composition/variant_renderer_test_fixtures.dart';

const watchdog = Duration(seconds: 45);
Future<T> bounded<T>(Future<T> future) => future.timeout(watchdog);

class RealHeldRenderer implements VariantRenderer {
  RealHeldRenderer(this.delegate);
  final VariantRenderer delegate;
  final entered = Completer<void>();
  final release = Completer<void>();
  int calls = 0;
  int live = 0;
  int maximum = 0;
  final outputLengths = <int>[];
  @override
  Future<RenderedVariant> render(
    ProjectBundle bundle,
    AppLocale locale,
    ExportFormat format,
    ImageEncoding encoding, {
    Operation? operation,
  }) async {
    calls++;
    live++;
    if (live > maximum) {
      maximum = live;
    }
    try {
      final result = await delegate.render(
        bundle,
        locale,
        format,
        encoding,
        operation: operation,
      );
      outputLengths.add(result.bytes.length);
      if (calls == 1) {
        entered.complete();
        await release.future;
      }
      return result;
    } finally {
      live--;
    }
  }
}

class EventRow {
  EventRow(this.event, this.phase, this.token, this.images, this.bytes);
  final PreviewEvent event;
  final PreviewPhase phase;
  final int token, images, bytes;
}

class PreviewRig {
  PreviewRig({
    ProjectBundle? bundle,
    VariantRenderer? renderer,
    PreviewTestHooks? hooks,
    WorkBudgetController? budget,
  }) : budget = budget ?? WorkBudgetController() {
    session = EditorSession.fromBundle(
      bundle ?? rendererFixture(small: true),
      budget: this.budget,
    );
    baseline = this.budget.reservedBytes;
    owner = PreviewOwner(
      budget: this.budget,
      renderer: renderer ?? CanvasVariantRenderer(budget: this.budget),
      testHooks: hooks,
    );
  }
  final WorkBudgetController budget;
  late final EditorSession session;
  late final PreviewOwner owner;
  late final int baseline;
  void request([
    AppLocale locale = AppLocale.ptPT,
    ExportFormat format = ExportFormat.square,
  ]) {
    owner.request(session, locale, format);
  }

  Future<void> finish() async {
    await bounded(owner.close());
    expect(session.isDisposed, isFalse);
    expect(budget.reservedBytes, baseline);
    session.dispose();
    await Future<void>.delayed(Duration.zero);
    expect(budget.reservedBytes, 0);
  }
}

Widget previewView(PreviewOwner owner) => Directionality(
  textDirection: TextDirection.ltr,
  child: AnimatedBuilder(
    animation: owner,
    builder: (context, child) {
      final frame = owner.current;
      return frame == null ? const SizedBox() : PreviewImageLeaf(frame: frame);
    },
  ),
);

class ObservedLayout implements LayoutEngine {
  final scenes = <LayoutScene>[];
  @override
  LayoutScene compose(Project p, AppLocale l, ExportFormat f) {
    final scene = EditorialLayout().compose(p, l, f);
    scenes.add(scene);
    return scene;
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(FontCatalog.load);
  for (final format in ExportFormat.values) {
    testWidgets('C14 real PNG UI RawImage ${format.name}', (tester) async {
      final rendererEvents = <String>[];
      final budget = WorkBudgetController();
      final rig = PreviewRig(
        budget: budget,
        renderer: CanvasVariantRenderer(
          budget: budget,
          testHooks: RendererTestHooks(onEvent: rendererEvents.add),
        ),
      );
      await tester.runAsync(() async {
        rig.request(AppLocale.ptPT, format);
        await bounded(rig.owner.idle);
      });
      final frame = rig.owner.current!;
      expect(rig.owner.status, PreviewStatus.ready);
      expect(frame.image.width, 1080);
      expect(frame.image.height, format.height);
      expect(frame.locale, AppLocale.ptPT);
      expect(frame.format, format);
      expect(frame.projectId, rig.session.project.id);
      expect(frame.revision, rig.session.project.revision);
      expect(frame.sessionGeneration, rig.session.generation);
      expect(rendererEvents.where((e) => e == 'rasterCreated').length, 1);
      expect(
        rendererEvents,
        containsAll([
          'resultTransferred',
          'sceneDisposed',
          'rasterDisposed',
          'pictureDisposed',
          'sourceImageDisposed',
        ]),
      );
      final original = frame.image;
      await tester.runAsync(() async {
        final data = (await original.toByteData(
          format: ui.ImageByteFormat.rawRgba,
        ))!;
        expect(data.getUint8((10 * 1080 + 10) * 4), 244);
        final region = oraclePhoto(format);
        final x = (region.left + region.width * .25).toInt();
        final y = (region.height * .25).toInt();
        final expected = oraclePhotoColor(
          rig.session.project,
          format,
          .25,
          .25,
        );
        for (var c = 0; c < 3; c++) {
          expect(data.getUint8((y * 1080 + x) * 4 + c), expected[c]);
        }
        final dir = Platform.environment['T10_EVIDENCE_DIR'];
        if (dir != null) {
          Directory(dir).createSync(recursive: true);
          final png = (await original.toByteData(
            format: ui.ImageByteFormat.png,
          ))!;
          File('$dir/preview-${format.name}.png').writeAsBytesSync(
            png.buffer.asUint8List(png.offsetInBytes, png.lengthInBytes),
          );
        }
      });
      await tester.pumpWidget(previewView(rig.owner));
      final render = tester.renderObject<RenderImage>(
        find.byType(PreviewImageLeaf),
      );
      expect(render.image!.isCloneOf(original), isTrue);
      expect(original.debugGetOpenHandleStackTraces()!.length, 2);
      // An unrelated heavy admission succeeds while the frame is visible.
      await tester.runAsync(() async {
        final op = WorkOperation.create();
        final lease = await bounded(budget.acquire(op, 1));
        lease.release();
        await op.finish();
      });
      var closed = false;
      late Future<void> closing;
      await tester.runAsync(() async {
        closing = rig.owner.close().then((_) => closed = true);
      });
      expect(rig.owner.status, PreviewStatus.closing);
      expect(closed, isFalse);
      expect(original.debugDisposed, isFalse);
      await tester.pumpWidget(const SizedBox());
      expect(render.image, isNull);
      await tester.runAsync(() async {
        await Future<void>.delayed(Duration.zero);
      });
      await tester.pump();
      await tester.runAsync(() async {
        await bounded(closing);
        expect(original.debugDisposed, isTrue);
        await rig.finish();
      });
    });
  }
  for (final locale in AppLocale.values) {
    test('C15 latest manual locale ${locale.code}', () async {
      final budget = WorkBudgetController();
      final held = RealHeldRenderer(CanvasVariantRenderer(budget: budget));
      final rig = PreviewRig(budget: budget, renderer: held);
      rig.request();
      await bounded(held.entered.future);
      rig.request(locale);
      expect(held.calls, 1);
      held.release.complete();
      await bounded(rig.owner.idle);
      expect(held.calls, 2);
      expect(held.maximum, 1);
      expect(rig.owner.current!.locale, locale);
      expect(rig.owner.current!.revision, rig.session.project.revision);
      expect(rig.owner.current!.sessionGeneration, rig.session.generation);
      final scene = EditorialLayout().compose(
        rig.session.project,
        locale,
        ExportFormat.square,
      );
      try {
        expect(scene.textRuns, contains(rendererHeadlines[locale]));
        expect(scene.textRuns, contains('${locale.code}@invalid.test'));
      } finally {
        scene.dispose();
      }
      await rig.finish();
    });
  }
  final invalids = <String, ProblemCode>{
    'missing-photo': ProblemCode.missingPhoto,
    'missing-headline': ProblemCode.missingHeadline,
    'missing-contact': ProblemCode.missingContact,
    'incomplete-section': ProblemCode.incompleteSection,
    'unsupported-glyph': ProblemCode.unsupportedGlyph,
    'text-overflow': ProblemCode.textOverflow,
    'warning-only': ProblemCode.insufficientResolution,
  };
  for (final parameter in invalids.entries) {
    test('C16 paid problems ${parameter.key}', () async {
      final bundle = rendererFixture(small: true);
      final budget = WorkBudgetController();
      final session = EditorSession.fromBundle(bundle, budget: budget);
      switch (parameter.key) {
        case 'missing-photo':
          final map = session.project.toManifest()..['photo'] = null;
          session.replaceProject(Project.fromManifest(map));
        case 'missing-headline':
          session.setHeadline(AppLocale.ptPT, '');
        case 'missing-contact':
          session.setContact(AppLocale.ptPT, 'mail', '');
        case 'incomplete-section':
          session.addSection('new');
          session.setSectionTitle(AppLocale.ptPT, 'new', 'Only title');
        case 'unsupported-glyph':
          session.setHeadline(AppLocale.ptPT, '\u{1f600}');
        case 'text-overflow':
          session.setHeadline(AppLocale.ptPT, List.filled(400, 'Word ').join());
      }
      final before = bundleFingerprint(session.bundle);
      final layout = ObservedLayout();
      final owner = PreviewOwner(
        budget: budget,
        renderer: CanvasVariantRenderer(budget: budget),
        layout: layout,
      );
      owner.request(session, AppLocale.ptPT, ExportFormat.square);
      await bounded(owner.idle);
      expect(owner.problems.map((p) => p.code), contains(parameter.value));
      expect(layout.scenes.length, 1);
      expect(layout.scenes.single.isDisposed, isTrue);
      expect(
        layout.scenes.single.ops.whereType<TextOp>().every((t) => t.isDisposed),
        isTrue,
      );
      expect(bundleFingerprint(session.bundle), before);
      if (parameter.key == 'warning-only') {
        expect(owner.status, PreviewStatus.ready);
        expect(owner.current, isNotNull);
      } else {
        expect(owner.status, PreviewStatus.error);
        expect(owner.current, isNull);
      }
      await bounded(owner.close());
      session.dispose();
      await Future<void>.delayed(Duration.zero);
      expect(budget.reservedBytes, 0);
    });
  }
  for (final cancel in [false, true]) {
    test(
      'C22 real decode paid helper ${cancel ? 'cancel' : 'success'}',
      () async {
        final entered = Completer<void>(), release = Completer<void>();
        final rows = <EventRow>[];
        final rig = PreviewRig(
          hooks: PreviewTestHooks(
            beforePhase: (phase) async {
              if (phase == PreviewPhase.afterDecode) {
                entered.complete();
                await release.future;
              }
            },
            onEvent: (e, p, t, i, b) => rows.add(EventRow(e, p, t, i, b)),
          ),
        );
        rig.request();
        await bounded(entered.future);
        expect(rig.owner.current, isNull);
        expect(rig.budget.reservedBytes, greaterThan(rig.baseline));
        expect(
          rows.where((r) => r.event == PreviewEvent.frameReserved).length,
          1,
        );
        expect(
          rows.where((r) => r.event == PreviewEvent.outputDropped),
          isEmpty,
        );
        Future<void>? close;
        if (cancel) {
          close = rig.owner.close();
        }
        release.complete();
        await bounded(close ?? rig.owner.idle);
        expect(
          rows.where((r) => r.event == PreviewEvent.outputDropped).length,
          1,
        );
        expect(
          rows.where((r) => r.event == PreviewEvent.snapshotReleased).length,
          1,
        );
        expect(
          rows.every(
            (r) => r.images <= 2 && r.bytes <= rig.budget.capacityBytes,
          ),
          isTrue,
        );
        expect(rig.owner.current == null, cancel);
        await rig.finish();
      },
    );
  }
  test('C22 exact backing source refusal and positive copy', () async {
    final budget = WorkBudgetController();
    final whole = Uint8List(12);
    expect(
      () => OwnedMediaInput.copyOf(
        Uint8List.sublistView(whole, 1),
        AssetKind.photo,
        budget,
      ),
      throwsArgumentError,
    );
    expect(
      () => OwnedMediaInput.copyOf(
        Uint8List.sublistView(whole, 0, 11),
        AssetKind.photo,
        budget,
      ),
      throwsArgumentError,
    );
    expect(budget.reservedBytes, 0);
    final input = OwnedMediaInput.copyOf(whole, AssetKind.photo, budget);
    expect(budget.reservedBytes, 24);
    whole[0] = 4;
    expect(input.bytes[0], 0);
    expect(() => input.bytes[0] = 1, throwsUnsupportedError);
    await input.release();
    expect(() => input.bytes, throwsStateError);
    expect(budget.reservedBytes, 0);
  });
  testWidgets('C23 C26 exact clone clear postframe blocks third generation', (
    tester,
  ) async {
    final rows = <EventRow>[];
    final rig = PreviewRig(
      hooks: PreviewTestHooks(
        onEvent: (e, p, t, i, b) => rows.add(EventRow(e, p, t, i, b)),
      ),
    );
    await tester.runAsync(() async {
      rig.request();
      await bounded(rig.owner.idle);
    });
    final old = rig.owner.current!;
    final original = old.image;
    await tester.pumpWidget(previewView(rig.owner));
    final render = tester.renderObject<RenderImage>(
      find.byType(PreviewImageLeaf),
    );
    late Completer<void> published;
    await tester.runAsync(() async {
      published = Completer<void>();
    });
    void watch() {
      if (rig.owner.current != old &&
          rig.owner.current != null &&
          !published.isCompleted) {
        published.complete();
      }
    }

    rig.owner.addListener(watch);
    await tester.runAsync(() async {
      rig.request(AppLocale.en);
      await bounded(published.future);
    });
    expect(old.isRetiring, isTrue);
    expect(original.debugDisposed, isFalse);
    expect(rig.owner.ownedImageCount, 2);
    await tester.runAsync(() async {
      rig.request(AppLocale.fr, ExportFormat.portrait);
      rig.request(AppLocale.es, ExportFormat.story);
    });
    expect(rig.owner.ownedImageCount, 2);
    expect(rows.where((r) => r.event == PreviewEvent.frameReserved).length, 2);
    var retired = false;
    old.retired.then((_) => retired = true);
    // No generic detach/notification acknowledges this leaf.
    expect(render.image, isNotNull);
    expect(retired, isFalse);
    await tester.pump();
    expect(render.image, isNull);
    await tester.runAsync(() async {
      await Future<void>.delayed(Duration.zero);
    });
    await tester.pump();
    await tester.runAsync(() async {
      await bounded(old.retired);
    });
    expect(original.debugDisposed, isTrue);
    // Third generation can now finish; it also retires its predecessor leaf.
    await tester.runAsync(() async {
      await bounded(() async {
        while (rig.owner.current!.locale != AppLocale.es) {
          await Future<void>.delayed(Duration.zero);
        }
      }());
    });
    await tester.pump();
    await tester.runAsync(() async {
      await Future<void>.delayed(Duration.zero);
    });
    await tester.pump();
    await tester.runAsync(() async {
      await bounded(rig.owner.idle);
    });
    expect(rig.owner.current!.format, ExportFormat.story);
    expect(rows.where((r) => r.event == PreviewEvent.frameReserved).length, 3);
    expect(rows.any((r) => r.images == 2), isTrue);
    expect(
      rows.every((r) => r.images <= 2 && r.bytes <= rig.budget.capacityBytes),
      isTrue,
    );
    expect(rows.where((r) => r.event == PreviewEvent.leafDetached).length, 2);
    rig.owner.removeListener(watch);
    late Future<void> close;
    await tester.runAsync(() async {
      close = rig.owner.close();
    });
    await tester.pump();
    await tester.runAsync(() async {
      await Future<void>.delayed(Duration.zero);
    });
    await tester.pump();
    await tester.runAsync(() async {
      await bounded(close);
      await rig.finish();
    });
  });
  for (final phase in [
    PreviewPhase.beforeInspection,
    PreviewPhase.beforeRender,
    PreviewPhase.beforeDecode,
  ]) {
    test('C24 independent FIFO ${phase.name}', () async {
      final budget = WorkBudgetController();
      final holder = WorkOperation.create();
      WorkLease? held;
      final entered = Completer<void>(), release = Completer<void>();
      final rig = PreviewRig(
        budget: budget,
        hooks: PreviewTestHooks(
          beforePhase: (p) async {
            if (p == phase) {
              // beforeInspection is inside admission; other stages are boundaries.
              entered.complete();
              await release.future;
            }
          },
        ),
      );
      if (phase == PreviewPhase.beforeInspection) {
        held = await budget.acquire(holder, 1);
        rig.request();
        await bounded(() async {
          while (budget.queuedCount == 0) {
            await Future<void>.delayed(Duration.zero);
          }
        }());
        expect(budget.queuedCount, 1);
        held.release();
        await holder.finish();
      } else {
        rig.request();
      }
      await bounded(entered.future);
      final unrelated = WorkOperation.create();
      final next = budget.acquire(unrelated, 1);
      release.complete();
      final lease = await bounded(next);
      lease.release();
      await unrelated.finish();
      await bounded(rig.owner.idle);
      expect(rig.owner.status, PreviewStatus.ready);
      if (phase != PreviewPhase.beforeInspection) {
        await holder.finish();
      }
      await rig.finish();
    });
  }
  test('C24 reentrant pending retains unrelated owner', () async {
    final budget = WorkBudgetController();
    final rig = PreviewRig(budget: budget);
    final op = WorkOperation.create();
    final lease = await budget.acquire(op, 1);
    final one = Completer<void>(), two = Completer<void>();
    op.registerPending(one.future);
    op.afterPending(() => op.registerPending(two.future));
    lease.release();
    rig.request();
    one.complete();
    await Future<void>.delayed(Duration.zero);
    expect(budget.queuedCount, 1);
    expect(rig.owner.current, isNull);
    two.complete();
    await bounded(op.finish());
    await bounded(rig.owner.idle);
    expect(rig.owner.status, PreviewStatus.ready);
    await rig.finish();
  });
  test(
    'C24 C26 capacity denial preserves bundle and promised history',
    () async {
      final budget = WorkBudgetController(capacityBytes: 8 * 1024 * 1024);
      final rig = PreviewRig(budget: budget);
      rig.session.setName('manual');
      final before = bundleFingerprint(rig.session.bundle);
      final undo = rig.session.undoCount;
      rig.request();
      await bounded(rig.owner.idle);
      expect(rig.owner.status, PreviewStatus.error);
      expect(rig.owner.problems.single.code, ProblemCode.capacityExceeded);
      expect(bundleFingerprint(rig.session.bundle), before);
      expect(rig.session.undoCount, undo);
      expect(rig.budget.reservedBytes, rig.baseline);
      await rig.finish();
    },
  );
  for (final phase in [
    PreviewPhase.beforeInspection,
    PreviewPhase.afterRender,
    PreviewPhase.afterDecode,
  ]) {
    test('K01 close real paid ${phase.name}', () async {
      final entered = Completer<void>(), release = Completer<void>();
      final rig = PreviewRig(
        hooks: PreviewTestHooks(
          beforePhase: (p) async {
            if (p == phase) {
              entered.complete();
              await release.future;
            }
          },
        ),
      );
      rig.request();
      await bounded(entered.future);
      final paid = rig.budget.reservedBytes;
      var closed = false;
      final close = rig.owner.close().then((_) => closed = true);
      expect(closed, isFalse);
      expect(rig.budget.reservedBytes, paid);
      expect(rig.owner.status, PreviewStatus.closing);
      release.complete();
      await bounded(close);
      expect(rig.owner.current, isNull);
      await rig.finish();
    });
  }

  test(
    'C26 render storm only metadata capture result with promised undo',
    () async {
      final budget = WorkBudgetController();
      final held = RealHeldRenderer(CanvasVariantRenderer(budget: budget));
      final rig = PreviewRig(budget: budget, renderer: held);
      rig.request();
      await bounded(held.entered.future);
      final paid = budget.reservedBytes;
      for (var i = 0; i < 12; i++) {
        rig.session.setName('manual-$i');
        rig.request(
          AppLocale.values[i % AppLocale.values.length],
          ExportFormat.values[i % ExportFormat.values.length],
        );
        expect(held.calls, 1);
        expect(budget.reservedBytes, paid);
      }
      final undo = rig.session.undoCount;
      held.release.complete();
      await bounded(rig.owner.idle);
      expect(held.calls, 2);
      expect(held.maximum, 1);
      expect(rig.owner.current!.revision, rig.session.project.revision);
      expect(rig.owner.current!.format, ExportFormat.story);
      expect(rig.session.undoCount, undo);
      await rig.finish();
    },
  );
  test(
    'previous raster stays tagged old while loading and idle cleanup',
    () async {
      final entered = Completer<void>(), release = Completer<void>();
      var renders = 0;
      final rig = PreviewRig(
        hooks: PreviewTestHooks(
          beforePhase: (p) async {
            if (p == PreviewPhase.beforeRender && ++renders == 2) {
              entered.complete();
              await release.future;
            }
          },
        ),
      );
      rig.request();
      await bounded(rig.owner.idle);
      final old = rig.owner.current!;
      rig.request(AppLocale.en, ExportFormat.portrait);
      await bounded(entered.future);
      expect(rig.owner.status, PreviewStatus.loading);
      expect(rig.owner.current, same(old));
      expect(old.locale, AppLocale.ptPT);
      expect(old.format, ExportFormat.square);
      release.complete();
      await bounded(rig.owner.idle);
      expect(rig.owner.current!.locale, AppLocale.en);
      expect(rig.owner.current!.format, ExportFormat.portrait);
      await rig.finish();
    },
  );
  test(
    'paid decode fault never publishes and retires provisional image',
    () async {
      final rig = PreviewRig(
        hooks: PreviewTestHooks(
          beforePhase: (p) async {
            if (p == PreviewPhase.afterDecode) {
              throw StateError('deterministic host hook fault');
            }
          },
        ),
      );
      rig.request();
      await bounded(rig.owner.idle);
      expect(rig.owner.current, isNull);
      expect(rig.owner.status, PreviewStatus.error);
      expect(rig.budget.reservedBytes, rig.baseline);
      await rig.finish();
    },
  );
}
