import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/features/composition/font_catalog.dart';
import 'package:recruitment_studio/features/composition/export_format.dart';
import 'package:recruitment_studio/features/composition/variant_renderer.dart';
import 'package:recruitment_studio/features/documents/document_gateway.dart';
import 'package:recruitment_studio/features/export/export_service.dart';
import 'package:recruitment_studio/features/export/export_selection.dart';
import 'package:recruitment_studio/features/projects/project.dart';
import 'package:recruitment_studio/features/storage/private_effect_custody.dart';
import 'package:recruitment_studio/shared/operation.dart';
import 'package:recruitment_studio/shared/work_budget.dart';

import 'support/project_fixtures.dart';
import 'features/documents/windows_document_gateway_test.dart'
    show HostIo, HostPicker;
import 'correction01_custody_test.dart' show RetirementFaultIo;

class ExportFaultIo extends RetirementFaultIo {}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(FontCatalog.load);
  for (final fault in ['directory', 'close']) {
    test(
      'D17 export $fault rejection retains paid real private effect custody until explicit reap',
      () async {
        final root = await Directory.systemTemp.createTemp('d17-export-');
        final budget = WorkBudgetController();
        final op = WorkOperation.create();
        final target = File('${root.path}/actual.png');
        final gateway = WindowsDocumentGateway(
          picker: HostPicker(target.path),
          io: HostIo(),
          stagingDirectory: root,
          budget: budget,
        );
        final io = ExportFaultIo()
          ..failDirectory = fault == 'directory'
          ..failClose = fault == 'close';
        final exporter = SequentialExportService(
          renderer: CanvasVariantRenderer(budget: budget),
          gateway: gateway,
          stagingDirectory: root,
          budget: budget,
          io: io,
        );
        try {
          final bundle = await fixtureBundle();
          final selection = ExportSelection(
            locales: [AppLocale.ptPT],
            formats: [ExportFormat.square],
            encoding: ImageEncoding.png,
            bundleAsZip: false,
            destinationApproved: true,
          );
          final names = (await exporter.preflight(
            bundle,
            selection,
            operation: op,
          )).proposedNames;
          final destination = (await gateway.prepareSave(
            names,
            'image/png',
            operation: op,
          ))!;
          final events = await exporter
              .export(
                bundle,
                selection,
                destination: destination,
                operation: op,
              )
              .toList();
          expect(events.last.status, ExportStatus.failed);
          expect(events.last.residual, isTrue);
          if (fault == 'directory') {
            expect(events.last.receipt!.status, WriteStatus.completed);
            expect(await target.exists(), isTrue);
          } else {
            expect(await io.held!.length(), greaterThan(0));
            expect(
              budget.reservedBytes,
              512 * 1024,
              reason:
                  'Unclosed actual writer cannot refund its streaming payment',
            );
          }
          expect(
            PrivateEffectCustody.retainedCount,
            1,
            reason:
                'A residual flag without an actual paid owner loses custody',
          );
        } finally {
          io.failClose = false;
          io.failDirectory = false;
          await PrivateEffectCustody.reap();
          await gateway.close();
          await op.finish();
          await root.delete(recursive: true);
        }
        expect(budget.reservedBytes, 0);
      },
    );
  }
}
