import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/features/documents/document_gateway.dart';
import 'package:recruitment_studio/shared/admission_budget.dart';
import 'package:recruitment_studio/shared/operation.dart';
import 'package:recruitment_studio/shared/problem.dart';
import 'package:recruitment_studio/shared/work_limits.dart';

import 'document_causal_fix01_test.dart' show SafState;

// Synthetic Android protocol only. AndroidDocumentGateway still dispatches to
// the ACTUAL production Windows host stage, with real pins, writes and deletion.
// This Q1 teardown successor is not new Windows native acceptance evidence.
// Await ORIGINAL futures: the unchanged outer two-minute timeout does not cancel
// IO. Cleanup is success-only, never finally-based. Each native case has one
// retained custody slot, including creation before a fresh root is available.
// On error/unresolved work retain roots and admissions; do not retry cleanup.
final _retainedFixtures = List<List<Object>?>.filled(3, null);

File _file(Directory root, String name) =>
    File('${root.path}${Platform.pathSeparator}$name');

Future<List<String>> _paths(Directory root) async =>
    (await root.list().toList()).map((entry) => entry.path).toList()..sort();

class _ObservedHostStage implements DocumentChannel {
  _ObservedHostStage(this.root, this.unowned, {this.displaced});
  final Directory root;
  final File unowned;
  final Directory? displaced;
  final state = SafState()..bytes = Uint8List.fromList([1]);
  final deliveredBytes = <int>[];
  List<String> stagePaths = [];
  bool observed = false, renameAttempted = false, replacementCreated = false;
  FileSystemException? renameFailure;

  @override
  Future<Map<String, Object?>> invoke(
    String method,
    Map<String, Object?> args,
  ) async {
    if (method == 'readChunk' && !observed) {
      observed = true;
      // Enumerate only: the real create handle intentionally denies shared IO.
      stagePaths = (await _paths(root))
          .where((path) => path.endsWith('.stage') && path != unowned.path)
          .toList();
      final target = displaced;
      if (target != null) {
        renameAttempted = true;
        try {
          await root.rename(target.path);
        } on FileSystemException catch (error) {
          renameFailure = error;
          rethrow; // Real OS refusal, sanitized by the production copy path.
        }
        // Same replacement attack as the Linux witness. Windows must never
        // reach either effect while the production parent pins are held.
        await root.create();
        replacementCreated = true;
        await _file(root, 'foreign').writeAsBytes([99]);
      }
    }
    final result = await state.invoke(method, args);
    if (method == 'readChunk') {
      deliveredBytes.addAll(result['bytes'] as Uint8List);
    }
    return result;
  }
}

