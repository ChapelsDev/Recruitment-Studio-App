import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/design/editorial_theme.dart';
import 'package:recruitment_studio/features/composition/variant_renderer.dart';
import 'package:recruitment_studio/features/editor/editor_host_controller.dart';
import 'package:recruitment_studio/features/editor/editor_session.dart';
import 'package:recruitment_studio/features/media/resource_service.dart';
import 'package:recruitment_studio/features/projects/project.dart';
import 'package:recruitment_studio/features/projects/project_bundle.dart';
import 'package:recruitment_studio/shared/work_budget.dart';

/// Real session/resources/layout/Canvas renderer. No fake composition or IO.
class GuidedRig {
  GuidedRig({
    Project? project,
    ProjectBundle? bundle,
    MediaByteSource? source,
  }) {
    session = bundle == null
        ? EditorSession(project ?? Project.blank(id: 'guided'), budget: budget)
        : EditorSession.fromBundle(bundle, budget: budget);
    host = EditorHostController(
      session: session,
      budget: budget,
      resources: resources,
      renderer: CanvasVariantRenderer(budget: budget),
      mediaByteSource: source,
    );
  }
  final budget = WorkBudgetController();
  late final resources = ResourceService(budget: budget);
  late final EditorSession session;
  late final EditorHostController host;
  Widget wrap(Widget child) => MaterialApp(
    theme: editorialTheme(),
    home: Scaffold(body: child),
  );
  Future<void> close(WidgetTester tester) async {
    late Future<void> closing;
    await tester.runAsync(() async {
      closing = host.close();
    });
    await tester.pumpWidget(const SizedBox());
    await tester.runAsync(() => Future<void>.delayed(Duration.zero));
    await tester.pump();
    await tester.runAsync(() => closing.timeout(const Duration(seconds: 20)));
    host.dispose();
    session.dispose();
    expect(budget.reservedBytes, 0);
    expect(tester.takeException(), isNull);
  }
}

Future<void> tapGuided(WidgetTester tester, String key) async {
  final finder = find.byKey(ValueKey(key));
  await tester.ensureVisible(finder);
  await tester.tap(finder);
  await tester.pump();
}
