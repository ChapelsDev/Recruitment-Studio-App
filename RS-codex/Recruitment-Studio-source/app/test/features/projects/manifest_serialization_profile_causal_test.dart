// Prospective source-only controls, NOT FROZEN or executed by the author.
// Shared admission is observed, never reset; raw returned text is caller-owned.
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

final class _Foreign implements Project {
  _Foreign(this.graph);
  final Map<String, Object?> graph;
  @override
  Map<String, Object?> toManifest() => graph;
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

Project _boundary(int revision, {AssetRef? photo, AssetRef? logo}) {
  final p = ImmutableProject(id: 'boundary', revision: revision,
    photo: photo, logo: logo, contactIds: ['tel'],
    editions: {AppLocale.ptPT: Edition(headline: 'h', location: 'l', contacts: {'tel': ''})},
    sections: List.generate(4, (s) => Section(id: 's$s', items:
      List.generate(8, (i) => SectionItem(id: 'i$i',
        textByLocale: {AppLocale.ptPT: 'x' * WorkLimits.fieldUtf16Units})))));
  final gap = WorkLimits.manifestUtf8Bytes - utf8.encode(p.toManifestJson()).length;
  // Preserve the requested revision: withName would birth revision + 1.
  final exact = ImmutableProject(id: p.id, revision: revision,
    name: '${'é' * (gap ~/ 2)}${gap.isOdd ? 'x' : ''}',
    photo: p.photo, logo: p.logo, cropByFormat: p.cropByFormat,
    contactIds: p.contactIds, localeOrder: p.localeOrder,
    sections: p.sections, style: p.style,
    editions: {for (final l in p.localeOrder) l: p.edition(l)});
  expect(exact.revision, revision);
  expect(utf8.encode(exact.toManifestJson()).length, WorkLimits.manifestUtf8Bytes);
  return exact;
}

ResourceEntry _resource(int value, AssetKind kind, WorkBudgetController budget) {
  final bytes = Uint8List.fromList([value, value, value]);
  return ResourceEntry(ref: AssetRef(id: kind.name, kind: kind,
    mediaType: MediaType.png, width: 1, height: 1,
    sha256: crypto.sha256.convert(bytes).toString()), bytes: bytes, budget: budget);
}

void _confirm(EditorSession s, CapturedSnapshot h) {
  expect(s.acknowledgeProjectSave(h, projectId: h.projectId, revision: h.revision,
    sessionGeneration: h.sessionGeneration, succeeded: true), isTrue);
}

void _boundaryNoop(int revision) {
  final budget = WorkBudgetController(capacityBytes: 30);
  final photo = _resource(1, AssetKind.photo, budget);
  final logo = _resource(2, AssetKind.logo, budget);
  final initial = _boundary(revision, photo: photo.ref, logo: logo.ref);
  final s = EditorSession(initial,
    resources: {'photo': photo.bytes, 'logo': logo.bytes}, budget: budget);
  addTearDown(s.dispose);
  final before = s.bundle;
  final h = s.captureSnapshot();
  addTearDown(h.release);
  _confirm(s, h);
  final impact = s.requestRemoveSection('s0');
  final profile = CompanyProfile(logo: logo,
    contacts: {'tel': ''}, colours: {'ink': initial.style.ink});
  final bytes = AdmissionBudget.shared.reservedBytes;
  final tickets = AdmissionBudget.shared.ticketCount;
  s.applyProfile(profile, [AppLocale.ptPT]);
  // Sample synchronously, before test matcher/caller allocations.
  final afterBytes = AdmissionBudget.shared.reservedBytes;
  final afterTickets = AdmissionBudget.shared.ticketCount;
  expect(afterBytes, bytes);
  expect(afterTickets, tickets);
  expect(s.bundle, same(before));
  expect(s.project, same(initial));
  expect(s.project.revision, revision);
  expect(s.generation, 0);
  expect(s.undoCount, 0);
  expect(s.hasUnsavedChanges, isFalse);
  expect(s.hasConfirmedProjectSave, isTrue);
  expect(s.isSnapshotCurrent(h), isTrue);
  expect(s.bundle.resources['photo'], same(before.resources['photo']));
  expect(s.bundle.resources['logo'], same(before.resources['logo']));
  expect(budget.reservedBytes, 6);
  _confirm(s, h);
  expect(profile.logo, same(logo)); // caller custody is not retired by the no-op
  // The issued permit is still current: it reaches the existing undo admission
  // guard, not stale-confirmation StateError. The smaller forward object fits,
  // but restoring its exact-full predecessor at revision 11 / 101 does not.
  expect(() => s.confirmRemoveSection('s0', impact: impact),
    throwsA(isA<CapacityExceeded>()));
  expect(s.bundle, same(before));
  expect(s.project, same(initial));
  expect(s.project.revision, revision);
  expect(s.generation, 0);
  expect(s.undoCount, 0);
  expect(s.project.sections.any((section) => section.id == 's0'), isTrue);
  expect(s.hasUnsavedChanges, isFalse);
  expect(s.hasConfirmedProjectSave, isTrue);
  expect(s.isSnapshotCurrent(h), isTrue);
  _confirm(s, h);
  expect(profile.logo, same(logo));
}

Iterable<AppLocale> _tooMany(void Function() observed) sync* {
  while (true) { observed(); yield AppLocale.ptPT; }
}

void main() {
  test('C01 180 private canonical encodes retire temporary admission synchronously', () {
    final p = ImmutableProject(id: 'all', localeOrder: AppLocale.values,
      contactIds: ['tel'], editions: {for (final l in AppLocale.values)
        l: Edition(headline: '  ${l.code}\n', location: '', contacts: {'tel': ''})},
      sections: [Section(id: 'hidden', visible: false,
        titleByLocale: {for (final l in AppLocale.values) l: ''},
        items: [SectionItem(id: 'item', textByLocale:
          {for (final l in AppLocale.values) l: ' literal ${l.code} '})])]);
    final expected = p.toManifestJson(); // immediate-return raw String caller custody
    final bytes = AdmissionBudget.shared.reservedBytes;
    final tickets = AdmissionBudget.shared.ticketCount;
    for (var i = 0; i < 180; i++) {
      final actual = p.toManifestJson();
      final afterBytes = AdmissionBudget.shared.reservedBytes;
      final afterTickets = AdmissionBudget.shared.ticketCount;
      expect(afterBytes, bytes);
      expect(afterTickets, tickets);
      expect(actual, expected);
      expect(actual.length, lessThanOrEqualTo(WorkLimits.manifestUtf8Bytes));
    }
    final decoded = jsonDecode(expected) as Map;
    expect(decoded['localeOrder'], AppLocale.values.map((l) => l.code).toList());
    expect(((decoded['sections'] as List).single as Map)['visible'], isFalse);
    expect(p.edition(AppLocale.es).headline, '  es\n');
  });

  test('C02 bounded old JSON equivalence preserves literal UTF16 and escaping', () {
    final literal = String.fromCharCodes([0x22, 0x5c, 0, 10, 0xe9, 0xd800,
      0x61, 0xdc00, 0xd83d, 0xde00]);
    final p = ImmutableProject(id: 'unicode', name: literal,
      editions: {AppLocale.ptPT: Edition(headline: literal, location: '  literal  ')});
    final raw = p.toManifest(); // single bounded comparison, remains independently paid
    final expected = jsonEncode(raw);
    final bytes = AdmissionBudget.shared.reservedBytes;
    final tickets = AdmissionBudget.shared.ticketCount;
    final actual = p.toManifestJson();
    final afterBytes = AdmissionBudget.shared.reservedBytes;
    final afterTickets = AdmissionBudget.shared.ticketCount;
    expect(afterBytes, bytes);
    expect(afterTickets, tickets);
    expect(actual.codeUnits, expected.codeUnits);
    expect(utf8.encode(actual), utf8.encode(expected));
    expect(p.name.codeUnits, literal.codeUnits);
    expect(raw['name'], literal);
    expect(() => Project.fromManifest(raw), throwsFormatException);
  });

  test('C03 legacy roots and nested aliases remain independently mutable and paid', () {
    final p = ImmutableProject(id: 'legacy',
      sections: [Section(id: 's', items: [SectionItem(id: 'i',
        textByLocale: {AppLocale.ptPT: 'old'})])]);
    Map<String, Object?>? first = p.toManifest();
    final second = p.toManifest();
    final nested = ((((first['sections'] as List).single as Map)['items'] as List)
      .single as Map)['texts'] as Map;
    first['name'] = 'mutated';
    nested['pt-PT'] = 'changed';
    expect(second['name'], '');
    expect(p.sections.single.items.single.text(AppLocale.ptPT), 'old');
    first = null; // nested alias still keeps the original graph group paid
    final bytes = AdmissionBudget.shared.reservedBytes;
    final tickets = AdmissionBudget.shared.ticketCount;
    p.toManifestJson();
    final afterBytes = AdmissionBudget.shared.reservedBytes;
    final afterTickets = AdmissionBudget.shared.ticketCount;
    expect(afterBytes, bytes);
    expect(afterTickets, tickets);
    nested['pt-PT'] = 'still usable';
    expect(nested['pt-PT'], 'still usable');
    expect(((((second['sections'] as List).single as Map)['items'] as List)
      .single as Map)['texts'], {'pt-PT': 'old'});
  });

  test('C04 custom producers keep strict recapture schema cycle finite Unicode guards', () {
    final p = ImmutableProject(id: 'foreign');
    final graph = p.toManifest();
    final foreign = _Foreign(graph);
    expect(foreign.toManifestJson(), p.toManifestJson());
    graph['name'] = 'changed';
    expect((jsonDecode(foreign.toManifestJson()) as Map)['name'], 'changed');
    graph['name'] = String.fromCharCode(0xd800);
    expect(() => foreign.toManifestJson(), throwsFormatException);
    graph['name'] = '';
    (graph['style'] as Map)['logoScale'] = double.nan;
    expect(() => foreign.toManifestJson(), throwsFormatException);
    (graph['style'] as Map)['logoScale'] = 1.0;
    graph['unexpected'] = graph;
    expect(() => foreign.toManifestJson(), throwsFormatException);
    graph.remove('unexpected');
    graph['sections'] = 'bad';
    expect(() => foreign.toManifestJson(), throwsFormatException);
    expect(foreign.graph, same(graph));
    expect(graph['name'], '');
  });

  test('C05 graph admission refusal after workspace acquisition releases only workspace', () {
    final p = ImmutableProject(id: 'scratch');
    final ledger = AdmissionBudget.shared;
    // Natural bounded reservation, no reset/repricing and no synthetic paid flag.
    final remaining = ledger.capacityBytes - ledger.reservedBytes;
    expect(remaining, greaterThanOrEqualTo(8 * 1024 * 1024));
    final blocker = ledger.reserve(remaining - 8 * 1024 * 1024);
    try {
      final bytes = ledger.reservedBytes;
      final tickets = ledger.ticketCount;
      expect(() => p.toManifestJson(), throwsA(isA<CapacityExceeded>()));
      expect(ledger.reservedBytes, bytes);
      expect(ledger.ticketCount, tickets);
      expect(blocker.isActive, isTrue);
    } finally { blocker.release(); }
    final bytes = ledger.reservedBytes;
    final tickets = ledger.ticketCount;
    final actual = p.toManifestJson();
    final afterBytes = ledger.reservedBytes;
    final afterTickets = ledger.ticketCount;
    expect(afterBytes, bytes);
    expect(afterTickets, tickets);
    expect(actual, contains('"id":"scratch"'));
  });

  test('C06 exact boundary revision9 profile no-op preserves state and custody', () {
    _boundaryNoop(9);
  });

  test('C07 inherited revision99 profile no-op does not birth revision100', () {
    _boundaryNoop(99);
  });

  test('C08 selection rejects duplicate inactive unbounded and disposed before no-op', () {
    final s = EditorSession(ImmutableProject(id: 'selection'));
    addTearDown(s.dispose);
    final before = s.bundle;
    final profile = CompanyProfile();
    expect(() => s.applyProfile(profile, [AppLocale.ptPT, AppLocale.ptPT]),
      throwsArgumentError);
    expect(() => s.applyProfile(profile, [AppLocale.en]), throwsArgumentError);
    var reads = 0;
    expect(() => s.applyProfile(profile, _tooMany(() { reads++; })),
      throwsA(isA<CapacityExceeded>()));
    expect(reads, AppLocale.values.length + 1);
    expect(s.bundle, same(before));
    expect(s.generation, 0);
    s.dispose();
    reads = 0;
    expect(() => s.applyProfile(profile, _tooMany(() { reads++; })), throwsStateError);
    expect(reads, 0);
  });

  test('C09 constructor and ordered contact union validation precede equality', () {
    expect(() => CompanyProfile(contacts: {'../bad': ''}), throwsArgumentError);
    expect(() => CompanyProfile(colours: {'other': 0}), throwsArgumentError);
    expect(() => CompanyProfile(colours: {'ink': -1}), throwsArgumentError);
    expect(() => CompanyProfile(contacts: {'c': 'x' * (WorkLimits.fieldUtf16Units + 1)}),
      throwsA(isA<CapacityExceeded>()));
    final ids = List.generate(WorkLimits.contacts, (i) => 'c$i');
    final initial = ImmutableProject(id: 'union', contactIds: ids);
    final s = EditorSession(initial);
    addTearDown(s.dispose);
    final before = s.bundle;
    final profile = CompanyProfile(contacts: {'new': ''});
    expect(() => s.applyProfile(profile, const []), throwsA(isA<CapacityExceeded>()));
    expect(s.bundle, same(before));
    expect(s.project.contactIds, ids);
    expect(s.generation, 0);
  });

  test('C10 new empty unselected contact is structural and selected text stays literal', () {
    final initial = ImmutableProject(id: 'structural', localeOrder: AppLocale.values,
      editions: {for (final l in AppLocale.values) l: Edition(headline: l.code)},
      sections: [Section(id: 'hidden', visible: false)]);
    final s = EditorSession(initial);
    addTearDown(s.dispose);
    s.applyProfile(CompanyProfile(contacts: {'new': ''}), const []);
    expect(s.project.contactIds, ['new']);
    expect(s.generation, 1);
    expect(s.undoCount, 1);
    for (final l in AppLocale.values) { expect(s.project.edition(l).contacts['new'], ''); }
    final literal = '  texto\n';
    s.applyProfile(CompanyProfile(contacts: {'new': literal}, colours: {'ink': 0xff010203}),
      [AppLocale.ptPT]);
    expect(s.project.edition(AppLocale.ptPT).contacts['new'], literal);
    expect(s.project.edition(AppLocale.en).contacts['new'], '');
    expect(s.project.style.ink, 0xff010203);
    expect(s.project.sections.single.visible, isFalse);
    s.undo();
    s.undo();
    expect(s.project.contactIds, isEmpty);
    for (final l in AppLocale.values) { expect(s.project.edition(l).headline, l.code); }
    expect(s.hasUnsavedChanges, isFalse);
  });

  test('C11 genuine revision100 serialized overflow refuses atomically', () {
    final initial = _boundary(99);
    final s = EditorSession(initial);
    addTearDown(s.dispose);
    final before = s.bundle;
    final h = s.captureSnapshot();
    addTearDown(h.release);
    _confirm(s, h);
    final different = initial.style.ink == 0xff010203 ? 0xff010204 : 0xff010203;
    expect(different.toString().length, initial.style.ink.toString().length);
    final profile = CompanyProfile(colours: {'ink': different});
    expect(() => s.applyProfile(profile, [AppLocale.ptPT]), throwsA(isA<CapacityExceeded>()));
    expect(s.bundle, same(before));
    expect(s.project.revision, 99);
    expect(s.generation, 0);
    expect(s.undoCount, 0);
    expect(s.hasUnsavedChanges, isFalse);
    expect(s.hasConfirmedProjectSave, isTrue);
    expect(s.isSnapshotCurrent(h), isTrue);
    _confirm(s, h);
  });

  test('C12 equal unused logo no-op avoids crypto and keeps caller storage paid', () {
    final budget = WorkBudgetController(capacityBytes: 30);
    final logo = _resource(2, AssetKind.logo, budget);
    final equal = _resource(2, AssetKind.logo, budget);
    var digests = 0;
    final source = ProjectBundle(ImmutableProject(id: 'logo', logo: logo.ref),
      {'logo': logo.bytes}, budget: budget, onResourceDigest: (_) { digests++; });
    final s = EditorSession.fromBundle(source, budget: budget);
    addTearDown(s.dispose);
    final profile = CompanyProfile(logo: equal);
    final digestCount = digests;
    final bytes = AdmissionBudget.shared.reservedBytes;
    final tickets = AdmissionBudget.shared.ticketCount;
    s.applyProfile(profile, const []);
    final afterBytes = AdmissionBudget.shared.reservedBytes;
    final afterTickets = AdmissionBudget.shared.ticketCount;
    expect(afterBytes, bytes);
    expect(afterTickets, tickets);
    expect(s.bundle, same(source));
    expect(s.bundle.resources['logo'], same(source.resources['logo']));
    expect(digests, digestCount);
    expect(budget.reservedBytes, 3);
    expect(profile.logo, same(equal));
    expect(equal.bytes, [2, 2, 2]);
    expect(identical(equal.bytes, source.resources['logo']), isFalse);
  });
}
