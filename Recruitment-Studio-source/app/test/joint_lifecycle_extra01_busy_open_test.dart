import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/shared/admission_budget.dart';

import 'joint_lifecycle_extra01_busy_logo_test.dart'
    show logoRuntime, closeOutcome, ioCloseFailure, joinKnownClose;

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  for (final stop in ['cancel', 'close']) {
    test(
      'J06 $stop editable open joins actual failed busy source and restores leave ownership',
      () async {
        final (root, runtime, provider) = await logoRuntime();
        final current = runtime.session!;
        runtime.host!.edit((s) => s.setName('manual open retained'));
        await runtime.scheduler!.checkpoint();
        final opening = runtime.openProject();
        Future<void>? closing;
        try {
          await provider.entered.future.timeout(const Duration(seconds: 5));
          if (stop == 'cancel') {
            runtime.cancel();
          } else {
            closing = runtime.close();
          }
          await Future<void>.delayed(const Duration(milliseconds: 20));
          expect(current.isDisposed, isFalse);
          expect(provider.targetLive, isTrue);
          provider.resume.complete();
          expect(
            await closeOutcome(opening),
            isNull,
            reason: 'Read failure must not strand the literal open request or leave permit',
          );
          expect(runtime.canCancel, isFalse);
          expect(provider.endedReads, 1);
          expect(provider.targetLive, isTrue);
          expect(
            AdmissionBudget.shared.reservedBytes,
            greaterThanOrEqualTo(32768),
          );
          expect(provider.operations.toSet(), {provider.owner});
          if (stop == 'cancel') {
            expect(identical(runtime.session, current), isTrue);
            expect(current.project.name, 'manual open retained');
            final next = current.beginLeaveAttempt();
            expect(
              next,
              isNotNull,
              reason: 'The failed open released its real leave permit',
            );
            next!.end();
          } else {
            expect(await closeOutcome(closing!), ioCloseFailure);
          }
        } finally {
          if (!provider.resume.isCompleted) provider.resume.complete();
          provider.failAbort = false;
          await joinKnownClose(runtime.gateway.close());
          await opening.timeout(const Duration(seconds: 5));
          await joinKnownClose(closing ?? runtime.close());
          runtime.dispose();
          await root.delete(recursive: true);
        }
      },
    );
  }
}
