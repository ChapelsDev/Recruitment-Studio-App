import 'dart:async';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/features/projects/project.dart';
import 'package:recruitment_studio/features/projects/project_bundle.dart';
import 'package:recruitment_studio/features/storage/package_zip_io.dart';
import 'package:recruitment_studio/features/storage/project_codec.dart';
import 'package:recruitment_studio/shared/operation.dart';
import 'package:recruitment_studio/shared/problem.dart';
import 'package:recruitment_studio/shared/work_budget.dart';

import '../media/media_test_fixtures.dart';
import 'package_test_fixtures.dart';

void main() {
  late Directory root;
  late WorkBudgetController budget;

  setUp(() async {
    root = await Directory.systemTemp.createTemp('t06-paid-editor-');
    budget = WorkBudgetController();
  });

  tearDown(() async {
    expect(budget.reservedBytes, 0);
    expect(budget.queuedCount, 0);
    await root.delete(recursive: true);
  });

  for (final owned in [true, false]) {
    test(
      'SPEC-S1 stop-plus-throw observes drain error (${owned ? 'owned' : 'borrowed'})',
      () async {
        final bundle = await fixtureBundle();
        final input = await writePackage(
          root,
          packageZip(packagePayload(bundle)),
        );
        final retained = bundle.resources.values.fold<int>(
          0,
          (sum, bytes) => sum + bytes.length,
        );
        final hookError = StateError('SPEC-S1 unique hook diagnostic');
        final sourceGate = Completer<void>();
        final reached = Completer<void>();
        final scenarioDone = Completer<void>();
        final extraErrors = <Object>[];
        final extraStacks = <StackTrace>[];
        final atDrain = <int>[];
        late WorkOperation source;
        Object? primaryError;
        Object? scenarioFailure;
        var factoryCalls = 0;
        var finishedAtRejection = false;
        var returnedSession = false;

        // The async method and its error observers stay in one error zone.
        // Only successful outer-zone barriers cross the zone boundary.
        runZonedGuarded(
          () async {
            try {
              source = WorkOperation.create();
              final codec = ZipProjectCodec(
                budget: budget,
                createDecodedConsumerOperation: () {
                  factoryCalls++;
                  return source;
                },
                onPhase: (phase) {
                  if (phase == 'beforePublication') {
                    source.registerPending(sourceGate.future);
                  }
                  if (phase == 'consumerDrainWaiting') {
                    atDrain.add(budget.reservedBytes);
                    source.cancel();
                    reached.complete();
                    throw hookError;
                  }
                },
              );
              try {
                final session = await codec.decodeEditorSession(
                  input,
                  operation: owned ? null : source,
                );
                returnedSession = true;
                session.dispose();
              } catch (error) {
                primaryError = error;
              }
              finishedAtRejection = source.isFinishing;
              final drained = Completer<void>();
              source.afterPending(drained.complete);
              await drained.future;
              if (!owned) {
                await source.finish();
              }
              // Actual pending drain and finish precede these event-loop
              // barriers; asynchronous extras have time to be delivered.
              await Future<void>(() {});
              await Future<void>(() {});
            } catch (error) {
              scenarioFailure = error;
            } finally {
              scenarioDone.complete();
            }
          },
          (error, stack) {
            extraErrors.add(error);
            extraStacks.add(stack);
          },
        );
        await Future.any<void>([reached.future, scenarioDone.future]);
        await Future<void>(() {});
        final paymentBeforeDrain = budget.reservedBytes;
        final finishingBeforeDrain = reached.isCompleted && source.isFinishing;
        sourceGate.complete();
        await scenarioDone.future;

        // Assertions are outside the capturing zone: failed oracles cannot
        // themselves be swallowed or mistaken for product error events.
        expect(scenarioFailure, isNull);
        expect(reached.isCompleted, isTrue);
        expect(returnedSession, isFalse);
        expect(primaryError, same(hookError));
        expect(source.isCancelled, isTrue);
        expect(factoryCalls, owned ? 1 : 0);
        expect(atDrain, hasLength(1));
        expect(atDrain.single, greaterThan(retained));
        expect(finishingBeforeDrain, owned);
        expect(finishedAtRejection, owned);
        expect(
          paymentBeforeDrain,
          owned ? atDrain.single : atDrain.single - retained,
        );
        expect(source.isFinishing, isTrue);
        expect(budget.reservedBytes, 0);
        expect(budget.queuedCount, 0);
        expect(extraStacks, hasLength(extraErrors.length));
        expect(
          extraErrors,
          isEmpty,
          reason: 'No orphan Future errors after real source drain and finish',
        );
      },
    );
  }

  test(
    'HC-01 real editor is paid before publication and after decode returns',
    () async {
      final bundle = await fixtureBundle();
      final input = await writePackage(
        root,
        packageZip(packagePayload(bundle)),
      );
      final original = await input.readAsBytes();
      final retained = bundle.resources.values.fold<int>(
        0,
        (total, bytes) => total + bytes.length,
      );
      final beforeAdoption = <int>[];
      final beforePublication = <int>[];
      final codec = ZipProjectCodec(
        budget: budget,
        onPhase: (phase) {
          if (phase == 'beforeConsumerAdoption') {
            beforeAdoption.add(budget.reservedBytes);
          }
          if (phase == 'beforePublication') {
            beforePublication.add(budget.reservedBytes);
          }
        },
      );

      final session = await codec.decodeEditorSession(input);
      try {
        expect(beforeAdoption, hasLength(1));
        expect(beforePublication, hasLength(1));
        expect(beforeAdoption.single, greaterThan(0));
        expect(beforePublication.single, beforeAdoption.single + retained);
        expect(budget.reservedBytes, retained);
        expect(
          session.bundle.project.toManifest(),
          bundle.project.toManifest(),
        );
        for (final entry in bundle.resources.entries) {
          expect(
            session.bundle.resources[entry.key],
            orderedEquals(entry.value),
          );
          expect(
            identical(session.bundle.resources[entry.key], entry.value),
            isFalse,
          );
        }
        final nextOperation = Operation.create();
        final lease = await budget.acquire(nextOperation, 1);
        lease.release();
        await nextOperation.finish();
        expect(budget.reservedBytes, retained);
        expect(await input.readAsBytes(), orderedEquals(original));
      } finally {
        session.dispose();
      }
      expect(budget.reservedBytes, 0);
    },
  );

  test(
    'HC-04 cancellation after paid adoption rolls back the editor',
    () async {
      final bundle = await fixtureBundle();
      final input = await writePackage(
        root,
        packageZip(packagePayload(bundle)),
      );
      final original = await input.readAsBytes();
      final op = WorkOperation.create();
      final observed = <int>[];
      final codec = ZipProjectCodec(
        budget: budget,
        onPhase: (phase) {
          if (phase == 'beforePublication') {
            observed.add(budget.reservedBytes);
            op.cancel();
          }
        },
      );
      await expectLater(
        codec.decodeEditorSession(input, operation: op),
        throwsA(
          isA<OperationException>().having(
            (error) => error.code,
            'code',
            ProblemCode.operationCancelled,
          ),
        ),
      );
      await op.finish();
      expect(observed, hasLength(1));
      expect(observed.single, greaterThan(0));
      expect(budget.reservedBytes, 0);
      expect(await input.readAsBytes(), orderedEquals(original));
    },
  );

  test(
    'HC-05 caller finish after adoption rolls back without taking ownership',
    () async {
      final bundle = await fixtureBundle();
      final input = await writePackage(
        root,
        packageZip(packagePayload(bundle)),
      );
      final op = WorkOperation.create();
      Future<void>? finishing;
      final observed = <int>[];
      final codec = ZipProjectCodec(
        budget: budget,
        onPhase: (phase) {
          if (phase == 'beforePublication') {
            observed.add(budget.reservedBytes);
            finishing = op.finish();
          }
        },
      );
      await expectLater(
        codec.decodeEditorSession(input, operation: op),
        throwsA(
          isA<OperationException>().having(
            (error) => error.code,
            'code',
            ProblemCode.operationCancelled,
          ),
        ),
      );
      expect(finishing, isNotNull);
      await finishing!;
      expect(observed, hasLength(1));
      expect(budget.reservedBytes, 0);
    },
  );

  test(
    'HC-06 diagnostic throw after paid adoption rolls back the editor',
    () async {
      final bundle = await fixtureBundle();
      final input = await writePackage(
        root,
        packageZip(packagePayload(bundle)),
      );
      final failure = StateError('publication diagnostic fault');
      final observed = <int>[];
      final codec = ZipProjectCodec(
        budget: budget,
        onPhase: (phase) {
          if (phase == 'beforePublication') {
            observed.add(budget.reservedBytes);
            throw failure;
          }
        },
      );
      await expectLater(
        codec.decodeEditorSession(input),
        throwsA(same(failure)),
      );
      expect(observed, hasLength(1));
      expect(budget.reservedBytes, 0);
    },
  );

  test(
    'HC-10 borrowed operation remains open and independently paid',
    () async {
      final bundle = await fixtureBundle();
      final input = await writePackage(
        root,
        packageZip(packagePayload(bundle)),
      );
      final retained = bundle.resources.values.fold<int>(
        0,
        (sum, bytes) => sum + bytes.length,
      );
      final op = WorkOperation.create();
      final session = await ZipProjectCodec(budget: budget)
          .decodeEditorSession(input, operation: op);
      try {
        expect(op.isFinishing, isFalse);
        expect(budget.reservedBytes, retained);
        final next = WorkOperation.create();
        final lease = await budget.acquire(next, 1);
        lease.release();
        await next.finish();
        await op.finish();
        expect(budget.reservedBytes, retained);
      } finally {
        session.dispose();
      }
      expect(budget.reservedBytes, 0);
    },
  );

  test(
    'HC-09 borrowed decode waits for source pending work before publication',
    () async {
      final bundle = await fixtureBundle();
      final input = await writePackage(
        root,
        packageZip(packagePayload(bundle)),
      );
      final gate = Completer<void>();
      final entered = Completer<void>();
      final op = WorkOperation.create();
      var returned = false;
      final codec = ZipProjectCodec(
        budget: budget,
        onPhase: (phase) {
          if (phase == 'beforePublication') {
            op.registerPending(gate.future);
            entered.complete();
          }
        },
      );
      final result = codec.decodeEditorSession(input, operation: op).then((
        session,
      ) {
        returned = true;
        return session;
      });
      await entered.future;
      try {
        await Future<void>(() {});
        expect(returned, isFalse);
        expect(op.isFinishing, isFalse);
      } finally {
        gate.complete();
        final session = await result;
        session.dispose();
        await op.finish();
      }
    },
  );

  test(
    'HC-07 real owned drain-finalizer fault rolls back the paid editor',
    () async {
      final bundle = await fixtureBundle();
      final input = await writePackage(
        root,
        packageZip(packagePayload(bundle)),
      );
      final owner = WorkOperation.create();
      final fault = StateError('owned finalizer fault');
      final observed = <int>[];
      final codec = ZipProjectCodec(
        budget: budget,
        createDecodedConsumerOperation: () => owner,
        onPhase: (phase) {
          if (phase == 'beforePublication') {
            observed.add(budget.reservedBytes);
            owner.registerDrainFinalizer(() {
              throw fault;
            });
          }
        },
      );
      await expectLater(
        codec.decodeEditorSession(input),
        throwsA(
          isA<OperationException>().having(
            (error) => error.code,
            'code',
            ProblemCode.ioFailure,
          ),
        ),
      );
      expect(observed, hasLength(1));
      expect(owner.isFinishing, isTrue);
      expect(budget.reservedBytes, 0);
    },
  );

  test(
    'HC-16 consumer drain diagnostic faults unwind owner and stop listener',
    () async {
      final bundle = await fixtureBundle();
      final input = await writePackage(
        root,
        packageZip(packagePayload(bundle)),
      );
      final owner = WorkOperation.create();
      final fault = StateError('consumer drain diagnostic fault');
      final paid = <int>[];
      final unexpectedDisposals = <void Function()>[];
      final codec = ZipProjectCodec(
        budget: budget,
        createDecodedConsumerOperation: () => owner,
        onPhase: (phase) {
          if (phase == 'consumerDrainWaiting') {
            paid.add(budget.reservedBytes);
            throw fault;
          }
        },
      );
      final result = codec.decodeEditorSession(input).then((session) {
        unexpectedDisposals.add(session.dispose);
        return session;
      });
      try {
        await expectLater(result, throwsA(same(fault)));
        expect(paid, hasLength(1));
        expect(paid.single, greaterThan(0));
        expect(owner.isFinishing, isTrue);
        expect(budget.reservedBytes, 0);
        owner.cancel();
        await Future<void>(() {});
      } finally {
        for (final dispose in unexpectedDisposals) {
          dispose();
        }
        await owner.finish();
      }
    },
  );

  test(
    'HC-02 legacy raw encode decode never invokes the consumer factory',
    () async {
      final bundle = await fixtureBundle();
      final codec = ZipProjectCodec(
        budget: budget,
        createDecodedConsumerOperation: () {
          throw StateError('raw routes must not use editor operation factory');
        },
      );
      final out = File('${root.path}/raw-control.rtproj');
      await codec.encode(bundle, out);
      final decoded = await codec.decode(out);
      expect(decoded.project.toManifest(), bundle.project.toManifest());
      for (final entry in bundle.resources.entries) {
        expect(decoded.resources[entry.key], orderedEquals(entry.value));
      }
      expect(budget.reservedBytes, 0);
    },
  );

  test(
    'HC-03 own finish retires source not editor and borrower skips factory',
    () async {
      final bundle = await fixtureBundle();
      final input = await writePackage(
        root,
        packageZip(packagePayload(bundle)),
      );
      final created = <WorkOperation>[];
      final codec = ZipProjectCodec(
        budget: budget,
        createDecodedConsumerOperation: () {
          final op = WorkOperation.create();
          created.add(op);
          return op;
        },
      );
      final first = await codec.decodeEditorSession(input);
      try {
        expect(created, hasLength(1));
        expect(created.single.isFinishing, isTrue);
        expect(budget.reservedBytes, greaterThan(0));
      } finally {
        first.dispose();
      }
      final borrower = WorkOperation.create();
      final second = await codec.decodeEditorSession(
        input,
        operation: borrower,
      );
      try {
        expect(created, hasLength(1));
        expect(borrower.isFinishing, isFalse);
        await borrower.finish();
        expect(budget.reservedBytes, greaterThan(0));
      } finally {
        second.dispose();
      }
    },
  );

  test(
    'HC-08 partial consumer capacity refusal preserves old paid owner',
    () async {
      final bundle = await fixtureBundle();
      final input = await writePackage(
        root,
        packageZip(packagePayload(bundle)),
      );
      final original = await input.readAsBytes();
      final retained = bundle.resources.values.fold<int>(
        0,
        (sum, bytes) => sum + bytes.length,
      );
      expect(bundle.resources, hasLength(2));
      expect(
        bundle.resources.values.every((bytes) => bytes.isNotEmpty),
        isTrue,
      );
      final oldSession = await ZipProjectCodec(budget: budget)
          .decodeEditorSession(input);
      final oldManifest = oldSession.bundle.project.toManifest();
      final foreign = WorkOperation.create();
      final releases = <void Function()>[];
      var pressure = 0;
      var entered = 0;
      var published = 0;
      final constrained = ZipProjectCodec(
        budget: budget,
        onPhase: (phase) {
          if (phase == 'beforeConsumerAdoption') {
            entered++;
            pressure =
                budget.capacityBytes - budget.reservedBytes - (retained - 1);
            final claim = budget.reserve(foreign, pressure);
            releases.add(claim.release);
          }
          if (phase == 'beforePublication') {
            published++;
          }
        },
      );
      try {
        await expectLater(
          constrained.decodeEditorSession(input),
          throwsA(isA<CapacityExceeded>()),
        );
        expect(entered, 1);
        expect(published, 0);
        expect(pressure, greaterThanOrEqualTo(0));
        expect(releases, hasLength(1));
        expect(budget.reservedBytes, retained + pressure);
        releases.single();
        await foreign.finish();
        expect(budget.reservedBytes, retained);
        expect(oldSession.isDisposed, isFalse);
        expect(oldSession.bundle.project.toManifest(), oldManifest);
        final afterPressure = await ZipProjectCodec(budget: budget)
            .decodeEditorSession(input);
        afterPressure.dispose();
        expect(budget.reservedBytes, retained);
        expect(await input.readAsBytes(), orderedEquals(original));
      } finally {
        for (final release in releases) {
          release();
        }
        await foreign.finish();
        oldSession.dispose();
      }
    },
  );

  test(
    'HC-11 two captures outlive editor disposal and retire managed bytes',
    () async {
      final bundle = await fixtureBundle();
      final input = await writePackage(
        root,
        packageZip(packagePayload(bundle)),
      );
      final session = await ZipProjectCodec(budget: budget)
          .decodeEditorSession(input);
      final first = session.captureSnapshot();
      final second = session.captureSnapshot();
      final retained = budget.reservedBytes;
      final aliases = first.bundle.resources;
      expect(identical(first.bundle, session.bundle), isTrue);
      expect(identical(second.bundle, session.bundle), isTrue);
      session.dispose();
      expect(budget.reservedBytes, retained);
      first.release();
      expect(budget.reservedBytes, retained);
      for (final entry in aliases.entries) {
        expect(
          identical(second.bundle.resources[entry.key], entry.value),
          isTrue,
        );
        expect(
          second.bundle.resources[entry.key],
          orderedEquals(bundle.resources[entry.key]!),
        );
      }
      second.release();
      expect(budget.reservedBytes, 0);
      expect(() => first.bundle, throwsStateError);
      expect(() => second.bundle, throwsStateError);
      first.release();
      second.release();
      session.dispose();
      for (final entry in aliases.entries) {
        expect(entry.value, orderedEquals(bundle.resources[entry.key]!));
      }
    },
  );

  test(
    'HC-12 text-only edit preserves copied cache targets with no new digest',
    () async {
      final bundle = await fixtureBundle();
      final input = await writePackage(
        root,
        packageZip(packagePayload(bundle)),
      );
      final phases = <String>[];
      final codec = ZipProjectCodec(budget: budget, onPhase: phases.add);
      final session = await codec.decodeEditorSession(input);
      try {
        final before = session.bundle.resources;
        phases.clear();
        session.setName('manual text-only edit');
        for (final entry in before.entries) {
          expect(
            identical(session.bundle.resources[entry.key], entry.value),
            isTrue,
          );
        }
        await codec.encode(
          session.bundle,
          File('${root.path}/text-edited.rtproj'),
        );
        expect(phases.where((phase) => phase == 'digest'), isEmpty);
      } finally {
        session.dispose();
      }
    },
  );

  test(
    'HC-13 equal role payloads have distinct ids buffers and paid charges',
    () async {
      final bundle = await fixtureBundle(identicalRoles: true);
      final input = await writePackage(
        root,
        packageZip(packagePayload(bundle)),
      );
      final session = await ZipProjectCodec(budget: budget)
          .decodeEditorSession(input);
      try {
        final refs = [
          session.bundle.project.photo,
          session.bundle.project.logo,
        ].whereType<AssetRef>().toList();
        expect(refs, hasLength(2));
        expect(refs.first.sha256, refs.last.sha256);
        expect(refs.first.id, isNot(refs.last.id));
        final a = session.bundle.resources[refs.first.id]!;
        final b = session.bundle.resources[refs.last.id]!;
        expect(a, orderedEquals(b));
        expect(identical(a, b), isFalse);
        expect(budget.reservedBytes, a.length + b.length);
      } finally {
        session.dispose();
      }
    },
  );

  test(
    'HC-15 invalid read and validation precede adoption preserving old owner',
    () async {
      final bundle = await fixtureBundle();
      final healthy = await writePackage(
        root,
        packageZip(packagePayload(bundle)),
      );
      final oldSession = await ZipProjectCodec(budget: budget)
          .decodeEditorSession(healthy);
      final retained = budget.reservedBytes;
      final original = await healthy.readAsBytes();
      final broken = File('${root.path}/malformed.rtproj');
      await broken.writeAsBytes([0, 1, 2]);
      final badBefore = await broken.readAsBytes();
      var adoption = 0;
      var publication = 0;
      final codec = ZipProjectCodec(
        budget: budget,
        onPhase: (phase) {
          if (phase == 'beforeConsumerAdoption') {
            adoption++;
          }
          if (phase == 'beforePublication') {
            publication++;
          }
        },
      );
      try {
        for (final input in [
          File('${root.path}/absent.rtproj'),
          File(root.path),
          broken,
        ]) {
          Object? legacyFailure;
          try {
            await codec.decode(input);
          } catch (error) {
            legacyFailure = error;
          }
          expect(
            legacyFailure,
            anyOf(isA<PackageFailure>(), isA<OperationException>()),
          );
          final expectedFailure = legacyFailure!;
          await expectLater(
            codec.decodeEditorSession(input),
            throwsA(
              predicate<Object>(
                (error) =>
                    error.runtimeType == expectedFailure.runtimeType &&
                    error.toString() == expectedFailure.toString(),
              ),
            ),
          );
          expect(budget.reservedBytes, retained);
          expect(oldSession.isDisposed, isFalse);
        }
        expect(adoption, 0);
        expect(publication, 0);
        expect(await broken.readAsBytes(), orderedEquals(badBefore));
        expect(await healthy.readAsBytes(), orderedEquals(original));
      } finally {
        oldSession.dispose();
      }
    },
  );

  test(
    'HC-04 delayed drain cancellation retires consumer but keeps producer paid',
    () async {
      final bundle = await fixtureBundle();
      final input = await writePackage(
        root,
        packageZip(packagePayload(bundle)),
      );
      final retained = bundle.resources.values.fold<int>(
        0,
        (sum, bytes) => sum + bytes.length,
      );
      final op = WorkOperation.create();
      final gate = Completer<void>();
      final waiting = Completer<void>();
      final atDrain = <int>[];
      final codec = ZipProjectCodec(
        budget: budget,
        onPhase: (phase) {
          if (phase == 'beforePublication') {
            op.registerPending(gate.future);
          }
          if (phase == 'consumerDrainWaiting') {
            atDrain.add(budget.reservedBytes);
            if (!waiting.isCompleted) {
              waiting.complete();
            }
          }
        },
      );
      final result = codec.decodeEditorSession(input, operation: op);
      final checked = expectLater(
        result,
        throwsA(
          isA<OperationException>().having(
            (e) => e.code,
            'code',
            ProblemCode.operationCancelled,
          ),
        ),
      );
      await waiting.future;
      try {
        op.cancel();
        await checked;
        expect(atDrain, hasLength(1));
        expect(budget.reservedBytes, atDrain.single - retained);
        expect(budget.reservedBytes, greaterThan(0));
      } finally {
        gate.complete();
        await op.finish();
      }
      expect(budget.reservedBytes, 0);
    },
  );

  for (final later in [false, true]) {
    test(
      'HC-09 idle re-enrollment later=$later delays publication until new work',
      () async {
        final bundle = await fixtureBundle();
        final input = await writePackage(
          root,
          packageZip(packagePayload(bundle)),
        );
        final op = WorkOperation.create();
        final first = Completer<void>();
        final second = Completer<void>();
        final entered = Completer<void>();
        final reentered = Completer<void>();
        var returned = false;
        var drainObserved = false;
        void enrollAgain() {
          op.registerPending(second.future);
          reentered.complete();
        }

        final codec = ZipProjectCodec(
          budget: budget,
          onPhase: (phase) {
            if (phase == 'beforePublication') {
              op.registerPending(first.future);
              if (!later) {
                op.afterPending(enrollAgain);
              }
              entered.complete();
            }
            if (phase == 'consumerDrainWaiting' && later && !drainObserved) {
              drainObserved = true;
              scheduleMicrotask(() => op.afterPending(enrollAgain));
            }
          },
        );
        final result = codec.decodeEditorSession(input, operation: op).then((
          session,
        ) {
          returned = true;
          return session;
        });
        await entered.future;
        try {
          await Future<void>(() {});
          expect(returned, isFalse);
          first.complete();
          await reentered.future;
          await Future<void>(() {});
          expect(returned, isFalse);
          expect(budget.reservedBytes, greaterThan(0));
        } finally {
          if (!first.isCompleted) {
            first.complete();
          }
          if (!second.isCompleted) {
            second.complete();
          }
          final session = await result;
          session.dispose();
          await op.finish();
        }
      },
    );
  }

  test(
    'HC-14 real preparation keeps new and sibling bytes paid through disposal',
    () async {
      final bundle = await fixtureBundle();
      final input = await writePackage(
        root,
        packageZip(packagePayload(bundle)),
      );
      final session = await ZipProjectCodec(budget: budget)
          .decodeEditorSession(input);
      final originalCapture = session.captureSnapshot();
      var armed = false;
      var callbacks = 0;
      int? during;
      final observed = ProjectBundle(
        Project.fromManifest(
          session.bundle.project.toManifest()
            ..['name'] = 'observer preparation setup',
        ),
        session.bundle.resources,
        onResourceDigest: (_) {
          if (!armed) {
            return;
          }
          armed = false;
          callbacks++;
          session.dispose();
          originalCapture.release();
          during = budget.reservedBytes;
        },
      );
      final beforeSetupGeneration = session.generation;
      session.replaceBundle(observed);
      expect(session.generation, greaterThan(beforeSetupGeneration));
      final bytes = realPng(width: 4, height: 2);
      final incoming = ResourceEntry(
        ref: AssetRef(
          id: 'handoff-photo',
          kind: AssetKind.photo,
          mediaType: MediaType.png,
          width: 4,
          height: 2,
          sha256: sha256.convert(bytes).toString(),
        ),
        bytes: bytes,
      );
      final sibling = observed.resources[observed.project.logo!.id]!;
      try {
        armed = true;
        expect(() => session.attachResource(incoming), throwsStateError);
        expect(callbacks, 1);
        expect(session.isDisposed, isTrue);
        expect(originalCapture.isReleased, isTrue);
        expect(during, incoming.bytes.length + sibling.length);
        expect(budget.reservedBytes, 0);
      } finally {
        armed = false;
        session.dispose();
        originalCapture.release();
      }
    },
  );

  test(
    'HC-16 late owned diagnostic keeps consumer paid through finish tail',
    () async {
      final bundle = await fixtureBundle();
      final input = await writePackage(
        root,
        packageZip(packagePayload(bundle)),
      );
      final retained = bundle.resources.values.fold<int>(
        0,
        (sum, bytes) => sum + bytes.length,
      );
      final owner = WorkOperation.create();
      final gate = Completer<void>();
      final entered = Completer<void>();
      final fault = StateError('late owned drain diagnostic fault');
      final codec = ZipProjectCodec(
        budget: budget,
        createDecodedConsumerOperation: () => owner,
        onPhase: (phase) {
          if (phase == 'consumerDrainWaiting') {
            owner.registerPending(gate.future);
            entered.complete();
            throw fault;
          }
        },
      );
      final checked = expectLater(
        codec.decodeEditorSession(input),
        throwsA(same(fault)),
      );
      await entered.future;
      try {
        await Future<void>(() {});
        expect(owner.isFinishing, isTrue);
        expect(budget.reservedBytes, retained);
      } finally {
        gate.complete();
        await checked;
      }
      expect(budget.reservedBytes, 0);
    },
  );
}
