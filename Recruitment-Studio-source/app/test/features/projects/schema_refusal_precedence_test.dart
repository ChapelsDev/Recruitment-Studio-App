// Frozen inert source specifications. Execution requires independent acceptance.
import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/features/projects/project.dart';
import 'package:recruitment_studio/shared/problem.dart';
import 'package:recruitment_studio/shared/work_limits.dart';

ImmutableProject _valid() => ImmutableProject(id: 'schema', name: 'manual',
  sections: [Section(id: 's', items: [SectionItem(id: 'i',
    textByLocale: {AppLocale.ptPT: 'text'})])]);

void main() {
  test('malformed required array shapes are schema refusals rather than capacity refusals', () {
    final original = _valid();
    expect(Project.fromManifest(original.toManifest()).name, 'manual');
    for (final field in ['localeOrder', 'contactIds', 'sections']) {
      final graph = original.toManifest();
      graph[field] = 'wrong';
      expect(() => Project.fromManifest(graph), throwsFormatException);
      expect(graph[field], 'wrong');
    }
    final graph = original.toManifest();
    ((graph['sections'] as List).single as Map)['items'] = 'wrong';
    expect(() => Project.fromManifest(graph), throwsFormatException);
    expect(original.sections.single.items.single.text(AppLocale.ptPT), 'text');
  });
  test('valid array kinds beyond legal cardinality retain typed capacity refusals', () {
    final original = _valid();
    final sections = original.toManifest();
    sections['sections'] = List.filled(WorkLimits.sections + 1,
        (sections['sections'] as List).single);
    expect(() => Project.fromManifest(sections), throwsA(isA<CapacityExceeded>()));
    final contacts = original.toManifest();
    contacts['contactIds'] = List.generate(WorkLimits.contacts + 1, (i) => 'c$i');
    expect(() => Project.fromManifest(contacts), throwsA(isA<CapacityExceeded>()));
    final locales = original.toManifest();
    locales['localeOrder'] = List.filled(AppLocale.values.length + 1, 'pt-PT');
    expect(() => Project.fromManifest(locales), throwsA(isA<CapacityExceeded>()));
    final items = original.toManifest();
    final section = (items['sections'] as List).single as Map;
    section['items'] = List.filled(WorkLimits.itemsPerSection + 1,
        (section['items'] as List).single);
    expect(() => Project.fromManifest(items), throwsA(isA<CapacityExceeded>()));
    expect(Project.fromManifest(original.toManifest()).sections.single.id, 's');
  });
  test('strict concrete reader preserves metadata and the exact malformed type frontier', () {
    final original = _valid();
    final graph = original.toManifest();
    final bytes = Uint8List.fromList(utf8.encode(jsonEncode(graph)));
    final parsed = StrictManifestJson.readProject(bytes);
    expect(parsed.project.id, original.id);
    expect(parsed.project.revision, original.revision);
    expect(parsed.project.modelVersion, 'editorial-b-v1');
    expect(parsed.project.localeOrder, [AppLocale.ptPT]);
    expect(parsed.project.sections.single.items.single.text(AppLocale.ptPT), 'text');
    expect(parsed.thumbnail, isNull);
    graph['sections'] = 'wrong';
    final invalid = Uint8List.fromList(utf8.encode(jsonEncode(graph)));
    expect(() => StrictManifestJson.readProject(invalid), throwsFormatException);
    expect(() => Project.fromManifest(graph), throwsFormatException);
    graph['sections'] = [];
    graph['name'] = String.fromCharCode(0xd800);
    expect(() => Project.fromManifest(graph), throwsFormatException);
    expect(original.name, 'manual');
  });
}
