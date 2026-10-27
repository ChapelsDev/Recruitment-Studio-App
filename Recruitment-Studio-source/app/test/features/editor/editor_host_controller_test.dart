import 'dart:async';
import 'dart:isolate';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:recruitment_studio/features/composition/export_format.dart';
import 'package:recruitment_studio/features/composition/font_catalog.dart';
import 'package:recruitment_studio/features/composition/variant_renderer.dart';
import 'package:recruitment_studio/features/editor/editor_session.dart';
import 'package:recruitment_studio/features/editor/editor_host_controller.dart';
import 'package:recruitment_studio/features/editor/preview_owner.dart';
import 'package:recruitment_studio/features/media/media_worker.dart';
import 'package:recruitment_studio/features/media/resource_service.dart';
import 'package:recruitment_studio/features/projects/project.dart';
import 'package:recruitment_studio/features/projects/project_bundle.dart';
import 'package:recruitment_studio/shared/operation.dart';
import 'package:recruitment_studio/shared/problem.dart';
import 'package:recruitment_studio/shared/work_budget.dart';

import '../composition/variant_renderer_test_fixtures.dart';
import 'preview_owner_test.dart' as preview;

Uint8List inputBytes({bool jpeg = false, int red = 100}) {
  final image = img.Image(width: 16, height: 16, numChannels: 3);
  img.fill(image, color: img.ColorRgb8(red, 60, 20));
  return Uint8List.fromList(jpeg ? img.encodeJpg(image) : img.encodePng(image));
}

class HostRig {
  HostRig({
    WorkBudgetController? budget,
    MediaWorker? worker,
    MediaByteSource? source,
    CompanyProfileSource? profile,
    bool valid = false,
    VariantRenderer? renderer,
    PreviewTestHooks? hooks,
  }) : budget = budget ?? WorkBudgetController() {
    resources = ResourceService(budget: this.budget, worker: worker);
    session = valid
        ? EditorSession.fromBundle(
            rendererFixture(small: true),
            budget: this.budget,
          )
        : EditorSession(
            ImmutableProject(id: 't10-host', localeOrder: AppLocale.values),
            budget: this.budget,
          );
    baseline = this.budget.reservedBytes;
    controller = EditorHostController(
      session: session,
      budget: this.budget,
      resources: resources,
      renderer: renderer ?? CanvasVariantRenderer(budget: this.budget),
      mediaByteSource: source,
      profileSource: profile,
      testHooks: hooks,
    );
  }
  final WorkBudgetController budget;
  late final EditorSession session;
  late final ResourceService resources;
  late final EditorHostController controller;
  late final int baseline;
  Future<void> finish() async {
    await preview.bounded(controller.close());
    expect(session.isDisposed, isFalse);
    session.dispose();
    await Future<void>.delayed(Duration.zero);
    expect(budget.reservedBytes, 0);
  }
}

Future<void> waitFor(bool Function() predicate) => preview.bounded(() async {
  while (!predicate()) {
    await Future<void>.delayed(Duration.zero);
  }
}());

