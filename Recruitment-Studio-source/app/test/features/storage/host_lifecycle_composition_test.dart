// Inert specification-first codec envelope/drain controls.
import 'dart:async';
import 'dart:io';
import 'dart:typed_data';
import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/features/editor/editor_session.dart';
import 'package:recruitment_studio/features/projects/project.dart';
import 'package:recruitment_studio/features/projects/project_bundle.dart';
import 'package:recruitment_studio/features/storage/project_codec.dart';
import 'package:recruitment_studio/shared/admission_budget.dart';
import 'package:recruitment_studio/shared/operation.dart';
import 'package:recruitment_studio/shared/work_budget.dart';

void main() {
  late Directory sandbox;
  setUp(() { sandbox = Directory.systemTemp.createTempSync('host-composition-owned-'); });
  tearDown(() { sandbox.deleteSync(recursive: true); });
  test('borrowed encode owns conservative buffer envelope through real output drain', () async {
    final budget = WorkBudgetController(), op = WorkOperation.create();
    final tail = Completer<void>();
    var reached = 0, closedBytes = 0;
    final file = File('${sandbox.path}/borrowed.recruitment');
    final bundle = ProjectBundle(Project.blank(id: 'encode'), const {});
    final codec = ZipProjectCodec(budget: budget, onPhase: (phase) {
      if (phase == 'outputClosed') {
        reached++; closedBytes = budget.reservedBytes; op.registerPending(tail.future);
      }
    });
    try {
      await codec.encode(bundle, file, operation: op);
      expect(reached, 1);
      expect(closedBytes, greaterThanOrEqualTo(16 * 1024 * 1024));
      expect(budget.reservedBytes, closedBytes);
      expect(op.isFinishing, isFalse);
      tail.complete(); await Future<void>.delayed(Duration.zero);
      expect(budget.reservedBytes, 0);
    } finally {
      if (!tail.isCompleted) { tail.complete(); }
      await op.finish();
    }
  });
  test('literal UTF16 encoder rejects before output without text replacement', () async {
    final text = String.fromCharCode(0xd800);
    final p = ImmutableProject(id: 'unicode', name: text);
    final bundle = ProjectBundle(p, const {});
    final budget = WorkBudgetController();
    final file = File('${sandbox.path}/never-created.recruitment');
    final codec = ZipProjectCodec(budget: budget);
    await expectLater(codec.encode(bundle, file), throwsFormatException);
    expect(file.existsSync(), isFalse);
    expect(p.name.codeUnits, [0xd800]);
    expect(budget.reservedBytes, 0);
  });
  test('closed drained notification is synchronous unpaid and does not reopen owner', () async {
    final op = WorkOperation.create(); await op.finish();
    final before = AdmissionBudget.shared.reservedBytes, tickets = AdmissionBudget.shared.ticketCount;
    var called = 0;
    op.afterPending(() { called++; });
    expect(called, 1);
    expect(AdmissionBudget.shared.reservedBytes, before);
    expect(AdmissionBudget.shared.ticketCount, tickets);
    expect(() => op.registerPending(Future<void>.value()), throwsStateError);
    expect(() => op.ownStaging(File('${sandbox.path}/absent')), throwsStateError);
    expect(() => WorkBudgetController().reserve(op, 1), throwsStateError);
    expect(op.isFinishing, isTrue);
  });
  test('active idle FIFO rechecks real pending and callback fault drain', () async {
    final op = WorkOperation.create(), first = Completer<void>(), second = Completer<void>();
    final order = <int>[];
    op.registerPending(first.future);
    op.afterPending(() { order.add(1); op.registerPending(second.future); });
    op.afterPending(() { order.add(2); throw StateError('callback'); });
    first.complete(); await Future<void>.delayed(Duration.zero);
    expect(order, [1]);
    second.complete(); await Future<void>.delayed(Duration.zero);
    expect(order, [1, 2]);
    await expectLater(op.finish(), throwsA(isA<OperationException>()));
    var closed = false; op.afterPending(() { closed = true; });
    expect(closed, isTrue);
  });
  test('owned failed decode finishes before already drained observation', () async {
    late WorkOperation owner;
    final budget = WorkBudgetController();
    final codec = ZipProjectCodec(budget: budget, createDecodedConsumerOperation: () {
      owner = WorkOperation.create(); return owner;
    });
    await expectLater(codec.decodeEditorSession(File('${sandbox.path}/absent.recruitment')),
      throwsA(anything));
    expect(owner.isFinishing, isTrue);
    var observed = false; owner.afterPending(() { observed = true; });
    expect(observed, isTrue);
    expect(budget.reservedBytes, 0);
    expect(() => owner.registerPending(Future<void>.value()), throwsStateError);
  });
  test('invalid resource semantics precede controlled copy capacity and observer effect', () {
    final ref = AssetRef(id: 'logo', kind: AssetKind.logo, mediaType: MediaType.png,
      width: 1, height: 1, sha256: '0' * 64);
    final p = Project.blank(id: 'invalid_digest').withLogo(ref);
    final budget = WorkBudgetController(capacityBytes: 0);
    var observer = 0;
    expect(() => ProjectBundle(p, {'logo': Uint8List.fromList([1, 2, 3])},
      budget: budget, onResourceDigest: (_) { observer++; }), throwsArgumentError);
    expect(observer, 0); expect(budget.reservedBytes, 0);
    expect(() => EditorSession(p, resources: {'logo': Uint8List.fromList([1, 2, 3])},
      budget: budget), throwsArgumentError);
    expect(budget.reservedBytes, 0);
  });
}
