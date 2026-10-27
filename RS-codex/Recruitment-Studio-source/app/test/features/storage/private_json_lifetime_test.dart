// Inert source-first controls. Private parser exposes no raw Map/List callback.
import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/features/projects/project.dart';
import 'package:recruitment_studio/features/storage/package_zip_io.dart' show PackageFailure;
import 'package:recruitment_studio/shared/admission_budget.dart';
import 'package:recruitment_studio/shared/problem.dart';
import 'package:recruitment_studio/shared/work_limits.dart';
import 'package_test_fixtures.dart';

Uint8List _bytes(String text) => Uint8List.fromList(utf8.encode(text));
void main() {
  test('ignored private parse retires workspace success and malformed refusal', () {
    final before = AdmissionBudget.shared.reservedBytes;
    final tickets = AdmissionBudget.shared.ticketCount;
    StrictManifestJson.validate(_bytes('{"a":["😀",null,1]}'));
    expect(AdmissionBudget.shared.reservedBytes, before);
    expect(AdmissionBudget.shared.ticketCount, tickets);
    for (final text in ['{"a":1,"\\u0061":2}', '{"a":01}',
        '{"a":"\\ud800"}', '{"a":1e999}', '{']) {
      expect(() => StrictManifestJson.validate(_bytes(text)),
          throwsA(isA<FormatException>()));
      expect(AdmissionBudget.shared.reservedBytes, before);
      expect(AdmissionBudget.shared.ticketCount, tickets);
    }
    final bom = Uint8List.fromList([0xef, 0xbb, 0xbf, 123, 125]);
    expect(() => StrictManifestJson.validate(bom), throwsA(isA<FormatException>()));
    expect(AdmissionBudget.shared.reservedBytes, before);
  });
  test('private project parse schema refusal retires raw graph without DTOs', () {
    final before = AdmissionBudget.shared.reservedBytes;
    final tickets = AdmissionBudget.shared.ticketCount;
    expect(() => StrictManifestJson.readProject(_bytes(
        '{"schemaVersion":2,"modelVersion":"editorial-b-v1"}')),
        throwsA(isA<PackageFailure>()));
    expect(AdmissionBudget.shared.reservedBytes, before);
    expect(AdmissionBudget.shared.ticketCount, tickets);
  });
  test('public parse nested collection aliases keep retained payment', () {
    final before = AdmissionBudget.shared.reservedBytes;
    Map<String, Object?>? outer = StrictManifestJson.parse(_bytes('{"a":[{"b":"v"}]}'));
    final nested = (outer['a'] as List).single as Map;
    final charged = AdmissionBudget.shared.reservedBytes;
    outer = null;
    expect(charged, greaterThan(before));
    expect(AdmissionBudget.shared.reservedBytes, charged);
    expect(nested['b'], 'v');
  });
  test('private reader preserves rich fields and pays surviving domain aliases', () async {
    final bundle = await fixtureBundle(identicalRoles: true);
    final payload = packagePayload(bundle);
    final before = AdmissionBudget.shared.reservedBytes;
    final parsed = StrictManifestJson.readProject(payload['manifest.json']!);
    expect(parsed.thumbnail, isNull);
    final project = parsed.project;
    expect(project.localeOrder, AppLocale.values.reversed.toList());
    expect(project.edition(AppLocale.fr).location, '');
    expect(project.sections[1].visible, isFalse);
    expect(project.sections[1].items[0].text(AppLocale.deCH), '');
    expect(AdmissionBudget.shared.reservedBytes - before, lessThan(256 * 1024));
    expect(project.edition(AppLocale.fr).contacts['first'], 'fr@invalid.test');
  });
  test('private reader size depth node member and field bounds remain strict', () {
    final cases = <Uint8List>[
      Uint8List(WorkLimits.manifestUtf8Bytes + 1),
      _bytes('{"a":${'[' * WorkLimits.manifestDepth}0${']' * WorkLimits.manifestDepth}}'),
      _bytes('{"a":[${List.filled(WorkLimits.parserMembers + 1, '0').join(',')}]}'),
      _bytes('{"a":"${'x' * (WorkLimits.fieldUtf16Units + 1)}"}'),
      _bytes('{${List.generate(9, (i) => '"k$i":[${List.filled(1023, '0').join(',')}]').join(',')}}'),
    ];
    for (final input in cases) {
      final before = AdmissionBudget.shared.reservedBytes;
      final tickets = AdmissionBudget.shared.ticketCount;
      expect(() => StrictManifestJson.validate(input), throwsA(isA<CapacityExceeded>()));
      expect(AdmissionBudget.shared.reservedBytes, before);
      expect(AdmissionBudget.shared.ticketCount, tickets);
    }
  });
  test('supplied project graph rejects cycles nonfinite scalar and invalid Unicode', () {
    final cyclic = <String, Object?>{};
    cyclic['cycle'] = cyclic;
    expect(() => Project.fromManifest(cyclic), throwsA(isA<FormatException>()));
    final graph = ImmutableProject(id: 'guards').toManifest();
    graph['name'] = String.fromCharCode(0xd800);
    expect(() => Project.fromManifest(graph), throwsA(isA<FormatException>()));
    graph['name'] = '';
    graph['revision'] = double.infinity;
    expect(() => Project.fromManifest(graph), throwsA(isA<FormatException>()));
  });
}
