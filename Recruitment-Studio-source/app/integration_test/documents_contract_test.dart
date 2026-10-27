import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:path_provider/path_provider.dart';
import 'package:recruitment_studio/features/documents/document_gateway.dart';
import 'package:recruitment_studio/shared/operation.dart';

// MANUAL NATIVE CONTRACT. No fake channel/picker and no automatic dialog driver.
// Operator must choose NEW t08-contract.recruitproj in a disposable test folder,
// then select that same document in the OPEN picker. In the second case cancel
// SAVE. Other providers/rotation/revoked grants need the separately listed native
// matrix. This file is UNEXECUTED until actual Windows/Android access exists.
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  DocumentGateway native() {
    if (Platform.isWindows) return WindowsDocumentGateway();
    if (Platform.isAndroid) {
      return AndroidDocumentGateway(const MethodDocumentChannel());
    }
    throw UnsupportedError('T08 contract requires Windows or Android');
  }

  testWidgets(
    'real picker saves closed output then opens same native document',
    (tester) async {
      await tester.runAsync(() async {
        final gateway = native();
        final op = Operation.create();
        final root = await getTemporaryDirectory();
        final source = await File('${root.path}/t08-contract-source.stage')
            .writeAsBytes([0, 1, 2, 3, 255], flush: true);
        op.ownStaging(source);
        try {
          final destination = await gateway.prepareSave(
            ['t08-contract.recruitproj'],
            'application/octet-stream',
            operation: op,
          );
          expect(
            destination,
            isNotNull,
            reason: 'operator must choose NEW destination',
          );
          final r = await gateway.writePrepared(
            source,
            destination!,
            't08-contract.recruitproj',
            operation: op,
          );
          expect(r.status, WriteStatus.completed);
          expect(r.operationId, op.id);
          expect(r.target, isNotNull);
          expect(r.confirmedBytes, 5);
          expect(
            r.confirmedSha256,
            sha256.convert([0, 1, 2, 3, 255]).toString(),
          );
          final ref = await gateway.pickOpen({
            'application/octet-stream',
          }, operation: op);
          expect(
            ref,
            isNotNull,
            reason: 'operator must open the document just written',
          );
          final staged = await gateway.stageRead(ref!, 5, operation: op);
          expect(await staged.readAsBytes(), [0, 1, 2, 3, 255]);
        } finally {
          await gateway.close();
          await op.finish();
        }
      });
    },
    timeout: const Timeout(Duration(minutes: 5)),
  );
  testWidgets('real native SAVE cancel returns no destination', (tester) async {
    await tester.runAsync(() async {
      final gateway = native();
      final op = Operation.create();
      try {
        expect(
          await gateway.prepareSave(
            ['t08-cancel.recruitproj'],
            'application/octet-stream',
            operation: op,
          ),
          isNull,
          reason: 'operator must cancel native SAVE',
        );
      } finally {
        await gateway.close();
        await op.finish();
      }
    });
  }, timeout: const Timeout(Duration(minutes: 5)));
}
