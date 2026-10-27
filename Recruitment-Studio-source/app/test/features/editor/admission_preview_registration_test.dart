// Source-only exact refusal regressions; no SDK execution during authorship.
import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/features/composition/font_catalog.dart';
import 'package:recruitment_studio/features/editor/preview_owner.dart';
import 'package:recruitment_studio/shared/admission_budget.dart';
import 'package:recruitment_studio/shared/operation.dart';
import 'package:recruitment_studio/shared/problem.dart';
import 'package:recruitment_studio/shared/work_limits.dart';
import 'preview_owner_test.dart' show PreviewRig, bounded;

// Count the real finite live-operation pool, not a guessed GC-based byte delta.
Future<int> availableOperationSlots() async {
  final probes = <WorkOperation>[];
  try {
    for (var i = 0; i < WorkLimits.liveOperations; i++) {
      try {
        probes.add(WorkOperation.create());
      } on CapacityExceeded {
        break;
      }
    }
    return probes.length;
  } finally {
    for (final op in probes) {
      await op.finish();
    }
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(FontCatalog.load);
  for (final target in [PreviewPhase.beforeInspection, PreviewPhase.beforeDecode]) {
    testWidgets('pending registration refusal refunds ${target.name} and next preview works', (tester) async {
      final admission = AdmissionBudget.shared;
      AdmissionTicket? pressure;
      var armed = true;
      var reached = 0;
      var settled = 0;
      final rig = PreviewRig(hooks: PreviewTestHooks(
        beforeRegistration: (phase) {
          if (phase != target || !armed) {
            return;
          }
          armed = false;
          reached++;
          final free = admission.capacityBytes - admission.reservedBytes;
          expect(free, greaterThan(1024));
          pressure = admission.reserve(free - 512);
          // The stage operation is already paid; pending registration needs1024.
          expect(admission.capacityBytes - admission.reservedBytes, 512);
        },
        onEvent: (event, phase, token, images, bytes) {
          if (event == PreviewEvent.stageSettled && phase ==
              (target == PreviewPhase.beforeInspection
                ? PreviewPhase.afterInspection : PreviewPhase.afterDecode)) {
            settled++;
          }
        },
      ));
      final initial = rig.session.project;
      final generation = rig.session.generation;
      late int availableBefore;
      try {
        await tester.runAsync(() async {
          availableBefore = await availableOperationSlots();
          expect(availableBefore, greaterThan(0));
          rig.request();
          await bounded(rig.owner.idle);
        });
        expect(reached, 1);
        expect(settled, 1);
        expect(rig.owner.status, PreviewStatus.error);
        expect(rig.owner.problems.map((p) => p.code), contains(ProblemCode.capacityExceeded));
        expect(rig.session.project, same(initial));
        expect(rig.session.generation, generation);
        pressure!.release();
        pressure = null;
        await tester.runAsync(() async {
          // Both successful stage creation and refused enrollment must drain.
          expect(await availableOperationSlots(), availableBefore);
          rig.request();
          await bounded(rig.owner.idle);
        });
        expect(rig.owner.status, PreviewStatus.ready);
        expect(rig.owner.current, isNotNull);
        expect(rig.session.project, same(initial));
        expect(tester.takeException(), isNull);
      } finally {
        pressure?.release();
        await tester.runAsync(() async {
          await rig.finish();
        });
      }
    });
  }
}
