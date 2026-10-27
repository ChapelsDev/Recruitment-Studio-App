import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

// Inert source-binding controls. These do not load Win32 or simulate native
// returns. RED means an absent source custody predicate, NOT native behavior.
String span(String source, String start, String end) {
  final a = source.indexOf(start);
  final b = source.indexOf(end, a + start.length);
  if (a < 0 || b < 0) throw StateError('Source boundary absent');
  return source.substring(a, b);
}

void main() {
  final win = File('lib/features/documents/win32_document_io.dart')
      .readAsStringSync();
  final stage = File('lib/features/documents/owned_document_stage.dart')
      .readAsStringSync();
  final gateway = File('lib/features/documents/document_gateway.dart')
      .readAsStringSync();
  final windows = File('lib/features/documents/windows_document_gateway.dart')
      .readAsStringSync();
  final open = span(win, '  int openRelative(', '  String identity(');
  final temporary = span(
    win,
    '  Future<String> createTemporary(',
    '  @override\n  Future<void> append(',
  );
  final discard = span(
    win,
    '  Future<void> discardTemporary(',
    '  Future<void> closeAll(',
  );
  final creation = span(
    stage,
    'final class _WindowsDocumentStage',
    '  @override\n  Future<void> write(',
  );

  test('EXTRA01 SOURCE create free failure transfers exact handle before any close', () {
    final catchBody = open.substring(open.indexOf('} catch (error)'));
    final transfer = catchBody.indexOf('if (create)');
    expect(transfer, greaterThanOrEqualTo(0));
    expect(transfer, lessThan(catchBody.indexOf('close(opened!)')));
    expect(catchBody, contains('created: true'));
    expect(catchBody, contains('_nativeArgumentFailure(error)'));
  });
  test('EXTRA01 SOURCE noncreation close failure remains distinct from creation effect', () {
    final failure = span(
      win,
      'final class _WinOpenFailure',
      'final class _WinPinFailure',
    );
    expect(failure, contains('this.created = false'));
    expect(failure, contains('final bool created;'));
    expect(
      open,
      contains('_WinOpenFailure(opened!, _nativeArgumentFailure(error))'),
    );
    expect(
      open.indexOf('if (status < 0)'),
      lessThan(open.indexOf('opened = out.cast<ffi.IntPtr>().value')),
    );
  });
  test(
    'EXTRA01 SOURCE temporary effect captured before identity allocation',
    () {
      expect(temporary, contains('var createdEffect = false;'));
      expect(
        temporary.indexOf('createdEffect = true;'),
        greaterThan(temporary.indexOf('handle = api.openRelative')),
      );
      expect(
        temporary.indexOf('createdEffect = true;'),
        lessThan(temporary.indexOf('identity = api.identity(handle)')),
      );
      expect(temporary, contains('createdEffect = e.created;'));
      expect(temporary, contains('target.uncreated = !created.\$5;'));
      expect(
        temporary,
        isNot(contains('target.uncreated = created.\$1 == null')),
      );
    },
  );
  test('EXTRA01 SOURCE staging effect travels with both failure and ordinary success', () {
    expect(creation, contains('this.uncreated'));
    expect(creation, isNot(contains('uncreated = handle == null')));
    expect(creation, contains('(handle, pins, null as Object?, true)'));
    expect(
      creation,
      contains('(error.handle, pins, error.error, error.created)'),
    );
    expect(creation, contains('(null, pins, error, false)'));
    expect(creation, contains('(null, error.pins, error.error, false)'));
    expect(creation, contains('!opened.\$4'));
  });
  test(
    'EXTRA01 SOURCE closed unknown identity refuses lexical temporary reopen',
    () {
      final refuse = discard.indexOf('retained == null && identity.isEmpty');
      expect(refuse, greaterThanOrEqualTo(0));
      expect(refuse, lessThan(discard.indexOf('api.openRelative(')));
      expect(
        discard,
        contains('identity.isNotEmpty && api.identity(h) != identity'),
      );
      expect(
        discard.indexOf('api.identity(h) != identity'),
        lessThan(discard.indexOf('api.deleteHandle(h)')),
      );
    },
  );
  test('EXTRA01 SOURCE temporary close failure retains deletion and live handle independently', () {
    expect(discard, contains('t.handle = result.\$1 ? null : result.\$3'));
    expect(
      discard,
      contains('t.deleteRequested = t.deleteRequested || result.\$2'),
    );
    expect(
      discard.indexOf('if (result.\$4 != null)'),
      lessThan(discard.indexOf('t.ticket.release()')),
    );
    expect(
      discard.indexOf('api.deleteHandle(h)'),
      lessThan(discard.indexOf('api.close(h)')),
    );
    expect(temporary, contains('target.uncreated = !created.\$5;'));
  });
  test('EXTRA01 SOURCE residual temporary keeps initiating finite cause and paid target', () {
    expect(temporary, contains('_problem(created.\$4!)'));
    expect(temporary, contains('residualPlaceholder: true'));
    expect(
      temporary,
      contains('if (!_targets.containsKey(id)) credit.release()'),
    );
    expect(
      temporary.indexOf('_targets[id] = target'),
      lessThan(temporary.indexOf('await discardTemporary(id)')),
    );
  });
  test('EXTRA01 SOURCE forget cannot refund a closed undeleted creation', () {
    final forget = span(
      win,
      '  Future<void> forget(',
      '\n}\n\nfinal class _WinOpenFailure',
    );
    expect(forget, contains('!target.uncreated'));
    expect(forget, contains('!target.deleted'));
    expect(forget, contains('!target.published'));
    expect(
      forget.indexOf('!target.uncreated'),
      lessThan(forget.indexOf('_targets.remove(id)?.ticket.release()')),
    );
  });
  test('EXTRA01 SOURCE staging refuses absent handle without discarding effect custody', () {
    final body = stage.substring(stage.lastIndexOf('  Future<void> discard()'));
    expect(body, contains('if (uncreated || deleted) return'));
    expect(body, contains('Verificar ficheiro residual'));
    expect(
      body.indexOf('deleteHandle(h)'),
      lessThan(body.lastIndexOf('await handoff()')),
    );
    expect(creation, isNot(contains('uncreated = handle == null')));
    expect(body, isNot(contains('file.delete')));
    expect(body, isNot(contains('openRelative')));
  });
  test('EXTRA01 SOURCE unchanged gateway failure paths preserve finite residual through drain', () {
    expect(
      gateway,
      contains('if (caught is _StageCreationFailure) stage = caught.stage'),
    );
    expect(gateway, contains('_residualStages[stage] = stageCredit'));
    expect(
      gateway,
      contains('_problem(error),\n            residualPlaceholder: true'),
    );
    expect(
      windows,
      contains(
        'error is DocumentGatewayException && error.residualPlaceholder',
      ),
    );
    expect(win, contains('await discardTemporary(id)'));
    expect(win, contains('for (final id in _targets.keys.toList())'));
  });
}
