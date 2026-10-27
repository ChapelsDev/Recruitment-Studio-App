import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/features/composition/font_catalog.dart';
import 'package:recruitment_studio/features/composition/export_format.dart';
import 'package:recruitment_studio/features/composition/variant_renderer.dart';
import 'package:recruitment_studio/features/documents/document_gateway.dart';
import 'package:recruitment_studio/features/export/export_service.dart';
import 'package:recruitment_studio/features/export/export_selection.dart';
import 'package:recruitment_studio/features/export/export_name.dart';
import 'package:recruitment_studio/features/projects/project.dart';
import 'package:recruitment_studio/shared/operation.dart';
import 'package:recruitment_studio/shared/problem.dart';
import 'package:recruitment_studio/shared/work_budget.dart';
import 'support/project_fixtures.dart';
import 'features/documents/windows_document_gateway_test.dart' show HostIo, HostPicker;

void main() {
 TestWidgetsFlutterBinding.ensureInitialized();
 setUpAll(FontCatalog.load);
 test('F01 export invalid omissions refuse writes destination pending is not ready warning stays valid', () async {
  final root = await Directory.systemTemp.createTemp('f01-export-');
  final budget = WorkBudgetController();
  final io = HostIo();
  final gateway = WindowsDocumentGateway(picker: HostPicker('${root.path}/chosen.zip'), io:io, stagingDirectory:root,budget:budget);
  final exporter = SequentialExportService(renderer:CanvasVariantRenderer(budget:budget), gateway:gateway, stagingDirectory:root,budget:budget);
  final operation=WorkOperation.create();
  try {
   final initial=await fixtureBundle();
   final bundle=initial.withProject(initial.project.withLocale(AppLocale.en));
   final selection=ExportSelection(locales:[AppLocale.ptPT,AppLocale.en], formats:[ExportFormat.square],encoding:ImageEncoding.png,bundleAsZip:true);
   final pending=await exporter.preflight(bundle,selection,operation:operation);
   expect(pending.destinationPending,isTrue);
   expect(pending.readyToExport,isFalse);
   expect(pending.validVariants.single.locale,AppLocale.ptPT);
   expect(pending.invalidVariants.single.locale,AppLocale.en);
   final destination=(await gateway.prepareSave(pending.proposedNames,'application/zip',operation:operation))!;
   final result=await exporter.export(bundle,selection,destination:destination,operation:operation).last;
   expect(result.status,ExportStatus.failed);
   expect(result.problem?.code,ProblemCode.invalidSelection);
   expect(io.writes,0);
  } finally { await gateway.close(); await operation.finish(); await root.delete(recursive:true); }
  expect(budget.reservedBytes,0);
 });
 test('F01 export filename sanitation preserves project content and Windows safety', () {
  final p=Project.blank(id:'filename').withName('CON... Équipe / test:*');
  final name=ExportName.forVariant(p.name,AppLocale.deCH,ExportFormat.story,ImageEncoding.jpg);
  expect(name,'CON-Equipe-test-de-CH-1080x1920.jpg');
  expect(ExportName.forVariant('CON',AppLocale.en,ExportFormat.square,ImageEncoding.png),'_CON-en-1080x1080.png');
  expect(p.name,'CON... Équipe / test:*');
 });
}
