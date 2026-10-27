import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/features/documents/document_gateway.dart';
import 'package:recruitment_studio/shared/problem.dart';
import 'package:recruitment_studio/shared/admission_budget.dart';
import 'package:recruitment_studio/shared/work_limits.dart';
import 'package:recruitment_studio/shared/operation.dart';

import 'document_causal_fix01_test.dart' show SafState;

class ReplaceRoot implements DocumentChannel {
  ReplaceRoot(this.root, this.displaced);
  final Directory root, displaced;
  final state = SafState()..bytes = Uint8List.fromList([4, 5]);
  bool changed = false;
  @override
  Future<Map<String, Object?>> invoke(
    String method,
    Map<String, Object?> args,
  ) async {
    if (method == 'readChunk' && !changed) {
      changed = true;
      await root.rename(displaced.path);
      await root.create();
      await File('${root.path}/foreign').writeAsBytes([99]);
    }
    return state.invoke(method, args);
  }
}

void main() {
  test(
    'finish during stage copy joins native release without publishing bytes',
    () async {
      final root = await Directory.systemTemp.createTemp('t08-stage-finish-');
      final op = Operation.create();
      final native = SafState()
        ..bytes = Uint8List.fromList([1])
        ..finishDuringRead = op;
      final g = AndroidDocumentGateway(native, stagingDirectory: root);
      try {
        final ref = (await g.pickOpen({'image/png'}, operation: op))!;
        await expectLater(
          g.stageRead(ref, 1, operation: op),
          throwsA(anything),
        );
        expect(
          await Future.any<bool>([
            native.finishing!.then((_) => true, onError: (Object _) => true),
            Future<bool>.delayed(
              const Duration(milliseconds: 100),
              () => false,
            ),
          ]),
          isTrue,
          reason: 'the admitted stage must drain the already finishing native capability',
        );
        expect(native.live, isFalse);
        expect(await root.list().toList(), isEmpty);
      } finally {
        try {
          await g.close();
        } catch (_) {
          /* preserve historical failed residual */
        }
        try {
          await op.finish();
        } catch (_) {
          /* tested terminal outcome */
        }
        await root.delete(recursive: true);
      }
    },
  );
  test(
    'implicit stage admission refusal still releases its acquired capability',
    () async {
      final root = await Directory.systemTemp.createTemp('t08-stage-credit-');
      final native = SafState()..bytes = Uint8List.fromList([1]);
      final g = AndroidDocumentGateway(native, stagingDirectory: root);
      AdmissionTicket? pressure;
      try {
        final ref = (await g.pickOpen({'image/png'}))!;
        await Future<void>.delayed(Duration.zero);
        final budget = AdmissionBudget.shared;
        pressure = budget.reserve(
          budget.capacityBytes - budget.reservedBytes - 256 * 1024 - 8192,
        );
        await expectLater(g.stageRead(ref, 1), throwsA(anything));
        expect(
          native.live,
          isFalse,
          reason: 'admitted failure owns native terminal cleanup',
        );
        expect(await root.list().toList(), isEmpty);
      } finally {
        pressure?.release();
        await g.close();
        await root.delete(recursive: true);
      }
    },
  );
  test(
    'late operation handoff refusal retains an explicit paid staging residual',
    () async {
      final root = await Directory.systemTemp.createTemp(
        't08-handoff-refusal-',
      );
      final op = Operation.create(),
          native = SafState()..bytes = Uint8List.fromList([1]);
      final g = AndroidDocumentGateway(native, stagingDirectory: root);
      for (var i = 0; i < WorkLimits.stagingFiles; i++) {
        op.ownStaging(await File('${root.path}/owned-$i').writeAsBytes([0]));
      }
      try {
        final ref = (await g.pickOpen({'image/png'}, operation: op))!;
        await expectLater(
          g.stageRead(ref, 1, operation: op),
          throwsA(
            isA<DocumentGatewayException>()
                .having(
                  (e) => e.problem.code,
                  'initiating capacity',
                  ProblemCode.capacityExceeded,
                )
                .having(
                  (e) => e.residualPlaceholder,
                  'retained private residual',
                  true,
                ),
          ),
        );
        await expectLater(g.close(), throwsA(isA<DocumentGatewayException>()));
      } finally {
        try {
          await g.close();
        } catch (_) {
          /* retained physical diagnostic */
        }
        await op.finish();
        await root.delete(recursive: true);
      }
    },
    // Linux linkat publication cannot be safely rolled back by pathname.
    skip: !Platform.isLinux,
  );
  test('linked staging ancestor refuses before provider read or filesystem effects', () async {
    final root = await Directory.systemTemp.createTemp('t08-linked-');
    final outside = await Directory('${root.path}/outside').create();
    final leaf = await Directory('${outside.path}/leaf').create();
    await Link('${root.path}/link').create(outside.path);
    final op = Operation.create(),
        native = SafState()..bytes = Uint8List.fromList([4]);
    final g = AndroidDocumentGateway(
      native,
      stagingDirectory: Directory('${root.path}/link/leaf'),
    );
    try {
      final ref = (await g.pickOpen({'image/png'}, operation: op))!;
      await expectLater(
        g.stageRead(ref, 1, operation: op),
        throwsA(isA<DocumentGatewayException>()),
      );
      expect(native.methods, isNot(contains('beginRead')));
      expect(await leaf.list().toList(), isEmpty);
    } finally {
      await g.close();
      await op.finish();
      await root.delete(recursive: true);
    }
  });
  test(
    'replaced staging root never receives private bytes or foreign cleanup',
    () async {
      final base = await Directory.systemTemp.createTemp('t08-replace-');
      final root = await Directory('${base.path}/stage').create();
      final displaced = Directory('${base.path}/displaced');
      final native = ReplaceRoot(root, displaced), op = Operation.create();
      final g = AndroidDocumentGateway(native, stagingDirectory: root);
      try {
        final ref = (await g.pickOpen({'image/png'}, operation: op))!;
        await expectLater(
          g.stageRead(ref, 2, operation: op),
          throwsA(isA<DocumentGatewayException>()),
        );
        expect(await File('${root.path}/foreign').readAsBytes(), [99]);
        expect(
          await displaced.list().toList(),
          isEmpty,
          reason: 'failed unnamed producer has no pathname tail',
        );
      } finally {
        await g.close();
        await op.finish();
        await base.delete(recursive: true);
      }
    },
    // Linux allows renaming pinned directories; Windows refuses the attempt.
    skip: !Platform.isLinux,
  );
}
