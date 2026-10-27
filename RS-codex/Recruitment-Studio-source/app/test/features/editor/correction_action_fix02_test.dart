import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/design/editorial_theme.dart';
import 'package:recruitment_studio/features/composition/font_catalog.dart';
import 'package:recruitment_studio/features/editor/content_step.dart';
import 'package:recruitment_studio/features/editor/editor_host_controller.dart';
import 'package:recruitment_studio/features/editor/editor_shell.dart';
import 'package:recruitment_studio/features/projects/project.dart';
import 'package:recruitment_studio/shared/problem.dart';

import 'guided_ui_test_support.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(FontCatalog.load);

  for (final compact in [false, true]) {
    for (final photo in [true, false]) {
      testWidgets(
        'real empty review correction focuses visible action photo=$photo compact=$compact',
        (tester) async {
          await tester.binding.setSurfaceSize(
            compact ? const Size(380, 800) : const Size(1400, 900),
          );
          addTearDown(() => tester.binding.setSurfaceSize(null));
          var picks = 0;
          late GuidedRig rig;
          rig = GuidedRig(
            project: Project.blank(id: 'empty-focus').withLocale(AppLocale.en),
            source: (kind, op) async {
              picks++;
              return OwnedMediaInput.copyOf(
                await File('test/fixtures/assets/photo.jpg').readAsBytes(),
                kind,
                rig.budget,
              );
            },
          );
          addTearDown(() => rig.close(tester));
          rig.host.selectLocale(AppLocale.en);
          await tester.runAsync(() async {
            rig.host.refresh();
            await rig.host.idle;
          });
          await tester.pumpWidget(
            MaterialApp(
              theme: editorialTheme(),
              builder: (context, child) => MediaQuery(
                data: MediaQuery.of(context)
                    .copyWith(textScaler: TextScaler.linear(compact ? 2 : 1)),
                child: child!,
              ),
              home: EditorShell(session: rig.session, controller: rig.host),
            ),
          );
          await tester.pumpAndSettle();
          await tapGuided(tester, 'step-review');
          final correction = photo
              ? 'problem-missingPhoto-photo'
              : 'problem-missingContact-contacts';
          await tapGuided(tester, correction);
          await tester.pumpAndSettle();
          final action = find.byKey(
            Key(photo ? 'choose-photo' : 'add-contact'),
          );
          final button = tester.widget<TextButton>(action);
          expect(
            button.focusNode?.hasFocus,
            isTrue,
            reason: 'The real corrective action must consume focus',
          );
          expect(
            action.hitTestable(),
            findsOneWidget,
            reason: 'Correction must scroll into the usable viewport',
          );
          final rect = tester.getRect(action);
          expect(rect.top, greaterThanOrEqualTo(0));
          expect(rect.bottom, lessThanOrEqualTo(compact ? 800 : 900));
          expect(rig.host.locale, AppLocale.en);
          expect(rig.session.project.photo, isNull);
          expect(rig.session.project.contactIds, isEmpty);
          expect(rig.session.project.edition(AppLocale.en).headline, '');
          expect(picks, 0, reason: 'Focus is not permission to open a picker');
          expect(tester.takeException(), isNull);
        },
      );
    }
  }

  testWidgets(
    'injected focus adapter is a legitimate real media source on explicit action',
    (tester) async {
      var picks = 0;
      late GuidedRig rig;
      rig = GuidedRig(
        source: (kind, op) async {
          picks++;
          return OwnedMediaInput.copyOf(
            await File('test/fixtures/assets/photo.jpg').readAsBytes(),
            kind,
            rig.budget,
          );
        },
      );
      addTearDown(() => rig.close(tester));
      await tester.pumpWidget(rig.wrap(ContentStep(controller: rig.host)));
      await tester.runAsync(() async {
        await tester.tap(find.byKey(const Key('choose-photo')));
        await rig.host.idle.timeout(const Duration(seconds: 20));
      });
      expect(picks, 1);
      expect(rig.session.project.photo, isNotNull);
      expect(rig.session.project.photo!.kind, AssetKind.photo);
      expect(
        rig.session.bundle.resources[rig.session.project.photo!.id],
        isNotEmpty,
      );
    },
  );

  for (final field in ['photograph', 'photo']) {
    testWidgets(
      'action correction respects exact field and locale field=$field',
      (tester) async {
        final rig = GuidedRig(
          project: Project.blank(id: 'coordinate').withLocale(AppLocale.en),
          source: (_, _) async => null,
        );
        addTearDown(() => rig.close(tester));
        await tester.pumpWidget(
          rig.wrap(
            ContentStep(
              controller: rig.host,
              focusProblem: Problem(
                code: ProblemCode.missingPhoto,
                severity: ProblemSeverity.error,
                field: field,
                locale: field == 'photo' ? AppLocale.en : AppLocale.ptPT,
              ),
              focusRequest: 7,
            ),
          ),
        );
        await tester.pumpAndSettle();
        final button = tester.widget<TextButton>(
          find.byKey(const Key('choose-photo')),
        );
        expect(button.focusNode?.hasFocus ?? false, isFalse);
        expect(rig.session.project.photo, isNull);
        expect(rig.session.project.contactIds, isEmpty);
      },
    );
  }

  testWidgets(
    'missing media source keeps its disabled useful refusal after correction request',
    (tester) async {
      final rig = GuidedRig();
      addTearDown(() => rig.close(tester));
      await tester.pumpWidget(
        rig.wrap(
          ContentStep(
            controller: rig.host,
            focusProblem: const Problem(
              code: ProblemCode.missingPhoto,
              severity: ProblemSeverity.error,
              field: 'photo',
              locale: AppLocale.ptPT,
            ),
            focusRequest: 1,
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(
        tester
            .widget<TextButton>(find.byKey(const Key('choose-photo')))
            .onPressed,
        isNull,
      );
      expect(
        find.text('A origem de ficheiros locais ainda não está ligada.'),
        findsOneWidget,
      );
      expect(rig.session.project.photo, isNull);
    },
  );
}
