import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/features/documents/document_gateway.dart';
import 'package:recruitment_studio/features/editor/editor_session.dart';
import 'package:recruitment_studio/runtime/product_runtime.dart';
import 'package:recruitment_studio/shared/admission_budget.dart';
import 'package:recruitment_studio/shared/operation.dart';
import 'package:recruitment_studio/shared/problem.dart';
import 'package:recruitment_studio/shared/work_budget.dart';

import 'support/project_fixtures.dart';

// Provider-boundary double only: the gateway, capability, stage, operation,
// budget, editor and shutdown bodies under test are the actual production ones.
// Target release requires the native abort predicate, never just an attempt.
class HeldLogoProvider implements DocumentChannel {
  final entered = Completer<void>();
  final resume = Completer<void>();
  final failedAbort = Completer<void>();
  final methods = <String>[];
  final operations = <String>[];
  bool failAbort = true;
  bool targetLive = false;
  bool aborted = false;
  int endedReads = 0;
  static const nativeId = 'joint-held-logo-source';
  String? owner;

  @override
  Future<Map<String, Object?>> invoke(
    String method,
    Map<String, Object?> args,
  ) async {
    methods.add(method);
    final operation = args['operationId'] as String;
    operations.add(operation);
    if (owner != null) expect(operation, owner);
    switch (method) {
      case 'pickOpen':
        owner = operation;
        targetLive = true;
        return {
          'status': 'picked',
          'operationId': operation,
          'opaqueId': nativeId,
          'displayName': 'selected-logo.png',
        };
      case 'beginRead':
        expect(args['opaqueId'], nativeId);
        expect(targetLive, isTrue);
        return {'status': 'ready', 'transferId': 'held-read'};
      case 'readChunk':
        expect(args['transferId'], 'held-read');
        entered.complete();
        await resume.future;
        return {
          'status': 'ready',
          'bytes': Uint8List.fromList([1]),
        };
      case 'endRead':
        expect(args['transferId'], 'held-read');
        endedReads++;
        return {'status': 'released'};
      case 'abortPrepared':
        expect(args['opaqueId'], nativeId);
        if (failAbort) {
          // The real adapter sees a supported finite failed cleanup. The
          // authoritative native target remains reachable, not refunded.
          if (!failedAbort.isCompleted) failedAbort.complete();
          return {
            'status': 'failed',
            'problem': 'ioFailure',
            'residualPlaceholder': true,
          };
        }
        aborted = true;
        return {'status': 'aborted', 'commitState': 'reserved'};
      case 'abortWrite':
        expect(args['opaqueId'], nativeId);
        if (args['releaseTarget'] == true) {
          expect(
            aborted,
            isTrue,
            reason: 'Native target release requires successful abort',
          );
          targetLive = false;
        }
        return {'status': 'released'};
      default:
        throw StateError('Unexpected provider boundary $method');
    }
  }
}

Future<(Directory, ProductRuntime, HeldLogoProvider)> logoRuntime() async {
  final root = await Directory.systemTemp.createTemp('joint-logo-');
  final provider = HeldLogoProvider();
  final budget = WorkBudgetController();
  final runtime = await ProductRuntime.open(
    root,
    (stage, domain) => AndroidDocumentGateway(
      provider,
      stagingDirectory: stage,
      budget: domain,
    ),
    budget: budget,
  );
  await runtime.adoptSession(
    EditorSession.fromBundle(await fixtureBundle(), budget: budget),
  );
  runtime.host!.preview.setPaused(true);
  await runtime.host!.preview.processingSettled;
  await runtime.scheduler!.checkpoint();
  await Future<void>.delayed(Duration.zero);
  return (root, runtime, provider);
}

Future<Object?> closeOutcome(Future<void> future) => future
    .then<Object?>((_) => null, onError: (Object error, StackTrace _) => error)
    .timeout(const Duration(milliseconds: 750), onTimeout: () => 'UNSETTLED');

final ioCloseFailure = isA<OperationException>().having(
  (error) => error.code,
  'finite code',
  ProblemCode.ioFailure,
);

Future<void> joinKnownClose(Future<void> future) async {
  final result = await closeOutcome(future);
  if (result != null) {
    expect(
      result,
      anyOf(
        ioCloseFailure,
        isA<DocumentGatewayException>().having(
          (error) => error.problem.code,
          'finite code',
          ProblemCode.ioFailure,
        ),
      ),
    );
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test('J01 runtime logo close completes after actual busy read and retained failed native abort', () async {
    final (root, runtime, provider) = await logoRuntime();
    final current = runtime.session!;
    final before = AdmissionBudget.shared.reservedBytes;
    final importing = runtime.importProfileLogo();
    Future<void>? closing;
    var actionSettled = false;
    importing.then((_) => actionSettled = true);
    try {
      await provider.entered.future.timeout(const Duration(seconds: 5));
      expect(runtime.budget.reservedBytes, greaterThanOrEqualTo(512 * 1024));
      expect(
        AdmissionBudget.shared.reservedBytes,
        greaterThanOrEqualTo(before + 32768),
      );
      closing = runtime.close();
      expect(identical(closing, runtime.close()), isTrue);
      await Future<void>.delayed(const Duration(milliseconds: 20));
      expect(actionSettled, isFalse);
      expect(
        current.isDisposed,
        isFalse,
        reason: 'Held real source use must precede model retirement',
      );
      expect(provider.targetLive, isTrue);
      provider.resume.complete();
      await provider.failedAbort.future.timeout(const Duration(seconds: 5));
      await Future<void>.delayed(const Duration(milliseconds: 20));
      expect(
        provider.endedReads,
        1,
        reason: 'The actual native read consumer has ended',
      );
      expect(provider.targetLive, isTrue);
      expect(
        AdmissionBudget.shared.reservedBytes,
        greaterThanOrEqualTo(32768),
        reason:
            'Failed exact native entry stays paid after other owners retire',
      );
      final terminal = await closeOutcome(closing);
      expect(
        terminal,
        ioCloseFailure,
        reason:
            'A stopped read with failed native cleanup must terminate '
            'honestly, not succeed or wait for its own gateway tail',
      );
      expect(runtime.unresolvedCleanup, isTrue);
      expect(runtime.closedProblem?.code, ProblemCode.ioFailure);
      expect(provider.failAbort, isTrue);
    } finally {
      if (!provider.resume.isCompleted) provider.resume.complete();
      provider.failAbort = false;
      // Baseline-only cleanup can start the first gateway close. A production
      // failed close is cached: recovery here must not pretend to release it.
      await joinKnownClose(runtime.gateway.close());
      await importing.timeout(const Duration(seconds: 5));
      await joinKnownClose(closing ?? runtime.close());
      runtime.dispose();
      await root.delete(recursive: true);
    }
    expect(provider.targetLive, isTrue);
    expect(provider.operations.toSet(), {provider.owner});
    expect(AdmissionBudget.shared.reservedBytes, greaterThanOrEqualTo(32768));
  });
}
