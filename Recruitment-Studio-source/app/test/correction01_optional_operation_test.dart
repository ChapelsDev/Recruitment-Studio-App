import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/features/composition/font_catalog.dart';
import 'package:recruitment_studio/features/composition/export_format.dart';
import 'package:recruitment_studio/features/composition/variant_renderer.dart';
import 'package:recruitment_studio/features/documents/document_gateway.dart';
import 'package:recruitment_studio/features/export/export_service.dart';
import 'package:recruitment_studio/features/export/export_selection.dart';
import 'package:recruitment_studio/features/projects/project.dart';
import 'package:recruitment_studio/shared/operation.dart';
import 'package:recruitment_studio/shared/work_budget.dart';

import 'support/project_fixtures.dart';
import 'features/documents/windows_document_gateway_test.dart'
    show HostIo, HostPicker;

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(FontCatalog.load);
  for (final implicit in [true, false]) {
    test(
      'D18 omitted export operation uses genuine ${implicit ? 'implicit' : 'explicit'} prepared owner without divergent producers',
      () async {
        final root = await Directory.systemTemp.createTemp('d18-compat-');
        final budget = WorkBudgetController();
        final supplied = implicit ? null : WorkOperation.create();
        final gateway = WindowsDocumentGateway(
          picker: HostPicker('${root.path}/actual.zip'),
          io: HostIo(),
          stagingDirectory: root,
          budget: budget,
        );
        final exporter = SequentialExportService(
          renderer: CanvasVariantRenderer(budget: budget),
          gateway: gateway,
          stagingDirectory: root,
          budget: budget,
        );
        try {
          final bundle = await fixtureBundle();
          final selection = ExportSelection(
            locales: [AppLocale.ptPT],
            formats: [ExportFormat.square, ExportFormat.portrait],
            encoding: ImageEncoding.png,
            bundleAsZip: true,
            destinationApproved: true,
          );
          final first = await exporter.preflight(bundle, selection);
          final destination = (await gateway.prepareSave(
            first.proposedNames,
            'application/zip',
            operation: supplied,
          ))!;
          final events = await exporter
              .export(bundle, selection, destination: destination)
              .toList()
              .timeout(const Duration(seconds: 5));
          expect(
            events.last.status,
            ExportStatus.completed,
            reason: 'Declared omitted-operation convenience must reach actual native readback',
          );
          expect(events.last.receipt!.operationId, destination.operationId);
          expect(
            events
                .where((event) => event.status == ExportStatus.progress)
                .length,
            2,
          );
          if (supplied != null) expect(supplied.isFinishing, isFalse);
        } finally {
          await gateway.close();
          await supplied?.finish();
          await root.delete(recursive: true);
        }
        expect(budget.reservedBytes, 0);
      },
    );
  }
}
