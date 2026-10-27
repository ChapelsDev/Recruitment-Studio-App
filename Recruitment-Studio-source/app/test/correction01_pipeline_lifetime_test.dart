import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

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
import 'package:recruitment_studio/features/projects/project_bundle.dart';
import 'package:recruitment_studio/shared/operation.dart';
import 'package:recruitment_studio/shared/work_budget.dart';

import 'support/project_fixtures.dart';
import 'features/documents/windows_document_gateway_test.dart'
    show HostIo, HostPicker;
import 'correction01_same_root_test.dart' show IdentityRenderer;

class HeldNativeIo implements WindowsDocumentIo {
  final real = HostIo();
  final entered = Completer<void>(), release = Completer<void>();
  @override
  Future<void> closeOutput(String id) async {
    entered.complete();
    await release.future;
    await real.closeOutput(id);
  }

  @override
  Future<bool> exists(String path) => real.exists(path);
  @override
  Future<String> createTemporary(String destination) =>
      real.createTemporary(destination);
  @override
  Future<void> append(String id, Uint8List bytes) => real.append(id, bytes);
  @override
  Future<void> publishNew(String id, String destination) =>
      real.publishNew(id, destination);
  @override
  Future<WindowsDocumentRead> openRead(String path) => real.openRead(path);
  @override
  Future<String> temporaryPath(String id) => real.temporaryPath(id);
  @override
  Future<void> discardTemporary(String id) => real.discardTemporary(id);
  @override
  Future<void> forget(String id) => real.forget(id);
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(FontCatalog.load);
  for (final encoding in ImageEncoding.values) {
    test(
      'D21 real $encoding selected pipeline keeps one same-root maximum workspace through held native close and sequential last uses',
      () async {
        final root = await Directory.systemTemp.createTemp('d21-native-tail-');
        final budget = WorkBudgetController();
        final request = WorkOperation.create(),
            competitor = WorkOperation.create();
        final io = HeldNativeIo();
        final target = File('${root.path}/actual.zip');
        final gateway = WindowsDocumentGateway(
          picker: HostPicker(target.path),
          io: io,
          stagingDirectory: root,
          budget: budget,
        );
        final trace = <String>[];
        final renderer = IdentityRenderer(
          CanvasVariantRenderer(
            budget: budget,
            testHooks: RendererTestHooks(onEvent: trace.add),
          ),
        );
        final exporter = SequentialExportService(
          renderer: renderer,
          gateway: gateway,
          stagingDirectory: root,
          budget: budget,
        );
        Future<List<ExportEvent>>? exporting;
        Future<WorkLease>? waiting;
        WorkLease? admitted;
        try {
          final initial = await fixtureBundle();
          var project = initial.project;
          final locales = encoding == ImageEncoding.png
              ? AppLocale.values
              : [AppLocale.ptPT];
          for (final locale in locales) {
            if (!project.localeOrder.contains(locale)) {
              project = project.withLocale(locale);
            }
            project = project
                .withHeadline(locale, 'Manual')
                .withLocation(locale, 'Typed');
            for (final id in project.contactIds) {
              project = project.withContact(locale, id, 'Typed contact');
            }
          }
          project = project.withSections([
            for (final section in project.sections)
              Section(
                id: section.id,
                visible: section.visible,
                titleByLocale: {
                  for (final locale in locales) locale: 'Manual section',
                },
                items: [
                  for (final item in section.items)
                    SectionItem(
                      id: item.id,
                      textByLocale: {
                        for (final locale in locales) locale: 'Typed item',
                      },
                    ),
                ],
              ),
          ]);
          final bundle = ProjectBundle(
            project,
            initial.resources,
            budget: budget,
          );
          final formats = encoding == ImageEncoding.png
              ? ExportFormat.values
              : [ExportFormat.square, ExportFormat.portrait];
          final selection = ExportSelection(
            locales: locales,
            formats: formats,
            encoding: encoding,
            bundleAsZip: true,
            destinationApproved: true,
          );
          final first = await exporter.preflight(
            bundle,
            selection,
            operation: request,
          );
          expect(first.invalidVariants, isEmpty);
          final count = locales.length * formats.length;
          final maximum = formats
              .map(
                (format) =>
                    rendererAllocationEstimate(bundle, format, encoding),
              )
              .reduce((a, b) => a > b ? a : b);
          final destination = (await gateway.prepareSave(
            first.proposedNames,
            'application/zip',
            operation: request,
          ))!;
          exporting = exporter
              .export(
                bundle,
                selection,
                destination: destination,
                operation: request,
              )
              .toList();
          await io.entered.future;
          expect(renderer.seen.length, count);
          expect(
            renderer.seen.every((operation) => identical(operation, request)),
            isTrue,
          );
          expect(
            trace.where((event) => event == 'rasterDisposed').length,
            count,
          );
          if (encoding == ImageEncoding.jpg) {
            expect(
              trace.where((event) => event == 'workerExited').length,
              count,
            );
          }
          expect(request.isFinishing, isFalse);
          expect(budget.reservedBytes, greaterThanOrEqualTo(maximum));
          waiting = budget.acquire(competitor, 1);
          expect(
            budget.queuedCount,
            1,
            reason:
                'One real heavy slot stays held by root through native tail',
          );
          io.release.complete();
          final events = await exporting;
          expect(events.last.status, ExportStatus.completed);
          admitted = await waiting;
          expect(budget.reservedBytes, 1);
          final bytes = await target.readAsBytes();
          expect(
            events.last.receipt!.confirmedSha256,
            sha256.convert(bytes).toString(),
          );
          final archive = ZipDecoder().decodeBytes(bytes, verify: true);
          expect(archive.files.length, count);
          for (final file in archive.files) {
            final image = img.decodeImage(file.content)!;
            expect(image.width, 1080);
            expect([1080, 1350, 1920], contains(image.height));
          }
          final output = Platform.environment['CONTINUATION_EVIDENCE'];
          if (output != null) {
            await target.copy('$output.d21-${encoding.name}.zip');
          }
        } finally {
          if (!io.release.isCompleted) io.release.complete();
          await exporting;
          admitted ??= await waiting;
          admitted?.release();
          await competitor.finish();
          await gateway.close();
          await request.finish();
          await root.delete(recursive: true);
        }
        expect(budget.reservedBytes, 0);
      },
    );
  }
}
