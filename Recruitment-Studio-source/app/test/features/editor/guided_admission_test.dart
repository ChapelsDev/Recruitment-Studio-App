import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/features/composition/font_catalog.dart';
import 'package:recruitment_studio/features/editor/appearance_step.dart';
import 'package:recruitment_studio/features/editor/content_step.dart';
import 'package:recruitment_studio/features/editor/editor_shell.dart';
import 'package:recruitment_studio/features/editor/review_step.dart';
import 'package:recruitment_studio/shared/admission_budget.dart';

import 'guided_ui_test_support.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(FontCatalog.load);

  final widgets = <String, Widget Function(GuidedRig)>{
    'content': (rig) => ContentStep(controller: rig.host),
    'appearance': (rig) => AppearanceStep(controller: rig.host),
    'review': (rig) => ReviewStep(controller: rig.host, onProblem: (_) {}),
    'shell': (rig) => EditorShell(session: rig.session, controller: rig.host),
  };
  for (final entry in widgets.entries) {
    testWidgets(
      '${entry.key} refuses UI control admission before allocating or editing',
      (tester) async {
        final rig = GuidedRig();
        rig.host.preview.setPaused(true);
        final ledger = AdmissionBudget.shared;
        final pressure = ledger.reserve(
          ledger.capacityBytes - ledger.reservedBytes,
        );
        try {
          await tester.pumpWidget(rig.wrap(entry.value(rig)));
          expect(
            find.byKey(const Key('editor-capacity-refusal')),
            findsOneWidget,
          );
          expect(find.byType(TextField), findsNothing);
          expect(rig.session.generation, 0);
          expect(rig.session.canUndo, isFalse);
          expect(tester.takeException(), isNull);
          await tester.pumpWidget(const SizedBox());
        } finally {
          pressure.release();
        }
        await rig.close(tester);
      },
    );
  }
}
