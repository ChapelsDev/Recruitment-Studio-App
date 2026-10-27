import 'dart:io';

import 'package:archive/archive.dart';
import 'package:image/image.dart' as img;
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/product_application.dart';
import 'package:recruitment_studio/features/documents/document_gateway.dart';
import 'package:recruitment_studio/features/storage/project_codec.dart';

import 'features/documents/windows_document_gateway_test.dart'
    show HostIo, HostPicker;
import 'support/project_fixtures.dart';
import 'continuation01_product_journey_test.dart' show waitFor, disposeProduct;

void main() {
  testWidgets(
    'C03 real Review selection exports only selected PNG variants after explicit destination approval',
    (tester) async {
      final root = (await tester.runAsync(
        () => Directory.systemTemp.createTemp('c03-export-'),
      ))!;
      final source = File('${root.path}/fixture.recruitproj');
      final picker = HostPicker(source.path);
      try {
        await tester.runAsync(() async {
          await ZipProjectCodec().encode(await fixtureBundle(), source);
        });
        await tester.pumpWidget(
          buildFunctionalApplication(
            privateDirectory: root,
            gatewayFactory: (stage, budget) => WindowsDocumentGateway(
              picker: picker,
              io: HostIo(),
              stagingDirectory: stage,
              budget: budget,
            ),
          ),
        );
        await waitFor(tester, find.byKey(const Key('library-open')));
        await tester.tap(find.byKey(const Key('library-open')));
        await tester.pump();
        await waitFor(tester, find.byKey(const Key('step-review')));
        await tester.tap(find.byKey(const Key('step-review')));
        await tester.pump();
        await waitFor(tester, find.byKey(const Key('review-export')));
        await tester.ensureVisible(
          find.byKey(const Key('export-format-story')),
        );
        await tester.tap(find.byKey(const Key('export-format-story')));
        await tester.pump();
        picker.path = '${root.path}/selected.zip';
        await tester.tap(find.byKey(const Key('review-export')));
        await tester.pump();
        await waitFor(tester, find.byKey(const Key('export-options-confirm')));
        await tester.tap(find.byKey(const Key('export-options-confirm')));
        await tester.pump();
        await waitFor(tester, find.byKey(const Key('export-content-confirm')));
        await tester.tap(find.byKey(const Key('export-content-confirm')));
        await tester.pump();
        await waitFor(
          tester,
          find.byKey(const Key('export-destination-confirm')),
        );
        expect(find.textContaining('projeto-imagens.zip'), findsWidgets);
        await tester.tap(find.byKey(const Key('export-destination-confirm')));
        await tester.pump();
        await waitFor(tester, find.textContaining('Exportação confirmada'));
        final bytes = (await tester.runAsync(
          () => File(picker.path!).readAsBytes(),
        ))!;
        final zip = ZipDecoder().decodeBytes(bytes, verify: true);
        expect(zip.files.map((f) => f.name), [
          'pt-PT/projeto-pt-PT-1080x1080.png',
          'pt-PT/projeto-pt-PT-1080x1350.png',
        ]);
        for (final file in zip.files) {
          final image = img.decodePng(file.content)!;
          expect(image.width, 1080);
          expect(image.height, file.name.contains('1350') ? 1350 : 1080);
        }
        final evidence = Platform.environment['CONTINUATION_EVIDENCE'];
        if (evidence != null) {
          await tester.runAsync(() async {
            final dir = await Directory('$evidence/encoded')
                .create(recursive: true);
            await File(picker.path!).copy('${dir.path}/selected.zip');
            for (final file in zip.files) {
              await File('${dir.path}/${file.name.split('/').last}')
                  .writeAsBytes(file.content);
            }
          });
        }
      } finally {
        await disposeProduct(tester);
        await tester.runAsync(() => root.delete(recursive: true));
      }
    },
  );
}
