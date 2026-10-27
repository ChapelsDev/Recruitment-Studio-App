import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/features/composition/font_catalog.dart';
import 'package:recruitment_studio/features/editor/content_step.dart';
import 'package:recruitment_studio/features/editor/editor_host_controller.dart';
import 'package:recruitment_studio/features/projects/project.dart';

import 'guided_ui_test_support.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(FontCatalog.load);

  testWidgets(
    'photo action imports real local bytes through accepted ResourceService',
    (tester) async {
      late GuidedRig rig;
      late OwnedMediaInput input;
      rig = GuidedRig(
        source: (kind, request) async {
          expect(kind, AssetKind.photo);
          input = OwnedMediaInput.copyOf(
            await File('test/fixtures/assets/photo.jpg').readAsBytes(),
            kind,
            rig.budget,
          );
          return input;
        },
      );
      await tester.pumpWidget(rig.wrap(ContentStep(controller: rig.host)));
      final action = find.byKey(const Key('choose-photo'));
      expect(action, findsOneWidget);
      await tester.runAsync(() async {
        await tester.tap(action);
        await rig.host.idle.timeout(const Duration(seconds: 20));
      });
      await tester.pump();
      final ref = rig.session.project.photo!;
      expect(rig.session.bundle.resources[ref.id], isNotEmpty);
      expect(ref.kind, AssetKind.photo);
      expect(ref.width, 640);
      expect(ref.height, 480);
      expect(() => input.bytes, throwsStateError);
      expect(rig.host.mediaProblem, isNull);
      expect(rig.session.project.edition(AppLocale.ptPT).headline, '');
      await rig.close(tester);
    },
  );
  testWidgets(
    'cancel action drains and retires a late local source without attaching it',
    (tester) async {
      late GuidedRig rig;
      late Completer<void> entered, release;
      late OwnedMediaInput input;
      await tester.runAsync(() async {
        entered = Completer<void>();
        release = Completer<void>();
        rig = GuidedRig(
          source: (kind, op) async {
            entered.complete();
            await release.future;
            input = OwnedMediaInput.copyOf(
              await File('test/fixtures/assets/photo.jpg').readAsBytes(),
              kind,
              rig.budget,
            );
            return input;
          },
        );
      });
      await tester.pumpWidget(rig.wrap(ContentStep(controller: rig.host)));
      await tester.runAsync(() async {
        await tester.tap(find.byKey(const Key('choose-photo')));
        await entered.future.timeout(const Duration(seconds: 20));
      });
      await tester.pump();
      expect(find.byKey(const Key('cancel-media')), findsOneWidget);
      await tapGuided(tester, 'cancel-media');
      await tester.runAsync(() async {
        release.complete();
        await rig.host.idle.timeout(const Duration(seconds: 20));
      });
      await tester.pump();
      expect(rig.session.project.photo, isNull);
      expect(rig.session.bundle.resources, isEmpty);
      expect(() => input.bytes, throwsStateError);
      expect(rig.host.mediaProblem, isNull);
      await rig.close(tester);
    },
  );
  testWidgets(
    'rejected media reports a useful local error while keeping the last photo',
    (tester) async {
      var calls = 0;
      late GuidedRig rig;
      rig = GuidedRig(
        source: (kind, op) async => OwnedMediaInput.copyOf(
          ++calls == 1
              ? await File('test/fixtures/assets/photo.jpg').readAsBytes()
              : Uint8List.fromList([1, 2, 3]),
          kind,
          rig.budget,
        ),
      );
      await tester.pumpWidget(rig.wrap(ContentStep(controller: rig.host)));
      await tester.runAsync(() async {
        await tester.tap(find.byKey(const Key('choose-photo')));
        await rig.host.idle.timeout(const Duration(seconds: 20));
      });
      await tester.pump();
      final previous = rig.session.project.photo;
      final generation = rig.session.generation;
      await tester.runAsync(() async {
        await tester.tap(find.byKey(const Key('choose-photo')));
        await rig.host.idle.timeout(const Duration(seconds: 20));
      });
      await tester.pump();
      expect(rig.session.project.photo, same(previous));
      expect(rig.session.generation, generation);
      expect(find.byKey(const Key('media-error')), findsOneWidget);
      expect(find.textContaining('JPEG ou PNG'), findsWidgets);
      await rig.close(tester);
    },
  );
}
