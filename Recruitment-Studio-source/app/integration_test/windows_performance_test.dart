// Real Windows workload instrumentation, not a measured-capacity PASS gate.
// Integration/widget builds are debug unless the actual runner proves otherwise.
// Dedicated release executable is tool/measure_windows_capacity.dart. RSS/CPU
// still need an authenticated external Windows producer; Dart accounting != RSS.
import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

import '../tool/measure_windows_capacity.dart' as capacity;
import 'support/windows_native_fixtures.dart';

void main() {
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  testWidgets('Windows actual diagnostic codec editing 21 renders repeated export cancellation and lifecycle measurements', (tester) async {
    final root = await windowsSandbox();
    try {
      final value = await capacity.measureWindowsWorkload(root,
        runId: 'integration-diagnostic', repetitions: 1, includeMaximum: false);
      expect(value['build_mode'], capacity.windowsMeasurementMode);
      expect(value['threshold_verdict'], isNull);
      expect(value['native_rss_cpu'], 'pending_external_producer');
      expect(value['reservation_after_close_bytes'], 0);
      final samples = value['samples']! as List<Map<String, Object?>>;
      expect(samples, isNotEmpty);
      for (final sample in samples) {
        expect(sample['wall_us'], greaterThan(0));
      }
      expect(samples.map((s) => s['action']).toSet(), {
        'generate_gradient', 'continuous_edit_0', 'codec_encode_0', 'codec_import_0',
        'full_21_private_renders_0', 'reexport_png_0', 'reexport_jpg_0',
        'running_jpeg_worker_cancel_and_recovery', 'fixture_lifecycle_close',
      });
      final fixtures = value['fixtures']! as List<Map<String, Object?>>;
      expect(fixtures.single['photo_sha256'], matches(RegExp(r'^[0-9a-f]{64}$')));
      binding.reportData = {'windows_diagnostic': value,
        'acceptance': 'operand assertions only; not release capacity/native RSS/CPU or APP PASS'};
    } finally { await root.delete(recursive: true); }
  });

  const admittedRelease = bool.fromEnvironment('WINDOWS_CAPACITY_RELEASE');
  testWidgets('Windows release maximum 12MP operand and finite repeated capacity workload', (tester) async {
    expect(kReleaseMode, isTrue, reason: 'A --dart-define label cannot turn debug/profile into release');
    final root = await windowsSandbox();
    try {
      final value = await capacity.measureWindowsWorkload(root,
        runId: 'integration-release', repetitions: 3);
      expect(value['build_mode'], 'release');
      expect(value['threshold_verdict'], isNull);
      expect(value['native_rss_cpu'], 'pending_external_producer');
      binding.reportData = {...?binding.reportData, 'windows_release_operands': value,
        'acceptance': 'pending external authenticated RSS/CPU and human capacity thresholds'};
    } finally { await root.delete(recursive: true); }
  }, skip: !admittedRelease); // RELEASE SLOT REQUIRED: no capacity claim from default debug integration execution
}
