// Inert specification-first domain/context/owned-copy controls.
import 'dart:convert';
import 'dart:typed_data';
import 'package:crypto/crypto.dart' as crypto;
import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/features/editor/editor_session.dart';
import 'package:recruitment_studio/features/projects/project.dart';
import 'package:recruitment_studio/features/projects/project_bundle.dart';
import 'package:recruitment_studio/shared/admission_budget.dart';
import 'package:recruitment_studio/shared/problem.dart';
import 'package:recruitment_studio/shared/work_budget.dart';
import 'package:recruitment_studio/shared/work_limits.dart';
final class _External implements Project {
  _External(this.graph);
  final Map<String, Object?> graph;
  @override
  Map<String, Object?> toManifest() => graph;
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}
ResourceEntry _entry() {
  final data = Uint8List.fromList([1, 2, 3]);
  return ResourceEntry(ref: AssetRef(id: 'logo', kind: AssetKind.logo,
    mediaType: MediaType.png, width: 1, height: 1,
    sha256: crypto.sha256.convert(data).toString()), bytes: data);
}

void main() {
  test('internal literal UTF16 survives domain editor and revision', () {
    final text = String.fromCharCode(0xd800);
    final p = ImmutableProject(id: 'literal', name: text);
    final s = EditorSession(p);
    try {
      s.setHeadline(AppLocale.ptPT, text);
      expect(s.project.name.codeUnits, [0xd800]);
      expect(s.project.edition(AppLocale.ptPT).headline.codeUnits, [0xd800]);
      s.undo();
      expect(s.project.name.codeUnits, [0xd800]);
      expect(s.hasUnsavedChanges, isFalse);
    } finally { s.dispose(); }
  });
  test('external and custom graph Unicode remain strictly rejected', () {
    final graph = ImmutableProject(id: 'external').toManifest();
    graph['name'] = String.fromCharCode(0xd800);
    expect(() => Project.fromManifest(graph), throwsFormatException);
    expect(() => ImmutableProject.snapshot(_External(graph)), throwsFormatException);
    expect((graph['name'] as String).codeUnits, [0xd800]);
  });
  test('external graph cycle finite depth member node and field guards remain', () {
    final cycle = <String, Object?>{}; cycle['self'] = cycle;
    expect(() => Project.fromManifest(cycle), throwsFormatException);
    final graph = ImmutableProject(id: 'guards').toManifest();
    graph['revision'] = double.infinity;
    expect(() => Project.fromManifest(graph), throwsFormatException);
    graph['revision'] = 0;
    graph['extra'] = List.filled(WorkLimits.parserMembers + 1, 0);
    expect(() => Project.fromManifest(graph), throwsA(isA<CapacityExceeded>()));
    Object? nested = 0;
    for (var i = 0; i < WorkLimits.manifestDepth; i++) { nested = [nested]; }
    graph['extra'] = nested;
    expect(() => Project.fromManifest(graph), throwsA(isA<CapacityExceeded>()));
    graph['extra'] = List.generate(9, (_) => List.filled(1023, 0));
    expect(() => Project.fromManifest(graph), throwsA(isA<CapacityExceeded>()));
    graph.remove('extra'); graph['name'] = 'x' * (WorkLimits.fieldUtf16Units + 1);
    expect(() => Project.fromManifest(graph), throwsA(isA<CapacityExceeded>()));
  });
  test('typed birth accepts exact escaped JSON size and first invalid refuses', () {
    final p = ImmutableProject(id: 'exact').withSections(List.generate(4, (s) => Section(
      id: 's$s', items: List.generate(8, (i) => SectionItem(id: 'i$i',
      textByLocale: {AppLocale.ptPT: 'x' * 16000}))))) as ImmutableProject;
    final gap = WorkLimits.manifestUtf8Bytes - utf8.encode(p.toManifestJson()).length;
    final exact = p.withName('x' * gap) as ImmutableProject;
    expect(utf8.encode(exact.toManifestJson()).length, WorkLimits.manifestUtf8Bytes);
    expect(() => exact.withName('${exact.name}x'), throwsA(isA<CapacityExceeded>()));
    expect(exact.name.length, gap);
  });
  test('revision promise preflight creates no models tickets or graph aliases', () {
    final p = ImmutableProject(id: 'revisions', revision: 9);
    final before = AdmissionBudget.shared.reservedBytes, tickets = AdmissionBudget.shared.ticketCount;
    for (var i = 0; i < 20; i++) { p.checkRevision(10 + i); }
    expect(AdmissionBudget.shared.reservedBytes, before);
    expect(AdmissionBudget.shared.ticketCount, tickets);
    expect(() => p.checkRevision(-1), throwsArgumentError);
    expect(p.revision, 9);
  });
  test('authentic readonly backing creates distinct paid three-byte session view', () {
    final e = _entry();
    final budget = WorkBudgetController(capacityBytes: 3);
    final s = EditorSession(Project.blank(id: 'trusted').withLogo(e.ref),
      resources: {'logo': e.bytes}, budget: budget);
    try {
      expect(budget.reservedBytes, 3);
      expect(s.bundle.resources['logo'], isNot(same(e.bytes)));
      expect(s.bundle.resources['logo'], e.bytes);
      expect(() => s.bundle.resources['logo']![0] = 9, throwsUnsupportedError);
      s.setName('edit');
      expect(budget.reservedBytes, 3);
    } finally { s.dispose(); }
    expect(budget.reservedBytes, 0);
  });
  test('mutable caller input pays source destination and remains defensive', () {
    final e = _entry(), input = Uint8List.fromList([1, 2, 3]);
    final budget = WorkBudgetController(capacityBytes: 6);
    final s = EditorSession(Project.blank(id: 'mutable').withLogo(e.ref),
      resources: {'logo': input}, budget: budget);
    try {
      input[0] = 9;
      expect(s.bundle.resources['logo'], [1, 2, 3]);
      expect(budget.reservedBytes, 3);
    } finally { s.dispose(); }
    expect(budget.reservedBytes, 0);
  });
  test('foreign readonly view cannot forge trusted origin or bypass copy price', () {
    final e = _entry(), input = Uint8List.fromList([1, 2, 3]).asUnmodifiableView();
    final budget = WorkBudgetController(capacityBytes: 3);
    expect(() => EditorSession(Project.blank(id: 'foreign').withLogo(e.ref),
      resources: {'logo': input}, budget: budget), throwsA(isA<CapacityExceeded>()));
    expect(budget.reservedBytes, 0);
    expect(input, [1, 2, 3]);
  });
}
