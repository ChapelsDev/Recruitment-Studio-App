// Preparação specification-first, não executada neste lote.
import 'dart:async';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/shared/operation.dart';

void main() {
  late Directory sandbox;
  setUp(() { sandbox = Directory.systemTemp.createTempSync('t06-accounting-owned-'); });
  tearDown(() { sandbox.deleteSync(recursive: true); });
  test('diagnóstico normal conserva os frames próprios do staging', () async {
    final op = WorkOperation.create();
    Object? error;
    StackTrace? trace;
    try {
      op.ownStaging(File('${sandbox.path}/never-created'));
    } catch (e, s) {
      error = e;
      trace = s;
    }
    expect(error, isA<ArgumentError>());
    expect(trace.toString(), contains('WorkOperation._recordStaging'));
    expect(trace.toString(), contains('WorkOperation.ownStaging'));
    await op.finish();
  });

  test('callback no-op sem captura não exige um registo de corpos', () async {
    final op = WorkOperation.create();
    expect(() => op.afterPending(() {}), returnsNormally);
    await op.finish();
  });

  test('drain antecede a fase parser e não fabrica pending em D0', () async {
    final op = WorkOperation.create();
    final drained = Completer<void>();
    final order = <String>[];
    op.registerPending(drained.future);
    op.afterPending(() => order.add('idle'));
    drained.complete();
    await Future<void>.delayed(Duration.zero);
    order.add('D0');
    expect(order, ['idle', 'D0']);
    await op.finish();
  });

  test('enrollment reentrante mantém o pagamento até ao último drain', () async {
    final op = WorkOperation.create();
    final a = Completer<void>(), b = Completer<void>();
    final enrolled = Completer<void>();
    final calls = <int>[];
    op.registerPending(a.future);
    op.afterPending(() {
      calls.add(1);
      op.registerPending(b.future);
      enrolled.complete();
    });
    op.afterPending(() => calls.add(2));
    a.complete();
    await enrolled.future;
    expect(calls, [1]);
    final done = op.finish();
    b.complete();
    await done;
    expect(calls, [1, 2]);
  });
}
