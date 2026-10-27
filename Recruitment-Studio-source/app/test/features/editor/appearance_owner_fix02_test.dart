import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/features/composition/font_catalog.dart';
import 'package:recruitment_studio/features/editor/appearance_step.dart';
import 'package:recruitment_studio/features/editor/editor_controls.dart';

import '../../support/project_fixtures.dart';
import 'guided_ui_test_support.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(FontCatalog.load);

  testWidgets(
    'equal committed ink replacement cannot apply previous owner text draft',
    (tester) async {
      final a = GuidedRig(), b = GuidedRig();
      addTearDown(() => a.close(tester));
      addTearDown(() => b.close(tester));
      final ink = find.byKey(const Key('colour-ink'));
      final original = b.session.project.style.ink;
      await tester.pumpWidget(a.wrap(AppearanceStep(controller: a.host)));
      await tester.enterText(ink, '#123456');
      final oldFocus = tester.widget<TextField>(ink).focusNode;
      expect(a.session.project.style.ink, original);
      await tester.pumpWidget(b.wrap(AppearanceStep(controller: b.host)));
      await tapGuided(tester, 'apply-colour-ink');
      expect(
        b.session.project.style.ink,
        original,
        reason: 'A draft is not an edit of B',
      );
      expect(a.session.project.style.ink, original);
      expect(
        tester.widget<TextField>(ink).controller!.text,
        original.toRadixString(16),
      );
      expect(tester.widget<TextField>(ink).focusNode, isNot(same(oldFocus)));
    },
  );

  testWidgets(
    'late colour commit callback cannot mutate replacement or retired owner',
    (tester) async {
      final a = GuidedRig(), b = GuidedRig();
      addTearDown(() => a.close(tester));
      addTearDown(() => b.close(tester));
      await tester.pumpWidget(a.wrap(AppearanceStep(controller: a.host)));
      final oldControl = tester.widget<EditorTextField>(
        find.byKey(const Key('colour-control-ink')),
      );
      final original = a.session.project.style.ink;
      await tester.pumpWidget(b.wrap(AppearanceStep(controller: b.host)));
      expect(() => oldControl.onCommit!('#123456'), returnsNormally);
      expect(a.session.project.style.ink, original);
      expect(
        b.session.project.style.ink,
        original,
        reason: 'Saved old callback must not resolve current host dynamically',
      );
    },
  );

  testWidgets(
    'late submitted colour callback retires without touching disposed text state',
    (tester) async {
      final a = GuidedRig(), b = GuidedRig();
      addTearDown(() => a.close(tester));
      addTearDown(() => b.close(tester));
      await tester.pumpWidget(a.wrap(AppearanceStep(controller: a.host)));
      await tester.enterText(find.byKey(const Key('colour-ink')), '#123456');
      final submit = tester
          .widget<TextField>(find.byKey(const Key('colour-ink')))
          .onSubmitted!;
      final original = b.session.project.style.ink;
      await tester.pumpWidget(b.wrap(AppearanceStep(controller: b.host)));
      expect(() => submit('#123456'), returnsNormally);
      expect(b.session.project.style.ink, original);
      expect(a.session.project.style.ink, original);
      await tester.pumpWidget(const SizedBox());
      expect(() => submit('#123456'), returnsNormally);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'equal owner replacement drops slider draft and rejects late gesture callbacks',
    (tester) async {
      late GuidedRig a, b;
      await tester.runAsync(() async {
        a = GuidedRig(bundle: await fixtureBundle());
        b = GuidedRig(bundle: await fixtureBundle());
      });
      addTearDown(() => a.close(tester));
      addTearDown(() => b.close(tester));
      await tester.pumpWidget(a.wrap(AppearanceStep(controller: a.host)));
      final oldSlider = tester.widget<Slider>(
        find.byKey(const Key('crop-zoom')),
      );
      oldSlider.onChanged!(2);
      await tester.pump();
      expect(
        tester.widget<Slider>(find.byKey(const Key('crop-zoom'))).value,
        2,
      );
      final beforeA = a.session.project.cropByFormat,
          beforeB = b.session.project.cropByFormat;
      await tester.pumpWidget(b.wrap(AppearanceStep(controller: b.host)));
      expect(
        tester.widget<Slider>(find.byKey(const Key('crop-zoom'))).value,
        1,
        reason: 'Gesture draft belongs only to A',
      );
      expect(() => oldSlider.onChanged!(3), returnsNormally);
      expect(() => oldSlider.onChangeEnd!(3), returnsNormally);
      await tester.pump();
      expect(
        tester.widget<Slider>(find.byKey(const Key('crop-zoom'))).value,
        1,
      );
      expect(a.session.project.cropByFormat, beforeA);
      expect(b.session.project.cropByFormat, beforeB);
      await tester.pumpWidget(const SizedBox());
      expect(() => oldSlider.onChanged!(4), returnsNormally);
      expect(() => oldSlider.onChangeEnd!(4), returnsNormally);
    },
  );

  testWidgets(
    'ordinary appearance edits retain focus and text owner with valid invalid and defaults',
    (tester) async {
      final rig = GuidedRig();
      addTearDown(() => rig.close(tester));
      await tester.pumpWidget(rig.wrap(AppearanceStep(controller: rig.host)));
      final ink = find.byKey(const Key('colour-ink'));
      await tester.enterText(ink, '#123456');
      final node = tester.widget<TextField>(ink).focusNode!;
      expect(node.hasFocus, isTrue);
      await tester.pumpWidget(rig.wrap(AppearanceStep(controller: rig.host)));
      expect(tester.widget<TextField>(ink).focusNode, same(node));
      expect(tester.widget<TextField>(ink).controller!.text, '#123456');
      tester
          .widget<EditorTextField>(find.byKey(const Key('colour-control-ink')))
          .onCommit!('#123456');
      await tester.pump();
      expect(rig.session.project.style.ink, 0xff123456);
      expect(tester.widget<TextField>(ink).focusNode, same(node));
      expect(node.hasFocus, isTrue);
      await tester.enterText(ink, 'invalid');
      await tapGuided(tester, 'apply-colour-ink');
      expect(rig.session.project.style.ink, 0xff123456);
      expect(find.textContaining('Cor inválida'), findsOneWidget);
      await tapGuided(tester, 'reset-colours');
      expect(rig.session.project.style.ink, 0xff173e38);
      expect(tester.widget<TextField>(ink).focusNode, same(node));
      await tester.enterText(ink, '#abcdef');
      await tester.pump();
      expect(tester.widget<TextField>(ink).focusNode, same(node));
      expect(node.hasFocus, isTrue);
    },
  );
}
