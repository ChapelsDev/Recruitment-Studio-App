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
import 'features/documents/windows_document_gateway_test.dart' show HostIo, HostPicker;

void main() {
 TestWidgetsFlutterBinding.ensureInitialized();
 setUpAll(FontCatalog.load);
 test('F01 real selected PNG ZIP has exact count CRC dimensions and verified closed destination receipt', () async {
  final root=await Directory.systemTemp.createTemp('f01-real-export-');
  final budget=WorkBudgetController();
  final target=File('${root.path}/chosen.zip');
  final gateway=WindowsDocumentGateway(picker:HostPicker(target.path),io:HostIo(),stagingDirectory:root,budget:budget);
  final exporter=SequentialExportService(renderer:CanvasVariantRenderer(budget:budget),gateway:gateway,stagingDirectory:root,budget:budget);
  final op=WorkOperation.create();
  try {
   final b=await fixtureBundle();
   final selection=ExportSelection(locales:[AppLocale.ptPT],formats:[ExportFormat.square,ExportFormat.portrait],encoding:ImageEncoding.png,bundleAsZip:true,destinationApproved:true);
   final first=await exporter.preflight(b,selection,operation:op);
   final d=(await gateway.prepareSave(first.proposedNames,'application/zip',operation:op))!;
   expect((await exporter.preflight(b,selection,destination:d,operation:op)).readyToExport,isTrue);
   final events=await exporter.export(b,selection,destination:d,operation:op).toList();
   expect(events.last.status,ExportStatus.completed);
   final bytes=await target.readAsBytes();
   expect(events.last.receipt!.confirmedBytes,bytes.length);
   expect(events.last.receipt!.confirmedSha256,sha256.convert(bytes).toString());
   final archive=ZipDecoder().decodeBytes(bytes,verify:true);
   expect(archive.files.length,2);
   expect(archive.files.map((f)=>f.name),[
    'pt-PT/projeto-pt-PT-1080x1080.png','pt-PT/projeto-pt-PT-1080x1350.png']);
   for(final f in archive.files) {
    final image=img.decodePng(f.content)!;
    expect(image.width,1080);
    expect(image.height,f.name.contains('1350')?1350:1080);
   }
   expect(events.where((e)=>e.status==ExportStatus.progress).length,2);
  } finally { await gateway.close(); await op.finish(); await root.delete(recursive:true); }
  expect(budget.reservedBytes,0);
 });
}
