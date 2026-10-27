import 'dart:io';

import 'package:archive/archive.dart';
import 'package:crypto/crypto.dart';
import 'package:image/image.dart' as img;
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
  test('C07 cancellation after actual first ZIP raster has no external written item or invented residual and drains', () async {
    final root = await Directory.systemTemp.createTemp('c07-stop-');
    final target = File('${root.path}/selected.zip');
    final staging = await Directory('${root.path}/private').create();
    final budget = WorkBudgetController();
    final gateway = WindowsDocumentGateway(
      picker: HostPicker(target.path),
      io: HostIo(),
      stagingDirectory: staging,
      budget: budget,
    );
    final exporter = SequentialExportService(
      renderer: CanvasVariantRenderer(budget: budget),
      gateway: gateway,
      stagingDirectory: staging,
      budget: budget,
    );
    final request = WorkOperation.create();
    try {
      final bundle = await fixtureBundle();
      final selection = ExportSelection(
        locales: [AppLocale.ptPT],
        formats: [ExportFormat.square, ExportFormat.portrait],
        encoding: ImageEncoding.png,
        bundleAsZip: true,
        destinationApproved: true,
      );
      final check = await exporter.preflight(
        bundle,
        selection,
        operation: request,
      );
      final destination = (await gateway.prepareSave(
        check.proposedNames,
        selection.mimeType,
        operation: request,
      ))!;
      final events = <ExportEvent>[];
      await for (final event in exporter.export(
        bundle,
        selection,
        destination: destination,
        operation: request,
      )) {
        events.add(event);
        if (event.status == ExportStatus.progress) request.cancel();
      }
      expect(events.last.status, ExportStatus.cancelled);
      expect(events.last.completedItems, isEmpty);
      expect(
        events.last.residual,
        isFalse,
        reason:
            'Windows reservation had no external effect and actually drained',
      );
      await request.finish();
      expect(await target.exists(), isFalse);
      expect(await staging.list().toList(), isEmpty);
    } finally {
      await gateway.close();
      await request.finish();
      await root.delete(recursive: true);
    }
    expect(budget.reservedBytes, 0);
  });
  test('C10 individual JPG is real opaque encoded output with final closed byte SHA receipt', () async {
    final root = await Directory.systemTemp.createTemp('c10-jpg-');
    final budget = WorkBudgetController();
    final target = File('${root.path}/selected.jpg');
    final gateway = WindowsDocumentGateway(
      picker: HostPicker(target.path),
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
    final request = WorkOperation.create();
    try {
      final bundle = await fixtureBundle();
      final selection = ExportSelection(
        locales: [AppLocale.ptPT],
        formats: [ExportFormat.square],
        encoding: ImageEncoding.jpg,
        destinationApproved: true,
      );
      final check = await exporter.preflight(
        bundle,
        selection,
        operation: request,
      );
      final destination = (await gateway.prepareSave(
        check.proposedNames,
        selection.mimeType,
        operation: request,
      ))!;
      final events = await exporter
          .export(
            bundle,
            selection,
            destination: destination,
            operation: request,
          )
          .toList();
      expect(events.last.status, ExportStatus.completed);
      expect(events.last.completedItems, ['selected.jpg']);
      final bytes = await target.readAsBytes(),
          image = img.decodeJpg(await target.readAsBytes())!;
      expect(image.width, 1080);
      expect(image.height, 1080);
      expect(image.numChannels, 3);
      expect(events.last.receipt!.confirmedBytes, bytes.length);
      expect(
        events.last.receipt!.confirmedSha256,
        sha256.convert(bytes).toString(),
      );
      final evidence = Platform.environment['CONTINUATION_EVIDENCE'];
      if (evidence != null) {
        final dir = await Directory('$evidence/encoded')
            .create(recursive: true);
        await target.copy('${dir.path}/selected.jpg');
      }
    } finally {
      await gateway.close();
      await request.finish();
      await root.delete(recursive: true);
    }
    expect(budget.reservedBytes, 0);
  });
  test('C11 explicit invalid omissions yield only approved valid locale ZIP and otherwise never write', () async {
    final root = await Directory.systemTemp.createTemp('c11-omit-');
    final budget = WorkBudgetController();
    final target = File('${root.path}/chosen.zip'), io = HostIo();
    final gateway = WindowsDocumentGateway(
      picker: HostPicker(target.path),
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
    final unapproved = WorkOperation.create(),
        approved = WorkOperation.create();
    try {
      final initial = await fixtureBundle();
      final bundle = initial.withProject(
        initial.project.withLocale(AppLocale.en),
      );
      final selection = ExportSelection(
        locales: [AppLocale.ptPT, AppLocale.en],
        formats: [ExportFormat.square],
        encoding: ImageEncoding.png,
        bundleAsZip: true,
        destinationApproved: true,
      );
      final content = await exporter.preflight(
        bundle,
        selection,
        operation: unapproved,
      );
      expect(content.validVariants.length, 1);
      expect(content.invalidVariants.length, 1);
      expect(content.contentReady, isFalse);
      final denied = (await gateway.prepareSave(
        content.proposedNames,
        selection.mimeType,
        operation: unapproved,
      ))!;
      final refusal = await exporter
          .export(bundle, selection, destination: denied, operation: unapproved)
          .last;
      expect(refusal.status, ExportStatus.failed);
      expect(io.writes, 0);
      expect(await target.exists(), isFalse);
      final chosen = selection.approve(omissions: true, destination: true);
      final next = (await gateway.prepareSave(
        content.proposedNames,
        chosen.mimeType,
        operation: approved,
      ))!;
      expect(
        (await exporter.preflight(
          bundle,
          chosen,
          destination: next,
          operation: approved,
        )).readyToExport,
        isTrue,
      );
      expect(
        (await exporter
                .export(bundle, chosen, destination: next, operation: approved)
                .last)
            .status,
        ExportStatus.completed,
      );
      final zip = ZipDecoder().decodeBytes(
        await target.readAsBytes(),
        verify: true,
      );
      expect(zip.files.map((f) => f.name), [
        'pt-PT/projeto-pt-PT-1080x1080.png',
      ]);
    } finally {
      await gateway.close();
      await unapproved.finish();
      await approved.finish();
      await root.delete(recursive: true);
    }
    expect(budget.reservedBytes, 0);
  });
  for (final fault in ['lateCollision', 'corrupt', 'closeFails', 'denyRead']) {
    test(
      'C12 real export provider $fault never claims an unverified external item',
      () async {
        final root = await Directory.systemTemp.createTemp('c12-provider-');
        final budget = WorkBudgetController();
        final target = File('${root.path}/chosen.png'), io = HostIo();
        final gateway = WindowsDocumentGateway(
          picker: HostPicker(target.path),
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
        final request = WorkOperation.create();
        try {
          final bundle = await fixtureBundle();
          final selection = ExportSelection(
            locales: [AppLocale.ptPT],
            formats: [ExportFormat.square],
            encoding: ImageEncoding.png,
            destinationApproved: true,
          );
          final content = await exporter.preflight(
            bundle,
            selection,
            operation: request,
          );
          final destination = (await gateway.prepareSave(
            content.proposedNames,
            selection.mimeType,
            operation: request,
          ))!;
          switch (fault) {
            case 'lateCollision':
              io.lateCollision = true;
            case 'corrupt':
              io.corrupt = true;
            case 'closeFails':
              io.closeFails = true;
            case 'denyRead':
              io.denyRead = true;
          }
          final event = await exporter
              .export(
                bundle,
                selection,
                destination: destination,
                operation: request,
              )
              .last;
          expect(event.status, ExportStatus.failed);
          expect(event.completedItems, isEmpty);
          expect(event.receipt!.confirmedSha256, isNull);
          if (fault == 'lateCollision') {
            expect(await target.readAsBytes(), [99]);
          }
          if (fault == 'corrupt') {
            expect(event.residual, isTrue);
            expect(await target.readAsBytes(), [4, 3, 2, 1]);
          }
          if (fault == 'closeFails' || fault == 'denyRead') {
            expect(await target.exists(), isFalse);
          }
        } finally {
          await gateway.close();
          await request.finish();
          await root.delete(recursive: true);
        }
        expect(budget.reservedBytes, 0);
      },
    );
  }
}
