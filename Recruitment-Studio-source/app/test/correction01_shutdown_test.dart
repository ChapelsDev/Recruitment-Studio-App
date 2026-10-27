import 'dart:async';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/runtime/product_runtime.dart';
import 'package:recruitment_studio/features/documents/document_gateway.dart';
import 'package:recruitment_studio/features/storage/local_repository.dart';
import 'package:recruitment_studio/shared/operation.dart';
import 'package:recruitment_studio/shared/work_budget.dart';

import 'features/documents/windows_document_gateway_test.dart'
    show HostIo, HostPicker;
import 'continuation01_runtime_drain_test.dart' show GatedPicker;

class CloseFaultGateway implements DocumentGateway {
  CloseFaultGateway(this.real);
  final DocumentGateway real;
  final entered = Completer<void>(), release = Completer<void>();
  WorkOperation? request;
  int closes = 0;
  @override
  Future<void> close() async {
    closes++;
    if (!entered.isCompleted) entered.complete();
    await release.future;
    await real.close();
    throw const FileSystemException('private cause', '/private/never-report');
  }

  @override
  Future<PreparedDestination?> prepareSave(
    List<String> names,
    String mime, {
    Operation? operation,
    DocumentRef? replace,
    bool overwriteApproved = false,
  }) {
    request = operation as WorkOperation?;
    return real.prepareSave(
      names,
      mime,
      operation: operation,
      replace: replace,
      overwriteApproved: overwriteApproved,
    );
  }

  @override
  Future<DocumentRef?> pickOpen(Set<String> mimes, {Operation? operation}) =>
      real.pickOpen(mimes, operation: operation);
  @override
  Future<File> stageRead(
    DocumentRef ref,
    int maximum, {
    Operation? operation,
  }) => real.stageRead(ref, maximum, operation: operation);
  @override
  Future<WriteReceipt> writePrepared(
    File source,
    PreparedDestination destination,
    String name, {
    Operation? operation,
  }) => real.writePrepared(source, destination, name, operation: operation);
  @override
  Future<void> abortPrepared(
    PreparedDestination destination, {
    Operation? operation,
  }) => real.abortPrepared(destination, operation: operation);
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test('D06 close reentry joins one future and repository retirement survives earlier gateway rejection', () async {
    final root = await Directory.systemTemp.createTemp('d06-close-');
    final budget = WorkBudgetController();
    final picker = GatedPicker('${root.path}/chosen.recruitproj');
    late CloseFaultGateway gateway;
    final runtime = await ProductRuntime.open(
      root,
      (stage, domain) => gateway = CloseFaultGateway(
        WindowsDocumentGateway(
          picker: picker,
          io: HostIo(),
          stagingDirectory: stage,
          budget: domain,
        ),
      ),
      budget: budget,
    );
    await runtime.create();
    runtime.host!.edit((s) => s.setName('held save'));
    final saving = runtime.saveProject();
    await picker.entered.future;
    Future<void>? nested;
    final unlink = gateway.request!.addStopListener(() {
      if (nested == null) {
        nested = runtime.close();
        nested!.ignore();
      }
    });
    final rootsBefore = ProductRuntime.unresolvedRuntimeCount;
    final closing = runtime.close();
    closing.ignore();
    final identity = identical(closing, nested);
    picker.release.complete();
    await saving;
    await gateway.entered.future;
    gateway.release.complete();
    await closing.catchError((Object _) {});
    await nested?.catchError((Object _) {});
    final next = FileLocalRepository(
      Directory('${root.path}/repository'),
      budget: budget,
    );
    try {
      expect(
        await next.listProjects(),
        isA<List<ProjectSummary>>(),
        reason: 'The independent repository lock must retire even after gateway failure',
      );
      expect(
        identity,
        isTrue,
        reason: 'Cancel callbacks must see the already-published close Future',
      );
      expect(gateway.closes, 1);
      expect(
        ProductRuntime.unresolvedRuntimeCount,
        rootsBefore + 1,
        reason: 'Disposal must not lose the paid unresolved owner',
      );
      expect(runtime.unresolvedCleanup, isTrue);
      expect(runtime.closedProblem!.code.name, 'ioFailure');
    } finally {
      unlink();
      await next.close();
      runtime.dispose();
      await root.delete(recursive: true);
    }
  });
  test('D07 disposal observes raw private close rejection without uncaught publication', () async {
    final root = await Directory.systemTemp.createTemp('d07-dispose-');
    late CloseFaultGateway gateway;
    final errors = <Object>[];
    final ended = Completer<void>();
    runZonedGuarded(
      () async {
        final runtime = await ProductRuntime.open(
          root,
          (stage, budget) => gateway = CloseFaultGateway(
            WindowsDocumentGateway(
              picker: HostPicker(null),
              io: HostIo(),
              stagingDirectory: stage,
              budget: budget,
            ),
          ),
        );
        runtime.dispose();
        await gateway.entered.future;
        gateway.release.complete();
        await Future<void>.delayed(const Duration(milliseconds: 30));
        ended.complete();
      },
      (error, stack) {
        errors.add(error);
      },
    );
    await ended.future;
    try {
      expect(
        errors,
        isEmpty,
        reason: 'Detached disposal cannot publish private errors or stacks',
      );
    } finally {
      await root.delete(recursive: true);
    }
  });
}