void replaceIdentity(EditorHostController controller, String id) {
  final attempt = controller.session.beginLeaveAttempt()!;
  try {
    controller.edit((session) {
      expect(
        attempt.complete(
          discard: true,
          saved: false,
          transition: () => session.replaceProject(Project.blank(id: id)),
        ),
        isTrue,
      );
    });
  } finally {
    attempt.end();
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(FontCatalog.load);
  for (final kind in [AssetKind.photo, AssetKind.logo]) {
    for (final jpeg in [false, true]) {
      test('C11 real worker ${kind.name}-${jpeg ? 'jpeg' : 'png'}', () async {
        final budget = WorkBudgetController();
        final phases = <String>[];
        late OwnedMediaInput owned;
        final rig = HostRig(
          budget: budget,
          worker: MediaWorker(onPhase: phases.add),
          source: (requested, operation) async {
            expect(requested, kind);
            owned = OwnedMediaInput.copyOf(
              inputBytes(jpeg: jpeg),
              requested,
              budget,
            );
            return owned;
          },
        );
        final before = rig.session.project.toManifest();
        rig.controller.requestMedia(kind);
        await preview.bounded(rig.controller.idle);
        final ref = kind == AssetKind.photo
            ? rig.session.project.photo!
            : rig.session.project.logo!;
        expect(ref.kind, kind);
        expect(ref.mediaType, MediaType.png);
        expect(ref.width, 16);
        expect(ref.height, 16);
        expect(phases.where((p) => p == 'spawned').length, 1);
        expect(phases.where((p) => p == 'result').length, 1);
        expect(phases.where((p) => p == 'exited').length, 1);
        expect(phases.where((p) => p == 'drained').length, 1);
        expect(phases.indexOf('exited'), lessThan(phases.indexOf('drained')));
        expect(() => owned.bytes, throwsStateError);
        expect(rig.controller.mediaBusy, isFalse);
        expect(rig.session.project.edition(AppLocale.en).headline, '');
        expect(before['name'], rig.session.project.name);
        final capture = rig.session.captureSnapshot();
        final bytes = capture.bundle.resources[ref.id]!;
        expect(
          img.decodePng(bytes)!.getPixel(0, 0).r.toInt(),
          inInclusiveRange(97, 103),
        );
        capture.release();
        expect(rig.budget.reservedBytes, rig.session.historyResourceBytes);
        await rig.finish();
      });
    }
  }
  test(
    'C09 explicit scalar subset tokens cancel nonretroactive profile',
    () async {
      late HostRig rig;
      var sources = 0;
      rig = HostRig(
        profile: (operation) async {
          sources++;
          return OwnedProfileInput.fromImported(
            service: rig.resources,
            contacts: {
              'mail': sources == 1
                  ? 'manual@invalid.test'
                  : 'changed@invalid.test',
              'phone': '+351 123',
            },
            colours: {'accent': 0xff123456, 'paper': 0xffeeeeee},
          );
        },
      );
      final initial = bundleFingerprint(rig.session.bundle);
      expect(rig.controller.profileOptions, isNull);
      expect(sources, 0);
      rig.controller.requestProfile({AppLocale.en, AppLocale.fr});
      await waitFor(() => rig.controller.profileOptions != null);
      final token = rig.controller.mediaJobToken;
      final options = rig.controller.profileOptions!;
      expect(options.contactIds, {'mail', 'phone'});
      expect(options.colourRoles, {'accent', 'paper'});
      expect(options.hasLogo, isFalse);
      expect(options.eligibleLocales, {AppLocale.en, AppLocale.fr});
      expect(bundleFingerprint(rig.session.bundle), initial);
      ProfileSelection selection({
        int? job,
        Set<String>? contacts,
        Set<AppLocale>? locales,
      }) => ProfileSelection(
        jobToken: job ?? token,
        locales: locales ?? {AppLocale.en},
        contactIds: contacts ?? {'mail'},
        colourRoles: {'accent'},
        includeLogo: false,
      );
      expect(
        () => rig.controller.confirmProfile(selection(job: token - 1)),
        throwsArgumentError,
      );
      expect(
        () => rig.controller.confirmProfile(selection(contacts: {'foreign'})),
        throwsArgumentError,
      );
      expect(
        () => rig.controller.confirmProfile(selection(locales: {AppLocale.es})),
        throwsArgumentError,
      );
      rig.controller.confirmProfile(selection());
      await preview.bounded(rig.controller.idle);
      expect(rig.session.project.style.accent, 0xff123456);
      expect(rig.session.project.style.paper, 0xfff4f1e9);
      expect(rig.session.project.contactIds, ['mail']);
      expect(
        rig.session.project.edition(AppLocale.en).contacts['mail'],
        'manual@invalid.test',
      );
      for (final locale in AppLocale.values.where((l) => l != AppLocale.en)) {
        expect(rig.session.project.edition(locale).contacts['mail'], '');
      }
      final applied = bundleFingerprint(rig.session.bundle);
      rig.controller.requestProfile({AppLocale.en});
      await waitFor(() => rig.controller.profileOptions != null);
      expect(bundleFingerprint(rig.session.bundle), applied);
      rig.controller.cancelMedia();
      await preview.bounded(rig.controller.idle);
      expect(rig.controller.profileOptions, isNull);
      expect(bundleFingerprint(rig.session.bundle), applied);
      expect(
        () => rig.controller.confirmProfile(selection()),
        throwsStateError,
      );
      await rig.finish();
    },
  );
  test('C10 real service logo transfer and equal logo reuse', () async {
    late HostRig rig;
    final candidates = <OwnedProfileInput>[];
    final entries = <ResourceEntry>[];
    final phases = <String>[];
    final testConsumer = WorkOperation.create();
    rig = HostRig(
      worker: MediaWorker(onPhase: phases.add),
      profile: (operation) async {
        final input = OwnedMediaInput.copyOf(
          inputBytes(),
          AssetKind.logo,
          rig.budget,
        );
        try {
          final entry = await rig.resources.importImage(
            input.bytes,
            AssetKind.logo,
            operation: operation,
          );
          rig.budget.reserve(testConsumer, entry.bytes.lengthInBytes);
          entries.add(entry);
          final owned = OwnedProfileInput.fromImported(
            service: rig.resources,
            logo: entry,
            contacts: {'mail': 'exact profile'},
          );
          candidates.add(owned);
          return owned;
        } finally {
          await input.release();
        }
      },
    );
    try {
      for (var i = 0; i < 2; i++) {
        rig.controller.requestProfile({AppLocale.en});
        await waitFor(() => rig.controller.profileOptions != null);
        final entry = entries.last;
        expect(rig.resources.previewFor(entry), isNotEmpty);
        final before = i == 0
            ? null
            : rig.session.bundle.resources[entry.ref.id];
        rig.controller.confirmProfile(
          ProfileSelection(
            jobToken: rig.controller.mediaJobToken,
            locales: {AppLocale.en},
            contactIds: {'mail'},
            colourRoles: {},
            includeLogo: true,
          ),
        );
        await preview.bounded(rig.controller.idle);
        expect(() => rig.resources.previewFor(entry), throwsArgumentError);
        expect(() => candidates.last.value, throwsStateError);
        final capture = rig.session.captureSnapshot();
        expect(capture.bundle.project.logo!.sha256, entry.ref.sha256);
        expect(
          capture.bundle.resources[entry.ref.id],
          orderedEquals(entry.bytes),
        );
        if (before != null) {
          expect(
            identical(before, capture.bundle.resources[entry.ref.id]),
            isTrue,
          );
        }
        capture.release();
      }
      expect(phases.where((p) => p == 'drained').length, 2);
    } finally {
      entries.clear();
      candidates.clear();
      await testConsumer.finish();
      await rig.finish();
    }
  });
  for (final workerHeld in [false, true]) {
    test(
      'C17 latest wins ${workerHeld ? 'worker-result-pending' : 'source-pending'}',
      () async {
        final sourceGate = Completer<OwnedMediaInput?>();
        final workerGate = Completer<SendPort>();
        final phases = <String>[];
        var calls = 0;
        late HostRig rig;
        rig = HostRig(
          worker: MediaWorker(
            mode: workerHeld
                ? MediaWorkerMode.holdAfterResult
                : MediaWorkerMode.normal,
            onReady: (port) {
              if (!workerGate.isCompleted) {
                workerGate.complete(port);
              } else {
                port.send(true);
              }
            },
            onPhase: phases.add,
          ),
          source: (kind, operation) async {
            calls++;
            if (calls == 1 && !workerHeld) {
              return sourceGate.future;
            }
            return OwnedMediaInput.copyOf(
              inputBytes(red: calls == 1 ? 100 : 200),
              kind,
              rig.budget,
            );
          },
        );
        rig.controller.requestMedia(AssetKind.photo);
        if (workerHeld) {
          await preview.bounded(workerGate.future);
        } else {
          await waitFor(() => calls == 1);
        }
        rig.controller.requestMedia(AssetKind.photo);
        expect(calls, 1);
        expect(rig.session.project.photo, isNull);
        if (!workerHeld) {
          sourceGate.complete(
            OwnedMediaInput.copyOf(inputBytes(), AssetKind.photo, rig.budget),
          );
        }
        await preview.bounded(rig.controller.idle);
        expect(calls, 2);
        expect(
          img
              .decodePng(
                rig.session.bundle.resources[rig.session.project.photo!.id]!,
              )!
              .getPixel(0, 0)
              .r
              .toInt(),
          200,
        );
        expect(phases.where((p) => p == 'drained').length, workerHeld ? 2 : 1);
        await rig.finish();
      },
    );
  }
  for (final profile in [false, true]) {
    test(
      'C18 cross-kind photo-then-${profile ? 'profile' : 'logo'} current text survives',
      () async {
        final gate = Completer<OwnedMediaInput?>();
        var calls = 0;
        late HostRig rig;
        rig = HostRig(
          source: (kind, operation) async {
            calls++;
            if (calls == 1) {
              return gate.future;
            }
            return OwnedMediaInput.copyOf(inputBytes(), kind, rig.budget);
          },
          profile: (operation) async {
            calls++;
            return OwnedProfileInput.fromImported(
              service: rig.resources,
              contacts: {'phone': '+manual'},
            );
          },
        );
        rig.controller.requestMedia(AssetKind.photo);
        await waitFor(() => calls == 1);
        if (profile) {
          rig.controller.requestProfile({AppLocale.en});
        } else {
          rig.controller.requestMedia(AssetKind.logo);
        }
        rig.controller.edit(
          (s) => s.setHeadline(AppLocale.en, 'typed during source'),
        );
        expect(calls, 1);
        gate.complete(
          OwnedMediaInput.copyOf(inputBytes(), AssetKind.photo, rig.budget),
        );
        if (profile) {
          await waitFor(() => rig.controller.profileOptions != null);
          rig.controller.confirmProfile(
            ProfileSelection(
              jobToken: rig.controller.mediaJobToken,
              locales: {AppLocale.en},
              contactIds: {'phone'},
              colourRoles: {},
              includeLogo: false,
            ),
          );
        }
        await preview.bounded(rig.controller.idle);
        expect(calls, 2);
        expect(rig.session.project.photo, isNull);
        expect(rig.session.project.logo != null, !profile);
        expect(
          rig.session.project.edition(AppLocale.en).headline,
          'typed during source',
        );
        await rig.finish();
      },
    );
  }
  for (final boundary in ['source', 'queue', 'worker']) {
    test('C19 cancellation $boundary actual drain preserves project', () async {
      final gate = Completer<OwnedMediaInput?>();
      final ready = Completer<SendPort>();
      final budget = WorkBudgetController();
      final phases = <String>[];
      final holder = WorkOperation.create();
      WorkLease? lease;
      if (boundary == 'queue') {
        lease = await budget.acquire(holder, 1);
      }
      late HostRig rig;
      rig = HostRig(
        budget: budget,
        worker: MediaWorker(
          mode: MediaWorkerMode.holdBeforeDecode,
          onReady: ready.complete,
          onPhase: phases.add,
        ),
        source: (kind, op) async {
          if (boundary == 'source') {
            return gate.future;
          }
          return OwnedMediaInput.copyOf(inputBytes(), kind, budget);
        },
      );
      final before = bundleFingerprint(rig.session.bundle);
      rig.controller.requestMedia(AssetKind.photo);
      if (boundary == 'worker') {
        await preview.bounded(ready.future);
      } else if (boundary == 'queue') {
        await waitFor(() => budget.queuedCount == 1);
      } else {
        await waitFor(() => rig.controller.mediaBusy);
      }
      rig.controller.cancelMedia();
      if (boundary == 'source') {
        gate.complete(
          OwnedMediaInput.copyOf(inputBytes(), AssetKind.photo, budget),
        );
      }
      if (lease != null) {
        lease.release();
      }
      await holder.finish();
      await preview.bounded(rig.controller.idle);
      expect(bundleFingerprint(rig.session.bundle), before);
      expect(
        phases.where((p) => p == 'spawned').length,
        boundary == 'worker' ? 1 : 0,
      );
      if (boundary == 'worker') {
        expect(
          phases,
          containsAllInOrder(['killRequested', 'exited', 'drained']),
        );
      }
      await rig.finish();
    });
  }
  for (final equal in [false, true]) {
    test(
      'C25 destination ${equal ? 'equal-resource positive' : 'refusal rollback'}',
      () async {
        late HostRig rig;
        WorkReservation? fill;
        final filler = WorkOperation.create();
        ResourceEntry? imported;
        rig = HostRig(
          profile: (operation) async {
            final entry = await rig.resources.importImage(
              inputBytes(),
              AssetKind.logo,
              operation: operation,
            );
            imported = entry;
            final profile = OwnedProfileInput.fromImported(
              service: rig.resources,
              logo: entry,
            );
            fill = rig.budget.reserve(
              filler,
              rig.budget.capacityBytes - rig.budget.reservedBytes,
            );
            return profile;
          },
        );
        if (equal) {
          final entry = await rig.resources.importImage(
            inputBytes(),
            AssetKind.logo,
          );
          rig.session.attachResource(entry);
          await rig.resources.release(entry);
        }
        final before = bundleFingerprint(rig.session.bundle);
        final undo = rig.session.undoCount;
        rig.controller.requestProfile({AppLocale.en});
        await waitFor(() => rig.controller.profileOptions != null);
        expect(rig.budget.reservedBytes, rig.budget.capacityBytes);
        rig.controller.confirmProfile(
          ProfileSelection(
            jobToken: rig.controller.mediaJobToken,
            locales: {AppLocale.en},
            contactIds: {},
            colourRoles: {},
            includeLogo: true,
          ),
        );
        // Ignore a following preview refusal: media outcome is separately observed.
        await preview.bounded(rig.controller.idle);
        expect(bundleFingerprint(rig.session.bundle), before);
        expect(rig.session.undoCount, undo);
        expect(
          rig.controller.mediaProblem?.code,
          equal ? isNull : ProblemCode.capacityExceeded,
        );
        expect(() => rig.resources.previewFor(imported!), throwsArgumentError);
        fill!.release();
        await filler.finish();
        await rig.finish();
      },
    );
  }
  for (final boundary in ['source', 'worker']) {
    test('K01 controller close $boundary waits actual producer', () async {
      final source = Completer<OwnedMediaInput?>();
      final ready = Completer<SendPort>();
      final phases = <String>[];
      late HostRig rig;
      rig = HostRig(
        worker: MediaWorker(
          mode: MediaWorkerMode.holdAfterResult,
          onReady: ready.complete,
          onPhase: phases.add,
        ),
        source: (kind, op) async {
          if (boundary == 'source') {
            return source.future;
          }
          return OwnedMediaInput.copyOf(inputBytes(), kind, rig.budget);
        },
      );
      rig.controller.requestMedia(AssetKind.photo);
      if (boundary == 'worker') {
        await preview.bounded(ready.future);
      } else {
        await waitFor(() => rig.controller.mediaBusy);
      }
      var finished = false;
      final close = rig.controller.close().then((_) => finished = true);
      expect(finished, isFalse);
      expect(rig.controller.previewStatus, PreviewStatus.closing);
      expect(
        () => rig.controller.requestMedia(AssetKind.photo),
        throwsStateError,
      );
      if (boundary == 'source') {
        source.complete(
          OwnedMediaInput.copyOf(inputBytes(), AssetKind.photo, rig.budget),
        );
      }
      await preview.bounded(close);
      if (boundary == 'worker') {
        expect(
          phases,
          containsAllInOrder(['killRequested', 'exited', 'drained']),
        );
      }
      expect(rig.session.project.photo, isNull);
      await rig.finish();
    });
  }
  test('K02 replacement invalidates pending source immediately', () async {
    final source = Completer<OwnedMediaInput?>();
    late HostRig rig;
    rig = HostRig(source: (kind, op) => source.future);
    rig.controller.requestMedia(AssetKind.photo);
    await waitFor(() => rig.controller.mediaBusy);
    final token = rig.controller.mediaJobToken;
    replaceIdentity(rig.controller, 'new-manual');
    expect(rig.controller.mediaJobToken, greaterThan(token));
    source.complete(
      OwnedMediaInput.copyOf(inputBytes(), AssetKind.photo, rig.budget),
    );
    await preview.bounded(rig.controller.idle);
    expect(rig.session.project.id, 'new-manual');
    expect(rig.session.project.photo, isNull);
    expect(rig.session.project.edition(AppLocale.ptPT).headline, '');
    await rig.finish();
  });
  for (final dispose in [false, true]) {
    test(
      '${dispose ? 'C33' : 'K02'} captured real output ${dispose ? 'caller disposal' : 'replacement'}',
      () async {
        final budget = WorkBudgetController();
        final held = preview.RealHeldRenderer(
          CanvasVariantRenderer(budget: budget),
        );
        final rig = HostRig(budget: budget, valid: true, renderer: held);
        rig.controller.refresh();
        await preview.bounded(held.entered.future);
        final paid = budget.reservedBytes;
        if (dispose) {
          rig.session.dispose();
        } else {
          replaceIdentity(rig.controller, 'new-render');
        }
        expect(budget.reservedBytes, paid);
        final close = rig.controller.close();
        held.release.complete();
        await preview.bounded(close);
        expect(rig.controller.preview.current, isNull);
        if (!dispose) {
          expect(rig.session.project.id, 'new-render');
          await rig.finish();
        } else {
          expect(budget.reservedBytes, 0);
          await rig.controller.closed;
        }
      },
    );
  }
  test('K03 unavailable honest boundary and navigation', () async {
    final rig = HostRig();
    final before = bundleFingerprint(rig.session.bundle);
    expect(rig.controller.mediaAvailable, isFalse);
    expect(rig.controller.profileAvailable, isFalse);
    expect(rig.controller.persistenceAvailable, isFalse);
    expect(
      () => rig.controller.requestMedia(AssetKind.photo),
      throwsStateError,
    );
    expect(
      () => rig.controller.requestProfile({AppLocale.en}),
      throwsStateError,
    );
    for (final step in EditorStep.values) {
      rig.controller.selectStep(step);
      expect(rig.controller.step, step);
    }
    rig.controller.selectLocale(AppLocale.en);
    rig.controller.selectFormat(ExportFormat.portrait);
    await preview.bounded(rig.controller.idle);
    expect(bundleFingerprint(rig.session.bundle), before);
    expect(rig.session.hasConfirmedProjectSave, isFalse);
    expect(rig.controller.previewStatus, PreviewStatus.error);
    await rig.finish();
  });
  test('owned input factory refusals do not take producer ownership', () async {
    final budget = WorkBudgetController();
    expect(
      () => OwnedMediaInput.copyOf(Uint8List(0), AssetKind.photo, budget),
      throwsArgumentError,
    );
    expect(
      () => OwnedMediaInput.copyOf(Uint8List(1), AssetKind.thumbnail, budget),
      throwsArgumentError,
    );
    expect(
      () => OwnedMediaInput.copyOf(
        Uint8List(1),
        AssetKind.photo,
        WorkBudgetController(capacityBytes: 1),
      ),
      throwsA(isA<CapacityExceeded>()),
    );
    final foreign = ResourceService(budget: budget);
    final service = ResourceService(budget: budget);
    final entry = await foreign.importImage(inputBytes(), AssetKind.logo);
    expect(
      () => OwnedProfileInput.fromImported(service: service, logo: entry),
      throwsArgumentError,
    );
    expect(foreign.previewFor(entry), isNotEmpty);
    await foreign.release(entry);
    expect(budget.reservedBytes, 0);
  });

  for (final profile in [false, true]) {
    test(
      'C18 real worker photo-then-${profile ? 'profile' : 'logo'} lane',
      () async {
        final ready = Completer<SendPort>();
        final phases = <String>[];
        var calls = 0;
        late HostRig rig;
        rig = HostRig(
          worker: MediaWorker(
            mode: MediaWorkerMode.holdBeforeDecode,
            onReady: (port) {
              if (!ready.isCompleted) {
                ready.complete(port);
              } else {
                port.send(true);
              }
            },
            onPhase: phases.add,
          ),
          source: (kind, op) async {
            calls++;
            return OwnedMediaInput.copyOf(inputBytes(), kind, rig.budget);
          },
          profile: (op) async {
            calls++;
            return OwnedProfileInput.fromImported(
              service: rig.resources,
              contacts: {'phone': 'selected'},
            );
          },
        );
        rig.controller.requestMedia(AssetKind.photo);
        await preview.bounded(ready.future);
        if (profile) {
          rig.controller.requestProfile({AppLocale.en});
        } else {
          rig.controller.requestMedia(AssetKind.logo);
        }
        expect(calls, 1);
        rig.controller.edit(
          (s) => s.setHeadline(AppLocale.en, 'manual worker edit'),
        );
        if (profile) {
          await waitFor(() => rig.controller.profileOptions != null);
          expect(phases, contains('drained'));
          rig.controller.confirmProfile(
            ProfileSelection(
              jobToken: rig.controller.mediaJobToken,
              locales: {AppLocale.en},
              contactIds: {'phone'},
              colourRoles: {},
              includeLogo: false,
            ),
          );
        }
        await preview.bounded(rig.controller.idle);
        expect(calls, 2);
        expect(
          phases,
          containsAllInOrder(['killRequested', 'exited', 'drained']),
        );
        expect(rig.session.project.photo, isNull);
        expect(rig.session.project.logo != null, !profile);
        expect(
          rig.session.project.edition(AppLocale.en).headline,
          'manual worker edit',
        );
        await rig.finish();
      },
    );
  }
  for (final phase in [
    PreviewPhase.beforeInspection,
    PreviewPhase.afterRender,
    PreviewPhase.afterDecode,
  ]) {
    test('K01 controller close paid preview ${phase.name}', () async {
      final entered = Completer<void>(), release = Completer<void>();
      final rig = HostRig(
        valid: true,
        hooks: PreviewTestHooks(
          beforePhase: (p) async {
            if (p == phase) {
              entered.complete();
              await release.future;
            }
          },
        ),
      );
      rig.controller.refresh();
      await preview.bounded(entered.future);
      final paid = rig.budget.reservedBytes;
      var closed = false;
      final close = rig.controller.close().then((_) => closed = true);
      expect(closed, isFalse);
      expect(rig.budget.reservedBytes, paid);
      release.complete();
      await preview.bounded(close);
      expect(rig.controller.preview.current, isNull);
      await rig.finish();
    });
  }
  test(
    'null source and genuine worker failure are not successful attachment',
    () async {
      final nullRig = HostRig(source: (kind, op) async => null);
      nullRig.controller.requestMedia(AssetKind.photo);
      await preview.bounded(nullRig.controller.idle);
      expect(nullRig.session.project.photo, isNull);
      expect(nullRig.controller.mediaProblem, isNull);
      await nullRig.finish();
      late HostRig rig;
      final phases = <String>[];
      rig = HostRig(
        worker: MediaWorker(mode: MediaWorkerMode.crash, onPhase: phases.add),
        source: (kind, op) async =>
            OwnedMediaInput.copyOf(inputBytes(), kind, rig.budget),
      );
      rig.controller.requestMedia(AssetKind.photo);
      await preview.bounded(rig.controller.idle);
      expect(rig.controller.mediaProblem!.code, ProblemCode.ioFailure);
      expect(rig.session.project.photo, isNull);
      expect(phases, containsAllInOrder(['spawned', 'exited', 'drained']));
      await rig.finish();
    },
  );
}
