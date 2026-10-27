import 'dart:async';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/features/documents/document_gateway.dart';
import 'package:recruitment_studio/features/editor/editor_host_controller.dart';
import 'package:recruitment_studio/features/projects/project.dart';
import 'package:recruitment_studio/features/storage/private_effect_custody.dart';
import 'package:recruitment_studio/features/storage/private_file_io.dart';
import 'package:recruitment_studio/runtime/product_documents.dart';
import 'package:recruitment_studio/shared/admission_budget.dart';
import 'package:recruitment_studio/shared/operation.dart';
import 'package:recruitment_studio/shared/problem.dart';
import 'package:recruitment_studio/shared/work_budget.dart';
import 'package:recruitment_studio/shared/work_limits.dart';

import 'joint_lifecycle_extra01_finish_frontier_test.dart' show RootObservation;
import 'local_media_last_use_extra01_close_test.dart' show LocalSourceChannel;

class CountLocalIo extends PrivateFileIo {
  RandomAccessFile? actual;
  File? source;
  int opens = 0, closes = 0;
  @override
  Future<RandomAccessFile> open(
    File file, {
    FileMode mode = FileMode.read,
  }) async {
    opens++;
    source = file;
    return actual = await super.open(file, mode: mode);
  }

  @override
  Future<void> close(RandomAccessFile handle) async {
    closes++;
    await super.close(handle);
  }
}

// Exact genuine adapter handoff; this boundary introduces only deterministic
// test pressure or a real finishing operand, not an early invented IO failure.
class StageBoundary implements DocumentGateway {
  StageBoundary(this.actual, this.handoff);
  final RootObservation actual;
  final void Function(File) handoff;
  @override
  Future<DocumentRef?> pickOpen(Set<String> types, {Operation? operation}) =>
      actual.pickOpen(types, operation: operation);
  @override
  Future<File> stageRead(
    DocumentRef ref,
    int cap, {
    Operation? operation,
  }) async {
    final file = await actual.stageRead(ref, cap, operation: operation);
    handoff(file);
    return file;
  }

  @override
  Future<PreparedDestination?> prepareSave(
    List<String> names,
    String mime, {
    Operation? operation,
    DocumentRef? replace,
    bool overwriteApproved = false,
  }) => actual.prepareSave(
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
  }) => actual.writePrepared(file, destination, name, operation: operation);
  @override
  Future<void> abortPrepared(
    PreparedDestination destination, {
    Operation? operation,
  }) => actual.abortPrepared(destination, operation: operation);
  @override
  Future<void> close() => actual.close();
}

class CopyPressureIo extends CountLocalIo {
  AdmissionTicket? pressure;
  @override
  Future<void> close(RandomAccessFile handle) async {
    await super.close(handle);
    final ordinary = AdmissionBudget.shared;
    pressure = ordinary.reserve(
      ordinary.capacityBytes - ordinary.reservedBytes,
    );
  }
}

// Both failed close attempts leave the real descriptor live. The second held
// attempt is an active retirement tail, not a transferred failed residual yet.
class FailedCloseIo extends CountLocalIo {
  final entered = Completer<void>(), resume = Completer<void>();
  final retryEntered = Completer<void>(), retryResume = Completer<void>();
  bool recover = false;
  @override
  Future<void> close(RandomAccessFile handle) async {
    if (recover) {
      await super.close(handle);
      return;
    }
    closes++;
    if (closes == 1) {
      entered.complete();
      await resume.future;
    } else {
      retryEntered.complete();
      await retryResume.future;
    }
    throw const OperationException(ProblemCode.ioFailure);
  }
}

Future<Object?> outcome(Future<void> future) => future.then<Object?>(
  (_) => null,
  onError: (Object error, StackTrace _) => error,
);

final ioFailure = isA<OperationException>().having(
  (error) => error.code,
  'finite first code',
  ProblemCode.ioFailure,
);

Future<
  (
    Directory,
    LocalSourceChannel,
    WorkBudgetController,
    RootObservation,
    ProductDocuments,
    WorkOperation,
  )
