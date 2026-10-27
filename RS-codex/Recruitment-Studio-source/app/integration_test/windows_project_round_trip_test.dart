// Local Windows filesystem round-trip only: NOT Windows→Android→Windows.
import 'dart:io';

import 'package:crypto/crypto.dart' as crypto;
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:recruitment_studio/features/composition/editorial_layout.dart';
import 'package:recruitment_studio/features/composition/export_format.dart';
import 'package:recruitment_studio/features/composition/font_catalog.dart';
import 'package:recruitment_studio/features/composition/layout_scene.dart';
import 'package:recruitment_studio/features/editor/editor_session.dart';
import 'package:recruitment_studio/features/projects/project.dart';
import 'package:recruitment_studio/features/storage/project_codec.dart';
import 'package:recruitment_studio/shared/operation.dart';
import 'package:recruitment_studio/shared/problem.dart';

import 'support/windows_native_fixtures.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  testWidgets('Windows actual codec preserves manifest, SHA, hidden text, crop and edit after reopen', (tester) async {
    requireWindowsDevice();
    final root = await windowsSandbox();
    WindowsFixture? fixture;
    EditorSession? reopened, edited;
    try {
      await FontCatalog.load();
      fixture = await WindowsFixture.generate();
      final codec = ZipProjectCodec(budget: fixture.budget);
      final file = File('${root.path}/round-trip.recruitproj');
      await codec.encode(fixture.session.bundle, file);
      expect(await file.length(), greaterThan(0));
      reopened = await codec.decodeEditorSession(file);
      expect(reopened.project.toManifest(), fixture.session.project.toManifest());
      expect(reopened.bundle.resources.keys, fixture.session.bundle.resources.keys);
      for (final ref in [reopened.project.photo, reopened.project.logo]) {
        if (ref == null) continue;
        final bytes = reopened.bundle.resources[ref.id]!;
        expect(crypto.sha256.convert(bytes).toString(), ref.sha256);
        expect(bytes, orderedEquals(fixture.session.bundle.resources[ref.id]!));
      }
      final hidden = reopened.project.sections.singleWhere((s) => s.id == 'hidden');
      expect(hidden.visible, isFalse);
      for (final locale in AppLocale.values) {
        expect(hidden.title(locale), 'HIDDEN-${locale.code}');
        expect(hidden.items.single.text(locale), 'HIDDEN-ITEM-${locale.code}');
        for (final format in ExportFormat.values) {
          LayoutScene? before, after;
          try {
            before = EditorialLayout().compose(fixture.session.project, locale, format);
            after = EditorialLayout().compose(reopened.project, locale, format);
            expect(after.textRuns, before.textRuns);
            expect(after.textRuns.where((text) => text.contains('HIDDEN')), isEmpty);
            expect(after.ops.whereType<PhotoOp>().single.sourceRect,
              before.ops.whereType<PhotoOp>().single.sourceRect);
            final crop = reopened.project.cropByFormat[format]!;
            expect([crop.left, crop.top, crop.width, crop.height], [0.125, 0.125, 0.75, 0.75]);
          } finally { try { after?.dispose(); } finally { before?.dispose(); } }
        }
      }
      reopened.setHeadline(AppLocale.fr, 'Titre modifié manuellement');
      expect(reopened.hasUnsavedChanges, isTrue);
      final second = File('${root.path}/edited.recruitproj');
      await codec.encode(reopened.bundle, second);
      edited = await codec.decodeEditorSession(second);
      expect(edited.project.toManifest(), reopened.project.toManifest());
      expect(edited.project.edition(AppLocale.fr).headline, 'Titre modifié manuellement');
      expect(edited.project.edition(AppLocale.en).headline, manualHeadlines[AppLocale.en]);
    } finally {
      try { edited?.dispose(); }
      finally {
        try { reopened?.dispose(); }
        finally { fixture?.dispose(); await root.delete(recursive: true); }
      }
    }
  });

  testWidgets('Windows codec cancelled operation leaves no output and permits fresh recovery', (tester) async {
    final root = await windowsSandbox();
    WindowsFixture? fixture;
    WorkOperation? cleanupOperation;
    try {
      final operation = WorkOperation.create();
      cleanupOperation = operation;
      fixture = await WindowsFixture.generate();
      final codec = ZipProjectCodec(budget: fixture.budget);
      final cancelled = File('${root.path}/cancelled.recruitproj');
      operation.cancel();
      await expectLater(codec.encode(fixture.session.bundle, cancelled, operation: operation),
        throwsA(isA<OperationException>().having((e) => e.code, 'code', ProblemCode.operationCancelled)));
      expect(await cancelled.exists(), isFalse);
      await operation.finish();
      final recovered = File('${root.path}/recovered.recruitproj');
      await codec.encode(fixture.session.bundle, recovered);
      final session = await codec.decodeEditorSession(recovered);
      try { expect(session.project.toManifest(), fixture.session.project.toManifest()); }
      finally { session.dispose(); }
    } finally {
      try { await cleanupOperation?.finish(); }
      finally { try { fixture?.dispose(); } finally { await root.delete(recursive: true); } }
    }
  });
}
