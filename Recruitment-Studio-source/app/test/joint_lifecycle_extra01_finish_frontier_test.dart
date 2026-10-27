import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/features/documents/document_gateway.dart';
import 'package:recruitment_studio/features/editor/editor_session.dart';
import 'package:recruitment_studio/features/projects/project.dart';
import 'package:recruitment_studio/runtime/product_runtime.dart';
import 'package:recruitment_studio/shared/admission_budget.dart';
import 'package:recruitment_studio/shared/operation.dart';
import 'package:recruitment_studio/shared/problem.dart';
import 'package:recruitment_studio/shared/work_budget.dart';

import 'joint_lifecycle_extra01_busy_logo_test.dart' show HeldLogoProvider;
import 'support/project_fixtures.dart';

// Read-only observation of the literal root passed to the real adapter.
// All native acquisition, streaming, cleanup and custody remain production.
final class RootObservation implements DocumentGateway {
  RootObservation(this.native);
  final AndroidDocumentGateway native;
  WorkOperation? root;

  @override
  Future<DocumentRef?> pickOpen(Set<String> types, {Operation? operation}) {
    root = operation as WorkOperation;
    return native.pickOpen(types, operation: operation);
  }

  @override
  Future<PreparedDestination?> prepareSave(
    List<String> names,
    String mime, {
    Operation? operation,
    DocumentRef? replace,
    bool overwriteApproved = false,
  }) => native.prepareSave(
    names,
    mime,
    operation: operation,
    replace: replace,
    overwriteApproved: overwriteApproved,
  );

  @override
  Future<WriteReceipt> writePrepared(
    File file,
    PreparedDestination destination,
    String name, {
    Operation? operation,
  }) => native.writePrepared(file, destination, name, operation: operation);

  @override
  Future<void> abortPrepared(
    PreparedDestination destination, {
    Operation? operation,
  }) => native.abortPrepared(destination, operation: operation);

  @override
  Future<File> stageRead(DocumentRef ref, int maximum, {Operation? operation}) {
    expect(identical(operation, root), isTrue);
    return native.stageRead(ref, maximum, operation: operation);
  }

  @override
  Future<void> close() => native.close();
}

Future<Object?> boundedOutcome(Future<void> future) => future
    .then<Object?>((_) => null, onError: (Object error, StackTrace _) => error)
    .timeout(const Duration(seconds: 5), onTimeout: () => 'UNSETTLED');

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test('J03 necessary same-root finishing operand settles busy drain but frozen host close must reject', () async {
    final directory = await Directory.systemTemp.createTemp('joint-frontier-');
    final provider = HeldLogoProvider();
    final budget = WorkBudgetController();
    late RootObservation observed;
    final runtime = await ProductRuntime.open(directory, (stage, domain) {
      observed = RootObservation(
        AndroidDocumentGateway(
          provider,
          stagingDirectory: stage,
          budget: domain,
        ),
      );
      return observed;
    }, budget: budget);
    await runtime.adoptSession(
      EditorSession.fromBundle(await fixtureBundle(), budget: budget),
    );
    final editor = runtime.session!;
    final host = runtime.host!;
    final hostTerminal = boundedOutcome(host.closed);
    host.preview.setPaused(true);
    await host.preview.processingSettled;
    await runtime.scheduler!.checkpoint();
    await Future<void>.delayed(Duration.zero);
    host.requestMedia(AssetKind.logo);
    await provider.entered.future.timeout(const Duration(seconds: 5));
    final operation = observed.root!;
    final closing = runtime.close();
    final runtimeTerminal = boundedOutcome(closing);
    expect(identical(closing, runtime.close()), isTrue);
    await Future<void>.delayed(Duration.zero);
    expect(operation.isCancelled, isTrue);
    expect(operation.isFinishing, isTrue);

    // Production cancellation has already started this real root's finish.
    // Repeating finish joins that same cached future; the held marker still
    // protects actual source last use and native custody.
    var finishSettled = false;
    final finishTerminal = boundedOutcome(operation.finish()).then((value) {
      finishSettled = true;
      return value;
    });
    await Future<void>.delayed(const Duration(milliseconds: 20));
    expect(finishSettled, isFalse);
    expect(editor.isDisposed, isFalse);
    expect(provider.targetLive, isTrue);
    expect(budget.reservedBytes, greaterThanOrEqualTo(512 * 1024));
    provider.resume.complete();
    await provider.failedAbort.future.timeout(const Duration(seconds: 5));
    final rootFailure = await finishTerminal;
    expect(rootFailure, isA<OperationException>());
    expect((rootFailure as OperationException).code, ProblemCode.ioFailure);
    final hostFailure = await hostTerminal;
    expect(hostFailure, isA<OperationException>());
    expect((hostFailure as OperationException).code, ProblemCode.ioFailure);
    final runtimeFailure = await runtimeTerminal;
    expect(runtimeFailure, isA<OperationException>());
    expect((runtimeFailure as OperationException).code, ProblemCode.ioFailure);
    expect(provider.endedReads, 1);
    expect(provider.targetLive, isTrue);
    expect(provider.methods, isNot(contains('abortWrite')));
    expect(provider.operations.toSet(), {operation.id});
    expect(editor.isDisposed, isFalse);
    expect(runtime.unresolvedCleanup, isTrue);
    expect(AdmissionBudget.shared.reservedBytes, greaterThanOrEqualTo(32768));
    expect(provider.methods.where((m) => m == 'abortPrepared').length, 2);

    // A rejected close is cached by the frozen native gateway. Recovery of
    // the real provider does not rerun that terminal future or release its
    // paid identity. Observe, do not erase, this second necessary frontier.
    provider.failAbort = false;
    final methodsBeforeRetry = provider.methods.length;
    final retry = await boundedOutcome(observed.native.close());
    expect(retry, isA<DocumentGatewayException>());
    expect(provider.methods.length, methodsBeforeRetry);
    expect(provider.targetLive, isTrue);
    expect(editor.isDisposed, isFalse);
    // Deliberately retain the genuine unresolved owners; no test-only refund,
    // synthetic native release, force-dispose, or successful close is claimed.
  });
}