>
documents(PrivateFileIo io, {void Function(File)? handoff}) async {
  final directory = await Directory.systemTemp.createTemp('local-controls-');
  final channel = LocalSourceChannel();
  channel.memory.data = await File('test/fixtures/assets/logo.png')
      .readAsBytes();
  final budget = WorkBudgetController();
  final observed = RootObservation(
    AndroidDocumentGateway(
      channel,
      stagingDirectory: directory,
      budget: budget,
    ),
  );
  final gateway = handoff == null ? observed : StageBoundary(observed, handoff);
  final product = ProductDocuments(gateway, directory, budget, io: io);
  final request = WorkOperation.create();
  return (directory, channel, budget, observed, product, request);
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test('L08 enrolled source returns without waiting for unrelated root pending or finishing transferred input', () async {
    final io = CountLocalIo();
    final (directory, channel, budget, gateway, product, request) =
        await documents(io);
    final unrelated = Completer<void>();
    request.registerPending(unrelated.future);
    OwnedMediaInput? input;
    try {
      input = await product
          .media(AssetKind.logo, request)
          .timeout(const Duration(seconds: 5));
      expect(input, isNotNull);
      expect(input!.bytes, channel.memory.data);
      expect(io.opens, 1);
      expect(io.closes, 1);
      expect(io.source!.existsSync(), isTrue);
      expect(request.isFinishing, isFalse);
      expect(channel.nativeKeyLive, isTrue);
      expect(budget.reservedBytes, 2 * input.bytes.length);
      await expectLater(
        io.actual!.length(),
        throwsA(isA<FileSystemException>()),
      );
      var terminal = false;
      final finishing = request.finish().then((_) => terminal = true);
      await channel.released.future;
      await Future<void>.delayed(Duration.zero);
      expect(terminal, isFalse);
      expect(io.source!.existsSync(), isTrue);
      unrelated.complete();
      await finishing;
      expect(io.source!.existsSync(), isFalse);
      // This is a separately owned immutable buffer, not a borrow of the file.
      expect(input.bytes, channel.memory.data);
      expect(budget.reservedBytes, 2 * input.bytes.length);
      await input.release();
      expect(budget.reservedBytes, 0);
      // ignore: avoid_print -- machine causal test evidence only
      print(
        'LOCAL_TRANSFER closed=1 callbackReturned=true rootDidNotFinish=true '
        'inputSurvivedRoot=true copyRefundAfterRelease=true',
      );
    } finally {
      if (!unrelated.isCompleted) unrelated.complete();
      await input?.release();
      await gateway.close();
      await request.finish();
      await directory.delete(recursive: true);
    }
  });

  for (final headroom in [0, 4096, 5120, 6144]) {
    test(
      'L09 actual local admission refuses before IO with $headroom ordinary headroom',
      () async {
        final io = CountLocalIo();
        AdmissionTicket? pressure;
        File? stage;
        final (
          directory,
          channel,
          budget,
          gateway,
          product,
          request,
        ) = await documents(
          io,
          handoff: (file) {
            stage = file;
            final ordinary = AdmissionBudget.shared;
            pressure = ordinary.reserve(
              ordinary.capacityBytes - ordinary.reservedBytes - headroom,
            );
          },
        );
        final retained = PrivateEffectCustody.retainedCount;
        try {
          await expectLater(
            product.media(AssetKind.logo, request),
            throwsA(isA<CapacityExceeded>()),
          );
          expect(io.opens, 0);
          expect(io.closes, 0);
          expect(budget.reservedBytes, 0);
          expect(PrivateEffectCustody.retainedCount, retained);
          expect(stage!.existsSync(), isTrue);
          expect(channel.nativeKeyLive, isTrue);
          expect(request.isFinishing, isFalse);
          // Cleanup at exhausted admission uses the original paid native entry.
          await request.finish();
          expect(channel.nativeKeyReleasedAuthoritative, isTrue);
          expect(stage!.existsSync(), isFalse);
          // ignore: avoid_print -- machine causal test evidence only
          print(
            'LOCAL_ADMISSION headroom=$headroom opens=${io.opens} '
            'nativeReleased=${channel.nativeKeyReleasedAuthoritative}',
          );
        } finally {
          pressure?.release();
          await gateway.close();
          await request.finish();
          await directory.delete(recursive: true);
        }
      },
    );
  }

  test('L12 genuine pending cap refuses local reader before IO and preserves stage until real drain', () async {
    final io = CountLocalIo();
    final gates = <Completer<void>>[];
    late WorkOperation request;
    File? stage;
    final setup = await documents(
      io,
      handoff: (file) {
        stage = file;
        // Only the actual native source entry remains pending at this handoff.
        for (var i = 1; i < WorkLimits.pendingCompletions; i++) {
          final gate = Completer<void>();
          request.registerPending(gate.future);
          gates.add(gate);
        }
      },
    );
    final (directory, channel, budget, gateway, product, actualRoot) = setup;
    request = actualRoot;
    try {
      await expectLater(
        product.media(AssetKind.logo, request),
        throwsA(isA<CapacityExceeded>()),
      );
      expect(io.opens, 0);
      expect(budget.reservedBytes, 0);
      expect(stage!.existsSync(), isTrue);
      var terminal = false;
      final finishing = request.finish().then((_) => terminal = true);
      await channel.released.future;
      await Future<void>.delayed(Duration.zero);
      expect(terminal, isFalse);
      expect(stage!.existsSync(), isTrue);
      for (final gate in gates) {
        gate.complete();
      }
      await finishing;
      expect(stage!.existsSync(), isFalse);
    } finally {
      for (final gate in gates) {
        if (!gate.isCompleted) gate.complete();
      }
      await gateway.close();
      await request.finish();
      await directory.delete(recursive: true);
    }
  });

  test(
    'L13 already finishing same root refuses reader birth with no local IO',
    () async {
      final io = CountLocalIo();
      late WorkOperation request;
      final gate = Completer<void>();
      File? stage;
      final setup = await documents(
        io,
        handoff: (file) {
          stage = file;
          request.registerPending(gate.future);
          request.finish().ignore();
        },
      );
      final (directory, channel, budget, gateway, product, actualRoot) = setup;
      request = actualRoot;
      try {
        await expectLater(
          product.media(AssetKind.logo, request),
          throwsStateError,
        );
        expect(request.isFinishing, isTrue);
        expect(io.opens, 0);
        expect(budget.reservedBytes, 0);
        expect(stage!.existsSync(), isTrue);
        await channel.released.future;
        gate.complete();
        await request.finish();
        expect(stage!.existsSync(), isFalse);
      } finally {
        if (!gate.isCompleted) gate.complete();
        await gateway.close();
        await request.finish();
        await directory.delete(recursive: true);
      }
    },
  );

  test(
    'L10 copy admission refusal after actual close cannot publish hidden input',
    () async {
      final io = CopyPressureIo();
      final (directory, channel, budget, gateway, product, request) =
          await documents(io);
      final retained = PrivateEffectCustody.retainedCount;
      var published = false;
      final importing = product
          .media(AssetKind.logo, request)
          .then<OwnedMediaInput?>((input) {
            published = true;
            return input;
          });
      try {
        await expectLater(importing, throwsA(isA<CapacityExceeded>()));
        expect(published, isFalse);
        expect(io.closes, 1);
        expect(budget.reservedBytes, 0);
        expect(PrivateEffectCustody.retainedCount, retained);
        expect(io.source!.existsSync(), isTrue);
        await expectLater(
          io.actual!.length(),
          throwsA(isA<FileSystemException>()),
        );
        await request.finish();
        expect(channel.nativeKeyReleasedAuthoritative, isTrue);
        expect(io.source!.existsSync(), isFalse);
      } finally {
        io.pressure?.release();
        await gateway.close();
        await request.finish();
        await directory.delete(recursive: true);
      }
    },
  );

  test('L11 active close failure retry holds stage then transfers paid actual descriptor and finite root failure', () async {
    final io = FailedCloseIo();
    final (directory, channel, budget, gateway, product, request) =
        await documents(io);
    final retained = PrivateEffectCustody.retainedCount;
    final stop = request.addStopListener(() {
      if (request.isCancelled) request.finish().ignore();
    });
    final importing = product.media(AssetKind.logo, request);
    importing.ignore();
    try {
      await io.entered.future;
      request.cancel();
      var terminal = false;
      final finishing = outcome(request.finish()).then((error) {
        terminal = true;
        return error;
      });
      await channel.released.future;
      io.resume.complete();
      await io.retryEntered.future;
      await Future<void>.delayed(Duration.zero);
      expect(terminal, isFalse);
      expect(io.source!.existsSync(), isTrue);
      expect(await io.actual!.length(), channel.memory.data.length);
      expect(budget.reservedBytes, 2 * channel.memory.data.length);
      expect(PrivateEffectCustody.retainedCount, retained + 1);
      io.retryResume.complete();
      await expectLater(importing, throwsA(ioFailure));
      expect(await finishing, ioFailure);
      expect(terminal, isTrue);
      // IO has settled with an actual failed residual, not a phantom success.
      expect(await io.actual!.length(), channel.memory.data.length);
      expect(io.closes, 2);
      expect(budget.reservedBytes, 2 * channel.memory.data.length);
      expect(PrivateEffectCustody.retainedCount, retained + 1);
      expect(
        AdmissionBudget.shared.reservedBytes,
        greaterThanOrEqualTo(64 * 1024),
      );
      expect(channel.nativeKeyReleasedAuthoritative, isTrue);
      // ignore: avoid_print -- machine causal test evidence only
      print(
        'LOCAL_FAILED_RESIDUAL activeRetryHeldStage=true rootCode=ioFailure '
        'fdLive=true closes=${io.closes} copy=${budget.reservedBytes}',
      );
    } finally {
      stop();
      if (!io.resume.isCompleted) io.resume.complete();
      if (!io.retryResume.isCompleted) io.retryResume.complete();
      await outcome(importing.then<void>((_) {}));
      await outcome(request.finish());
      // Explicit recovery only after the failed residual has transferred.
      io.recover = true;
      expect(await PrivateEffectCustody.reap(), isTrue);
      expect(budget.reservedBytes, 0);
      expect(PrivateEffectCustody.retainedCount, retained);
      await expectLater(
        io.actual!.length(),
        throwsA(isA<FileSystemException>()),
      );
      await gateway.close();
      await directory.delete(recursive: true);
    }
  });
}
