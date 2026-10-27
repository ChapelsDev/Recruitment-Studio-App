import 'dart:io';

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

class IdentityRenderer implements BorrowedLeaseVariantRenderer {
  IdentityRenderer(this.real);
  final CanvasVariantRenderer real;
  final seen = <Operation?>[];
  @override
  Future<RenderedVariant> renderWithLease(
    ProjectBundle bundle,
    AppLocale locale,
    ExportFormat format,
    ImageEncoding encoding, {
    required WorkOperation operation,
    required WorkLease lease,
  }) {
    seen.add(operation);
    return real.renderWithLease(
      bundle,
      locale,
      format,
      encoding,
      operation: operation,
      lease: lease,
    );
  }

  @override
  Future<RenderedVariant> render(
    ProjectBundle bundle,
    AppLocale locale,
    ExportFormat format,
    ImageEncoding encoding, {
    Operation? operation,
  }) {
    seen.add(operation);
    return real.render(bundle, locale, format, encoding, operation: operation);
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(FontCatalog.load);
  test('D02 borrowed workspace rejects foreign budget owner released and undersized leases before raster effects', () async {
    final bundle = await fixtureBundle();
    final budget = WorkBudgetController(), foreign = WorkBudgetController();
    final root = WorkOperation.create(), other = WorkOperation.create();
    final effects = <String>[];
    final renderer = CanvasVariantRenderer(
      budget: budget,
      testHooks: RendererTestHooks(onEvent: effects.add),
    );
    final estimate = rendererAllocationEstimate(
      bundle,
      ExportFormat.square,
      ImageEncoding.png,
    );
    final foreignLease = await foreign.acquire(root, estimate);
    try {
      await expectLater(
        renderer.renderWithLease(
          bundle,
          AppLocale.ptPT,
          ExportFormat.square,
          ImageEncoding.png,
          operation: root,
          lease: foreignLease,
        ),
        throwsA(isA<Exception>()),
      );
      expect(effects, isEmpty);
    } finally {
      foreignLease.release();
    }
    final lease = await budget.acquire(root, estimate);
    try {
      await expectLater(
        renderer.renderWithLease(
          bundle,
          AppLocale.ptPT,
          ExportFormat.square,
          ImageEncoding.png,
          operation: other,
          lease: lease,
        ),
        throwsA(isA<Exception>()),
      );
      expect(effects, isEmpty);
    } finally {
      lease.release();
    }
    await expectLater(
      renderer.renderWithLease(
        bundle,
        AppLocale.ptPT,
        ExportFormat.square,
        ImageEncoding.png,
        operation: root,
        lease: lease,
      ),
      throwsA(isA<Exception>()),
    );
    final valid = await budget.acquire(root, estimate);
    try {
      final result = await renderer.renderWithLease(
        bundle,
        AppLocale.ptPT,
        ExportFormat.square,
        ImageEncoding.png,
        operation: root,
        lease: valid,
      );
      await result.dispose();
      expect(budget.reservedBytes, estimate);
    } finally {
      valid.release();
    }
    effects.clear();
    final small = await budget.acquire(root, estimate - 1);
    try {
      await expectLater(
        renderer.renderWithLease(
          bundle,
          AppLocale.ptPT,
          ExportFormat.square,
          ImageEncoding.png,
          operation: root,
          lease: small,
        ),
        throwsA(isA<Exception>()),
      );
      expect(effects, isEmpty);
    } finally {
      small.release();
      await root.finish();
      await other.finish();
    }
    expect(budget.reservedBytes, 0);
    expect(foreign.reservedBytes, 0);
  });
  test('D01 two real PNG variants retain native capability and literal request identity', () async {
    final root = await Directory.systemTemp.createTemp('d01-root-');
    final budget = WorkBudgetController();
    final op = WorkOperation.create();
    final gateway = WindowsDocumentGateway(
      picker: HostPicker('${root.path}/result.zip'),
      io: HostIo(),
      stagingDirectory: root,
      budget: budget,
    );
    final renderer = IdentityRenderer(CanvasVariantRenderer(budget: budget));
    final exporter = SequentialExportService(
      renderer: renderer,
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
      final first = await exporter.preflight(bundle, selection, operation: op);
      final destination = (await gateway.prepareSave(
        first.proposedNames,
        'application/zip',
        operation: op,
      ))!;
      final events = await exporter
          .export(bundle, selection, destination: destination, operation: op)
          .toList();
      expect(events.last.status, ExportStatus.completed);
      expect(renderer.seen.length, 2);
      expect(
        renderer.seen.every((value) => identical(value, op)),
        isTrue,
        reason: 'Native capability, preflight, renderer and write must use the literal request object',
      );
      expect(op.isFinishing, isFalse);
    } finally {
      await gateway.close();
      await op.finish();
      await root.delete(recursive: true);
    }
    expect(budget.reservedBytes, 0);
  });
}
