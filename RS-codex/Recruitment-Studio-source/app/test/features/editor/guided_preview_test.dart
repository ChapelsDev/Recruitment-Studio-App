import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/features/composition/export_format.dart';
import 'package:recruitment_studio/features/composition/font_catalog.dart';
import 'package:recruitment_studio/features/editor/editor_shell.dart';
import 'package:recruitment_studio/features/editor/preview_owner.dart';

import '../../support/project_fixtures.dart';
import 'guided_ui_test_support.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(FontCatalog.load);

  testWidgets(
    'story guides are editor-only over an actual Canvas preview with owned retirement',
    (tester) async {
      await tester.binding.setSurfaceSize(const Size(1400, 1000));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      late GuidedRig rig;
      await tester.runAsync(() async {
        rig = GuidedRig(bundle: await fixtureBundle());
        rig.host.selectFormat(ExportFormat.story);
        await rig.host.idle.timeout(const Duration(seconds: 20));
        expect(rig.host.previewStatus, PreviewStatus.ready);
        // Hold the accepted owner after real render/decode so this tracer isolates
        // guide UI and exact leaf retirement, not fake-zone native job scheduling.
        rig.host.preview.setPaused(true);
      });
      await tester.pumpWidget(
        rig.wrap(EditorShell(session: rig.session, controller: rig.host)),
      );
      final leaf = tester.widget<PreviewImageLeaf>(
        find.byType(PreviewImageLeaf),
      );
      final original = leaf.frame.image;
      final render = tester.renderObject<RenderImage>(
        find.byType(PreviewImageLeaf),
      );
      expect(original.width, 1080);
      expect(original.height, 1920);
      expect(render.image!.isCloneOf(original), isTrue);
      expect(find.byKey(const Key('story-guides-toggle')), findsOneWidget);
      final before = rig.session.generation;
      await tapGuided(tester, 'story-guides-toggle');
      expect(find.byKey(const Key('story-guides-overlay')), findsOneWidget);
      expect(rig.session.generation, before);
      expect(
        tester.widget<PreviewImageLeaf>(find.byType(PreviewImageLeaf)).frame,
        same(leaf.frame),
      );
      await rig.close(tester);
      expect(original.debugDisposed, isTrue);
      expect(render.image, isNull);
    },
  );
}
