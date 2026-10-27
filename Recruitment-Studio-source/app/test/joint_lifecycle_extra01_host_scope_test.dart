import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/features/projects/project.dart';
import 'package:recruitment_studio/shared/admission_budget.dart';

import 'joint_lifecycle_extra01_busy_logo_test.dart'
    show logoRuntime, closeOutcome, ioCloseFailure, joinKnownClose;

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test('J02 frozen host logo source must not strand runtime close after actual busy read and failed native abort', () async {
    final (root, runtime, provider) = await logoRuntime();
    final current = runtime.session!;
    final actualHost = runtime.host!;
    final hostTerminal = closeOutcome(actualHost.closed);
    actualHost.requestMedia(AssetKind.logo);
    Future<void>? closing;
    try {
      await provider.entered.future.timeout(const Duration(seconds: 5));
      expect(actualHost.mediaBusy, isTrue);
      expect(runtime.budget.reservedBytes, greaterThanOrEqualTo(512 * 1024));
      closing = runtime.close();
      expect(identical(closing, runtime.close()), isTrue);
      await Future<void>.delayed(const Duration(milliseconds: 20));
      expect(
        current.isDisposed,
        isFalse,
        reason: 'The actual held host source still borrows the editor',
      );
      provider.resume.complete();
      await provider.failedAbort.future.timeout(const Duration(seconds: 5));
      await Future<void>.delayed(const Duration(milliseconds: 20));
      expect(provider.endedReads, 1);
      expect(provider.targetLive, isTrue);
      expect(
        provider.methods,
        isNot(contains('abortWrite')),
        reason: 'Failed native abort does not establish release predicate',
      );
      expect(provider.operations.toSet(), {provider.owner});
      expect(
        AdmissionBudget.shared.reservedBytes,
        greaterThanOrEqualTo(32768),
        reason:
            'Native entry custody remains charged; independently '
            'retired scheduler controls are not part of its baseline',
      );
      expect(current.isDisposed, isFalse);
      final terminal = await closeOutcome(closing);
      expect(
        terminal,
        ioCloseFailure,
        reason:
            'Frozen host must terminate with the real cleanup failure, '
            'not succeed or wait for its gateway tail forever',
      );
      expect(await hostTerminal, ioCloseFailure);
      expect(runtime.unresolvedCleanup, isTrue);
      expect(provider.failAbort, isTrue);
    } finally {
      if (!provider.resume.isCompleted) provider.resume.complete();
      provider.failAbort = false;
      // Join the observed terminal failures without converting them to success.
      await joinKnownClose(runtime.gateway.close());
      await joinKnownClose(closing ?? runtime.close());
      runtime.dispose();
      await root.delete(recursive: true);
    }
    expect(provider.targetLive, isTrue);
    expect(provider.methods.where((m) => m == 'abortPrepared').length, 2);
    expect(provider.operations.toSet(), {provider.owner});
    expect(AdmissionBudget.shared.reservedBytes, greaterThanOrEqualTo(32768));
  });
}
