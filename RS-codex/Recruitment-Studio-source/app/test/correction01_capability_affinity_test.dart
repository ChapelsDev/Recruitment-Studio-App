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

class ImpostorOperation implements Operation {
  ImpostorOperation(this.id);
  @override
  final String id;
  @override
  bool get isCancelled => false;
  @override
  void throwIfCancelled() {}
  @override
  void cancel() {}
  @override
  void ownStaging(File file) => throw UnimplementedError();
  @override
  Future<void> finish() async {}
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(FontCatalog.load);
  test('D23 matching raw operation ID cannot approve foreign producer or stale prepared capability', () async {
    final root = await Directory.systemTemp.createTemp('d23-affinity-');
    final budget = WorkBudgetController();
    final request = WorkOperation.create();
    final io = HostIo();
    final gateway = WindowsDocumentGateway(
      picker: HostPicker('${root.path}/actual.png'),
      io: io,
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
        formats: [ExportFormat.square],
        encoding: ImageEncoding.png,
        bundleAsZip: false,
        destinationApproved: true,
      );
      final first = await exporter.preflight(
        bundle,
        selection,
        operation: request,
      );
      final destination = (await gateway.prepareSave(
        first.proposedNames,
        'image/png',
        operation: request,
      ))!;
      final binding = preparedOperationFor(gateway, destination)!;
      expect(identical(binding.operation, request), isTrue);
      expect(binding.implicit, isFalse);
      final impostor = ImpostorOperation(request.id);
      expect(
        (await exporter.preflight(
          bundle,
          selection,
          destination: destination,
          operation: impostor,
        )).readyToExport,
        isFalse,
      );
      final events = await exporter
          .export(
            bundle,
            selection,
            destination: destination,
            operation: impostor,
          )
          .toList();
      expect(events.last.status, ExportStatus.failed);
      expect(events.last.problem!.code.name, 'invalidSelection');
      expect(io.writes, 0);
      await gateway.abortPrepared(destination, operation: request);
      expect(
        () => preparedOperationFor(gateway, destination),
        throwsA(isA<DocumentGatewayException>()),
      );
    } finally {
      await gateway.close();
      await request.finish();
      await root.delete(recursive: true);
    }
  });
}
