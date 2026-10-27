// Inert source-only controls: no SDK, discovery, compilation or execution.
import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/features/composition/font_catalog.dart';
import 'package:recruitment_studio/features/editor/preview_owner.dart';
import 'package:recruitment_studio/features/projects/project.dart';
import 'package:recruitment_studio/shared/admission_budget.dart';
import 'package:recruitment_studio/shared/problem.dart';

import 'preview_owner_test.dart' show PreviewRig, bounded;

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(FontCatalog.load);

  testWidgets('startup control refusal is typed without losing close availability', (tester) async {
    final rig = PreviewRig();
    AdmissionTicket? pressure;
    try {
      await tester.runAsync(() async {
        final ordinary = AdmissionBudget.shared;
        final free = ordinary.capacityBytes - ordinary.reservedBytes;
        expect(free, greaterThan(0));
        pressure = ordinary.reserve(free);
        expect(rig.request, returnsNormally);
        expect(rig.owner.status, PreviewStatus.error);
        expect(rig.owner.problems.single.code, ProblemCode.capacityExceeded);
        expect(rig.owner.current, isNull);
        expect(rig.budget.reservedBytes, rig.baseline);
        pressure!.release();
        pressure = null;
        await bounded(rig.owner.close());
        expect(rig.owner.ownedImageCount, 0);
        expect(rig.budget.reservedBytes, rig.baseline);
      });
      expect(tester.takeException(), isNull);
    } finally {
      pressure?.release();
      await tester.runAsync(rig.finish);
    }
  });

  testWidgets('admitted pump denied job settles a typed refusal before stage creation', (tester) async {
    var registrations = 0;
    Object? producerError;
    final rig = PreviewRig(hooks: PreviewTestHooks(
      beforeRegistration: (phase) {
        if (phase == PreviewPhase.beforeInspection) {
          registrations++;
        }
      },
    ));
    AdmissionTicket? pressure;
    try {
      await tester.runAsync(() async {
        final ordinary = AdmissionBudget.shared;
        final free = ordinary.capacityBytes - ordinary.reservedBytes;
        expect(free, greaterThan(4096));
        pressure = ordinary.reserve(free - 4096);
        expect(rig.request, returnsNormally);
        await bounded(rig.owner.idle.then<void>((_) {},
          onError: (Object error, StackTrace stack) { producerError = error; }));
        expect(producerError, isNull);
        expect(registrations, 0);
        expect(rig.owner.status, PreviewStatus.error);
        expect(rig.owner.problems.single.code, ProblemCode.capacityExceeded);
        expect(rig.owner.current, isNull);
        expect(rig.budget.reservedBytes, rig.baseline);
        pressure!.release();
        pressure = null;
        await bounded(rig.owner.close());
        expect(rig.owner.ownedImageCount, 0);
      });
      expect(tester.takeException(), isNull);
    } finally {
      pressure?.release();
      await tester.runAsync(rig.finish);
    }
  });

  testWidgets('close after denied job awaits actual held frame retirement and refund', (tester) async {
    late final Completer<void> entered, release;
    await tester.runAsync(() async {
      entered = Completer<void>();
      release = Completer<void>();
    });
    var holdRetirement = false, closeSettled = false;
    Object? closeError;
    PreviewFrame? frame;
    Future<void>? observedClose;
    final rig = PreviewRig(hooks: PreviewTestHooks(
      beforePhase: (phase) async {
        if (holdRetirement && phase == PreviewPhase.beforeRetire && !entered.isCompleted) {
          entered.complete();
          await release.future;
        }
      },
    ));
    AdmissionTicket? pressure;
    try {
      await tester.runAsync(() async {
        rig.request();
        await bounded(rig.owner.idle);
        expect(rig.owner.status, PreviewStatus.ready);
        frame = rig.owner.current!;
        expect(rig.owner.ownedImageCount, 1);
        holdRetirement = true;
        final ordinary = AdmissionBudget.shared;
        final free = ordinary.capacityBytes - ordinary.reservedBytes;
        expect(free, greaterThan(4096));
        pressure = ordinary.reserve(free - 4096);
        rig.request(AppLocale.en);
        // Consume any predecessor producer error so the drain assertion is
        // isolated from the separate typed-refusal assertion above.
        await bounded(rig.owner.idle.then<void>((_) {},
          onError: (Object error, StackTrace stack) {}));
        pressure!.release();
        pressure = null;
        final exactClose = rig.owner.close();
        expect(rig.owner.close(), same(exactClose));
        observedClose = exactClose.then<void>((_) { closeSettled = true; },
          onError: (Object error, StackTrace stack) {
            closeError = error;
            closeSettled = true;
          });
        await bounded(entered.future);
        await Future<void>.delayed(Duration.zero);
        await Future<void>.delayed(Duration.zero);
        expect(closeSettled, isFalse);
        expect(frame!.isRetiring, isTrue);
        expect(rig.owner.ownedImageCount, 1);
        expect(rig.budget.reservedBytes, greaterThan(rig.baseline));
        release.complete();
        await bounded(observedClose!);
        await bounded(frame!.retired);
        expect(closeError, isNull);
        expect(closeSettled, isTrue);
        expect(rig.owner.current, isNull);
        expect(rig.owner.ownedImageCount, 0);
        expect(rig.budget.reservedBytes, rig.baseline);
      });
      expect(tester.takeException(), isNull);
    } finally {
      pressure?.release();
      if (!release.isCompleted) { release.complete(); }
      await tester.runAsync(() async {
        // Cleanup does not turn an observed early/failed close into success:
        // all required close expectations remain in the test body above.
        await bounded(observedClose ?? rig.owner.close().then<void>((_) {},
          onError: (Object error, StackTrace stack) {}));
        if (frame != null) { await bounded(frame!.retired); }
        if (!rig.session.isDisposed) { rig.session.dispose(); }
        await Future<void>.delayed(Duration.zero);
        expect(rig.budget.reservedBytes, 0);
      });
    }
  });

  testWidgets('same owner recovers a genuine ready frame after pressure release', (tester) async {
    final rig = PreviewRig();
    AdmissionTicket? pressure;
    try {
      await tester.runAsync(() async {
        final ordinary = AdmissionBudget.shared;
        final free = ordinary.capacityBytes - ordinary.reservedBytes;
        expect(free, greaterThan(4096));
        pressure = ordinary.reserve(free - 4096);
        rig.request();
        await bounded(rig.owner.idle.then<void>((_) {},
          onError: (Object error, StackTrace stack) {}));
        pressure!.release();
        pressure = null;
        rig.request(AppLocale.en);
        await bounded(rig.owner.idle);
        expect(rig.owner.status, PreviewStatus.ready);
        expect(rig.owner.current!.locale, AppLocale.en);
        expect(rig.owner.problems.where((p) => p.code == ProblemCode.capacityExceeded), isEmpty);
        await bounded(rig.owner.close());
        expect(rig.owner.ownedImageCount, 0);
        expect(rig.budget.reservedBytes, rig.baseline);
      });
      expect(tester.takeException(), isNull);
    } finally {
      pressure?.release();
      await tester.runAsync(rig.finish);
    }
  });
}
