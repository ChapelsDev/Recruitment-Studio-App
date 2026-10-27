// Frozen inert source specifications. Execution requires independent acceptance.
import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/features/editor/editor_session.dart';
import 'package:recruitment_studio/features/projects/project.dart';
import 'package:recruitment_studio/shared/admission_budget.dart';
import 'package:recruitment_studio/shared/problem.dart';
import 'package:recruitment_studio/shared/work_limits.dart';

ImmutableProject _large(String id) => ImmutableProject(id: id, sections:
  List.generate(4, (s) => Section(id: 's$s', items:
    List.generate(8, (i) => SectionItem(id: 'i$i',
      textByLocale: {AppLocale.ptPT: 'x' * WorkLimits.fieldUtf16Units})))));

void main() {
  test('held immutable revisions share manual backing without repeated deep admission', () {
    final original = _large('shared');
    final before = AdmissionBudget.shared.reservedBytes;
    final revisions = <ImmutableProject>[original];
    for (var i = 1; i <= 12; i++) {
      revisions.add(original.withRevision(i));
    }
    expect(AdmissionBudget.shared.reservedBytes - before,
        lessThan(WorkLimits.manifestUtf8Bytes));
    expect(ImmutableProject.snapshot(original), same(original));
    expect(original.withRevision(0), same(original));
    for (var i = 0; i < revisions.length; i++) {
      expect(revisions[i].revision, i);
      expect(revisions[i].sections.length, 4);
      expect(revisions[i].sections.last.items.last.text(AppLocale.ptPT),
          'x' * WorkLimits.fieldUtf16Units);
      expect(() => revisions[i].sections.clear(), throwsUnsupportedError);
    }
  });
  test('nested public text graph alias stays paid after owner references are dropped', () {
    ImmutableProject? owner = ImmutableProject(id: 'alias', sections: [
      Section(id: 's', items: [SectionItem(id: 'i',
          textByLocale: {AppLocale.ptPT: 'kept' * 4000})]),
    ]);
    final before = AdmissionBudget.shared.reservedBytes;
    Map<String, Object?>? outer = owner.toManifest();
    final nested = (((outer['sections'] as List).single as Map)['items']
        as List).single as Map;
    final texts = nested['texts'] as Map;
    final paid = AdmissionBudget.shared.reservedBytes;
    expect(paid, greaterThan(before));
    outer = null;
    owner = null;
    // Synchronous observation only: neither force collection nor assume timing.
    expect(AdmissionBudget.shared.reservedBytes, paid);
    expect(texts['pt-PT'], 'kept' * 4000);
    nested.clear();
    expect(texts['pt-PT'], 'kept' * 4000);
  });
  test('failed unpublished project birth refunds new defaults and preserves older owners', () {
    final old = ImmutableProject(id: 'older', name: 'older manual');
    final edition = Edition(contacts: {'c': 'existing contact'});
    final bytes = AdmissionBudget.shared.reservedBytes;
    final tickets = AdmissionBudget.shared.ticketCount;
    expect(() => ImmutableProject(id: 'failed',
        editions: {AppLocale.ptPT: edition}), throwsArgumentError);
    expect(AdmissionBudget.shared.reservedBytes, bytes);
    expect(AdmissionBudget.shared.ticketCount, tickets);
    expect(old.name, 'older manual');
    expect(old.edition(AppLocale.ptPT).headline, '');
    expect(edition.contacts['c'], 'existing contact');
  });
  test('exact manual manifest survives public and private strict consumer composition', () {
    final original = _large('threshold');
    final initial = original.toManifest();
    final gap = WorkLimits.manifestUtf8Bytes -
        utf8.encode(jsonEncode(initial)).length;
    expect(gap, inInclusiveRange(0, WorkLimits.fieldUtf16Units));
    final exact = original.withName('n' * gap) as ImmutableProject;
    final graph = exact.toManifest();
    final bytes = Uint8List.fromList(utf8.encode(jsonEncode(graph)));
    expect(bytes.length, WorkLimits.manifestUtf8Bytes);
    final roundTrip = Project.fromManifest(graph);
    final parsed = StrictManifestJson.readProject(bytes);
    expect(parsed.thumbnail, isNull);
    expect(parsed.project.id, exact.id);
    expect(parsed.project.revision, exact.revision);
    expect(parsed.project.name, exact.name);
    expect(roundTrip.name, exact.name);
    expect(parsed.project.sections.last.items.last.text(AppLocale.ptPT),
        exact.sections.last.items.last.text(AppLocale.ptPT));
    expect(() => exact.withName('${exact.name}n'),
        throwsA(isA<CapacityExceeded>()));
    expect(original.name, '');
    expect((graph['name'] as String).length, gap);
    expect(initial['id'], original.id);
  });
  test('editor history holds large shared manual backing across real name revisions', () {
    final original = _large('history');
    final session = EditorSession(original);
    final held = <Project>[original];
    try {
      for (var i = 0; i < 12; i++) {
        session.setName('r$i');
        held.add(session.project);
      }
      expect(session.project.name, 'r11');
      session.undo();
      expect(session.project.name, 'r10');
      expect(session.project.sections.last.items.last.text(AppLocale.ptPT),
          'x' * WorkLimits.fieldUtf16Units);
      expect(original.name, '');
      for (final project in held) {
        expect(project.sections.length, 4);
        expect(project.sections.first.items.first.text(AppLocale.ptPT).length,
            WorkLimits.fieldUtf16Units);
      }
    } finally { session.dispose(); }
    expect(held.last.name, 'r11');
    expect(held.first.name, '');
  });
}
