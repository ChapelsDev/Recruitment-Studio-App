// Candidate-only specifications; no execution or measured claims.
import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/shared/admission_budget.dart';
import 'package:recruitment_studio/shared/operation.dart';
import 'package:recruitment_studio/shared/work_budget.dart';
import 'package:recruitment_studio/shared/work_limits.dart';
import 'package:recruitment_studio/shared/problem.dart';
import 'package:recruitment_studio/features/projects/project.dart';
import 'package:recruitment_studio/features/media/media_worker.dart';
import 'package:recruitment_studio/features/media/image_header_probe.dart';
import '../features/storage/package_test_fixtures.dart';

void main() {
  test('ordinary16MiB inclusive and sequential reclamation', () {
    final ordinary = AdmissionBudget();
    final claim = ordinary.reserve(WorkLimits.ordinaryAdmissionBytes);
    expect(() => ordinary.reserve(1), throwsA(isA<CapacityExceeded>()));
    claim.release(); claim.release();
    for (var i = 0; i < 10000; i++) { ordinary.reserve(512).release(); }
    expect(ordinary.reservedBytes, 0);
    expect(ordinary.ticketCount, 0);
  });
  test('zero-byte ticket cardinality refuses growth and recovers', () {
    final ordinary = AdmissionBudget();
    final claims = <AdmissionTicket>[];
    try {
      for (var i = 0; i < WorkLimits.admissionTickets; i++) {
        claims.add(ordinary.reserve(0));
      }
      expect(() => ordinary.reserve(0), throwsA(isA<CapacityExceeded>()));
    } finally { for (final claim in claims) { claim.release(); } }
    expect(ordinary.ticketCount, 0);
  });
  test('failed constructor admission rolls back paid heavy bytes', () async {
    final budget = WorkBudgetController(capacityBytes: 10);
    final owner = WorkOperation.create();
    final removals = <void Function()>[];
    for (var i = 0; i < 128; i++) {
      removals.add(owner.registerDrainFinalizer(() {
        if (i < 0) { throw StateError('synthetic'); }
      }));
    }
    try {
      expect(() => budget.reserve(owner, 10), throwsA(isA<CapacityExceeded>()));
      expect(budget.reservedBytes, 0);
      await expectLater(budget.acquire(owner, 10), throwsA(isA<CapacityExceeded>()));
      expect(budget.reservedBytes, 0);
      for (final remove in removals) { remove(); }
      final lease = await budget.acquire(owner, 10);
      lease.release();
    } finally { await owner.finish(); }
    expect(budget.reservedBytes, 0);
  });
  test('released parser credit cannot bypass ordinary admission', () {
    final ticket = AdmissionBudget.shared.reserve(8 * 1024 * 1024);
    ticket.release();
    expect(() => StrictManifestJson.parse(jsonBytes('{}'), admission: ticket),
        throwsA(isA<CapacityExceeded>()));
    final small = AdmissionBudget.shared.reserve(1);
    try {
      expect(() => StrictManifestJson.parse(jsonBytes('{}'), admission: small),
          throwsA(isA<CapacityExceeded>()));
    } finally { small.release(); }
  });
  test('parser raw key member and string bounds before promotion', () {
    final envelope = AdmissionBudget.shared.reserve(8 * 1024 * 1024);
    try {
      final entries = List.generate(1024, (i) => '"k$i":null').join(',');
      final valid = StrictManifestJson.parse(jsonBytes('{$entries}'), admission: envelope);
      expect(valid.length, 1024);
      final afterFirst = AdmissionBudget.shared.reservedBytes;
      expect(() => StrictManifestJson.parse(jsonBytes('{$entries,"extra":null}'),
          admission: envelope), throwsA(isA<CapacityExceeded>()));
      expect(AdmissionBudget.shared.reservedBytes, afterFirst);
      expect(StrictManifestJson.parse(jsonBytes('{"x":"${'a' * 16000}"}'),
          admission: envelope)['x'], hasLength(16000));
      final afterSecond = AdmissionBudget.shared.reservedBytes;
      expect(() => StrictManifestJson.parse(jsonBytes('{"x":"${'a' * 16001}"}'),
          admission: envelope), throwsA(isA<CapacityExceeded>()));
      expect(() => StrictManifestJson.parse(jsonBytes('{"x":0,"x":1}'),
          admission: envelope), throwsA(isA<FormatException>()));
      expect(AdmissionBudget.shared.reservedBytes, afterSecond);
    } finally { envelope.release(); }
  });
  test('public header extrema refuse before overflowing raster arithmetic', () {
    const header = ImageHeader(mediaType: MediaType.png, width: 0x7fffffffffffffff,
        height: 0x7fffffffffffffff, channels: 4);
    expect(() => mediaAllocationEstimate(header, 1), throwsA(isA<CapacityExceeded>()));
    expect(mediaAllocationEstimate(const ImageHeader(mediaType: MediaType.png,
        width: 3, height: 2, channels: 4), 100), greaterThan(100));
  });
  test('failed raw graph/domain admission does not allocate an excess copy', () {
    final manifest = Project.blank(id: 'synthetic').toManifest();
    manifest['sections'] = List.filled(13, <String, Object?>{});
    expect(() => Project.fromManifest(manifest), throwsA(isA<CapacityExceeded>()));
    expect(() => Edition(contacts: {for (var i = 0; i < 9; i++) 'c$i': ''}),
        throwsA(isA<CapacityExceeded>()));
  });
}