void main() {
  // Both original late handoff paths: plain quota exhaustion and EXTRA01's
  // acquired worker plus unchanged 4 MiB ordinary admission pressure.
  for (final heldPressure in [false, true]) {
    test(
      'WINDOWS HOST late staging quota refusal deletes only owned unpublished stage heldPressure=$heldPressure',
      () async {
        final slot = heldPressure ? 1 : 0;
        expect(
          _retainedFixtures[slot],
          isNull,
          reason: 'do not overwrite unresolved fixture custody',
        );
        final retained = <Object>[];
        _retainedFixtures[slot] = retained;
        final creatingRoot = Directory.systemTemp.createTemp(
          'windows-host-handoff-',
        );
        retained.add(creatingRoot);
        final root = await creatingRoot;
        retained.add(root);
        final budget = AdmissionBudget.shared;
        final before = budget.reservedBytes;
        final worker = heldPressure ? WorkerAdmission.acquire() : null;
        if (worker != null) retained.add(worker);
        AdmissionTicket? pressure;
        final op = Operation.create();
        retained.add(op);
        final unowned = _file(root, 'documents-foreign.stage');
        final native = _ObservedHostStage(root, unowned);
        final gateway = AndroidDocumentGateway(native, stagingDirectory: root);
        retained.add(gateway);
        if (heldPressure) {
          pressure = budget.reserve(4 * 1024 * 1024);
          retained.add(pressure);
        }
        await unowned.writeAsBytes([99]);
        final owned = <File>[];
        for (var i = 0; i < WorkLimits.stagingFiles; i++) {
          final file = await _file(root, 'owned-$i').writeAsBytes([0]);
          op.ownStaging(file);
          owned.add(file);
        }
        final originalPaths = await _paths(root);
        final ref = (await gateway.pickOpen({'image/png'}, operation: op))!;
        await Future<void>.delayed(Duration.zero);
        final paidBefore = budget.reservedBytes;
        await expectLater(
          gateway.stageRead(ref, 1, operation: op),
          throwsA(isA<CapacityExceeded>()),
        );
        await Future<void>.delayed(Duration.zero);
        expect(native.observed, isTrue);
        expect(native.stagePaths, hasLength(1));
        expect(native.deliveredBytes, [1]);
        expect(
          native.state.methods,
          containsAllInOrder(['beginRead', 'readChunk', 'endRead']),
        );
        expect(await File(native.stagePaths.single).exists(), isFalse);
        expect(await _paths(root), originalPaths);
        for (final file in owned) {
          expect(await file.readAsBytes(), [0]);
        }
        expect(await unowned.readAsBytes(), [99]);
        // Refund only this failed stage's producer/path/call payments. Existing
        // operation, capability, scalar records and held pressure stay paid.
        expect(budget.reservedBytes, paidBefore);
        expect(native.state.live, isTrue);
        final close = gateway.close();
        retained.add(close);
        expect(identical(gateway.close(), close), isTrue);
        await close;
        final finish = op.finish();
        retained.add(finish);
        await finish;
        await Future<void>.delayed(Duration.zero);
        expect(native.state.live, isFalse);
        expect(await _paths(root), [unowned.path]);
        expect(await unowned.readAsBytes(), [99]);
        await gateway.close();
        // Success gate: ORIGINAL close and finish succeeded, and all fixture IO
        // reached its expected terminal outcome. No finally bypasses the awaits.
        pressure?.release();
        worker?.release();
        // The picked capability's scalar allowance is genuinely permanent;
        // successful physical cleanup is NOT an invented all-zero budget.
        expect(budget.reservedBytes, greaterThanOrEqualTo(before + 8192));
        await root.delete(recursive: true);
        _retainedFixtures[slot] = null;
      },
      skip: !Platform.isWindows,
      timeout: const Timeout(Duration(minutes: 2)),
    );
  }

  test(
    'WINDOWS HOST pinned staging parent refuses replacement without foreign contents or cleanup',
    () async {
      expect(
        _retainedFixtures[2],
        isNull,
        reason: 'do not overwrite unresolved fixture custody',
      );
      final retained = <Object>[];
      _retainedFixtures[2] = retained;
      final creatingBase = Directory.systemTemp.createTemp(
        'windows-host-parent-',
      );
      retained.add(creatingBase);
      final base = await creatingBase;
      retained.add(base);
      final creatingRoot = Directory(
        '${base.path}${Platform.pathSeparator}stage',
      ).create();
      retained.add(creatingRoot);
      final root = await creatingRoot;
      retained.add(root);
      final displaced = Directory(
        '${base.path}${Platform.pathSeparator}displaced',
      );
      final unowned = _file(root, 'documents-foreign.stage');
      final outside = _file(base, 'outside');
      final native = _ObservedHostStage(root, unowned, displaced: displaced)
        ..state.bytes = Uint8List.fromList([4, 5]);
      final op = Operation.create();
      retained.add(op);
      final gateway = AndroidDocumentGateway(native, stagingDirectory: root);
      retained.add(gateway);
      await unowned.writeAsBytes([99]);
      await outside.writeAsBytes([88]);
      final ref = (await gateway.pickOpen({'image/png'}, operation: op))!;
      await Future<void>.delayed(Duration.zero);
      final paidBefore = AdmissionBudget.shared.reservedBytes;
      await expectLater(
        gateway.stageRead(ref, 2, operation: op),
        throwsA(
          isA<DocumentGatewayException>()
              .having(
                (e) => e.problem.code,
                'OS rename refusal',
                ProblemCode.ioFailure,
              )
              .having((e) => e.residualPlaceholder, 'no false residual', false),
        ),
      );
      await Future<void>.delayed(Duration.zero);
      expect(native.renameAttempted, isTrue);
      expect(native.renameFailure, isA<FileSystemException>());
      expect(native.replacementCreated, isFalse);
      expect(native.stagePaths, hasLength(1));
      expect(native.deliveredBytes, isEmpty);
      expect(
        native.state.methods,
        containsAllInOrder(['beginRead', 'endRead']),
      );
      expect(await root.exists(), isTrue);
      expect(await displaced.exists(), isFalse);
      expect(await _file(root, 'foreign').exists(), isFalse);
      expect(await File(native.stagePaths.single).exists(), isFalse);
      expect(await _paths(root), [unowned.path]);
      expect(await unowned.readAsBytes(), [99]);
      expect(await outside.readAsBytes(), [88]);
      expect(AdmissionBudget.shared.reservedBytes, paidBefore);
      final close = gateway.close();
      retained.add(close);
      await close;
      final finish = op.finish();
      retained.add(finish);
      await finish;
      expect(native.state.live, isFalse);
      expect(await _paths(root), [unowned.path]);
      expect(await displaced.exists(), isFalse);
      expect(await unowned.readAsBytes(), [99]);
      expect(await outside.readAsBytes(), [88]);
      // Success-only teardown. An original pending/failed fixture IO, close or
      // finish cannot reach recursive deletion or retire the retained owner.
      await base.delete(recursive: true);
      _retainedFixtures[2] = null;
    },
    skip: !Platform.isWindows,
    timeout: const Timeout(Duration(minutes: 2)),
  );
}
