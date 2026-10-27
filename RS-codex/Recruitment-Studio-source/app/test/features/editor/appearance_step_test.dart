import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/features/composition/font_catalog.dart';
import 'package:recruitment_studio/features/editor/appearance_step.dart';
import 'package:recruitment_studio/features/editor/content_step.dart';
import 'package:recruitment_studio/features/editor/editor_host_controller.dart';
import 'package:recruitment_studio/features/projects/project.dart';
import 'package:recruitment_studio/features/composition/editorial_layout.dart';
import 'package:recruitment_studio/features/composition/export_format.dart';
import 'package:recruitment_studio/features/composition/layout_scene.dart';

import 'guided_ui_test_support.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(FontCatalog.load);

  testWidgets(
    'appearance uses the three bounded body sizes without changing text',
    (tester) async {
      final rig = GuidedRig();
      rig.session.setHeadline(rig.host.locale, 'Manual');
      await tester.pumpWidget(rig.wrap(AppearanceStep(controller: rig.host)));
      await tapGuided(tester, 'body-34');
      expect(rig.session.project.style.bodyPx, 34);
      expect(rig.session.project.edition(rig.host.locale).headline, 'Manual');
      await tapGuided(tester, 'body-26');
      expect(rig.session.project.style.bodyPx, 26);
      expect(find.byKey(const Key('body-20')), findsNothing);
      await rig.close(tester);
    },
  );
  testWidgets('real logo and per-format crop controls preserve media aspect', (
    tester,
  ) async {
    late GuidedRig rig;
    rig = GuidedRig(
      source: (kind, op) async => OwnedMediaInput.copyOf(
        await File(
          kind == AssetKind.photo
              ? 'test/fixtures/assets/photo.jpg'
              : 'test/fixtures/assets/logo.png',
        ).readAsBytes(),
        kind,
        rig.budget,
      ),
    );
    await tester.pumpWidget(rig.wrap(ContentStep(controller: rig.host)));
    await tester.runAsync(() async {
      await tester.tap(find.byKey(const Key('choose-photo')));
      await rig.host.idle.timeout(const Duration(seconds: 20));
    });
    await tester.pumpWidget(rig.wrap(AppearanceStep(controller: rig.host)));
    expect(find.byKey(const Key('choose-logo')), findsOneWidget);
    await tester.runAsync(() async {
      await tester.tap(find.byKey(const Key('choose-logo')));
      await rig.host.idle.timeout(const Duration(seconds: 20));
    });
    await tester.pump();
    var slider = tester.widget<Slider>(find.byKey(const Key('logo-scale')));
    slider.onChanged!(4);
    slider.onChangeEnd!(4);
    await tester.pump();
    expect(rig.session.project.style.logoScale, 4);
    slider = tester.widget<Slider>(find.byKey(const Key('crop-zoom')));
    slider.onChanged!(2);
    slider.onChangeEnd!(2);
    await tester.pump();
    final square = rig.session.project.cropByFormat[ExportFormat.square]!;
    final photo = rig.session.project.photo!;
    final regions = EditorialRegions.forFormat(ExportFormat.square);
    expect(
      square.width * photo.width / (square.height * photo.height),
      closeTo(regions.photo.width / regions.photo.height, 1e-9),
    );
    await tapGuided(tester, 'crop-format-story');
    slider = tester.widget<Slider>(find.byKey(const Key('crop-horizontal')));
    slider.onChanged!(1);
    slider.onChangeEnd!(1);
    await tester.pump();
    expect(rig.session.project.cropByFormat[ExportFormat.story], isNotNull);
    expect(rig.session.project.cropByFormat[ExportFormat.square], same(square));
    final scene = EditorialLayout().compose(
      rig.session.project,
      rig.host.locale,
      ExportFormat.story,
    );
    try {
      final logo = rig.session.project.logo!;
      final op = scene.ops.whereType<LogoOp>().single;
      expect(
        op.bounds.width / op.bounds.height,
        closeTo(logo.width / logo.height, 1e-9),
      );
    } finally {
      scene.dispose();
    }
    await rig.close(tester);
  });
  testWidgets(
    'manual brand colour commit validates hex and can restore B defaults',
    (tester) async {
      final rig = GuidedRig();
      await tester.pumpWidget(rig.wrap(AppearanceStep(controller: rig.host)));
      final ink = find.byKey(const Key('colour-ink'));
      expect(ink, findsOneWidget);
      await tester.enterText(ink, '#123456');
      await tapGuided(tester, 'apply-colour-ink');
      expect(rig.session.project.style.ink, 0xff123456);
      await tester.enterText(ink, 'invalid');
      await tapGuided(tester, 'apply-colour-ink');
      expect(rig.session.project.style.ink, 0xff123456);
      expect(find.textContaining('Cor inválida'), findsOneWidget);
      await tapGuided(tester, 'reset-colours');
      expect(rig.session.project.style.ink, 0xff173e38);
      expect(rig.session.project.style.accent, 0xff205b50);
      expect(rig.session.project.style.paper, 0xfff4f1e9);
      await rig.close(tester);
    },
  );
}
