// Frozen inert two-header-edge regressions; source approval precedes execution.
import 'dart:collection';
import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/features/projects/project.dart';
import 'package:recruitment_studio/shared/admission_budget.dart';

// The initial scanner sees the genuine entries. The subsequent keys capture
// changes one supplied value, reaching the existing final strict Unicode guard.
final class _LateHeaderValue extends MapBase<String, Object?> {
  _LateHeaderValue(this.backing, this.field, this.replacement);
  final Map<String, Object?> backing;
  final String field;
  final String replacement;
  int keysReads = 0;
  @override
  Iterable<String> get keys {
    keysReads++;
    backing[field] = replacement;
    return backing.keys;
  }
  @override
  int get length => backing.length;
  @override
  Iterable<MapEntry<String, Object?>> get entries => backing.entries;
  @override
  Object? operator [](Object? key) => backing[key];
  @override
  void operator []=(String key, Object? value) { backing[key] = value; }
  @override
  void clear() { backing.clear(); }
  @override
  Object? remove(Object? key) => backing.remove(key);
}

ImmutableProject _held(String id) => ImmutableProject(
  id: id, name: 'held manual', contactIds: ['primary'],
  editions: {AppLocale.ptPT: Edition(headline: 'held headline',
    contacts: {'primary': 'held contact'})},
);

void main() {
  test('unchanged-header revisions expose the same paid readonly contact collection', () {
    final callerIds = <String>['primary'];
    final original = ImmutableProject(id: 'header_alias', contactIds: callerIds);
    final alias = original.contactIds;
    final revision = original.withRevision(1);
    // This targeted ownership contract intentionally exercises real storage
    // identity, not equality of reconstructed DTOs or timed finalization.
    expect(revision.contactIds, same(alias));
    expect(original.contactIds, same(alias));
    expect(alias, ['primary']);
    expect(() => alias.add('unpaid'), throwsUnsupportedError);
    callerIds[0] = 'caller_change';
    expect(alias, ['primary']);
    expect(revision.edition(AppLocale.ptPT).contacts.keys, ['primary']);
    expect(original.revision, 0);
    expect(revision.revision, 1);
  });
  test('outer late-root rejection immediately refunds the newly born header', () {
    final held = _held('fresh_header_refusal');
    final graph = held.toManifest();
    final supplied = _LateHeaderValue(graph, 'name', String.fromCharCode(0xd800));
    final bytes = AdmissionBudget.shared.reservedBytes;
    final tickets = AdmissionBudget.shared.ticketCount;
    expect(() => Project.fromManifest(supplied), throwsFormatException);
    expect(supplied.keysReads, greaterThan(0));
    expect((graph['name'] as String).codeUnits, [0xd800]);
    // No await, forced GC, retry, cap change or reliance on collection timing.
    expect(AdmissionBudget.shared.reservedBytes, bytes);
    expect(AdmissionBudget.shared.ticketCount, tickets);
    expect(held.name, 'held manual');
    expect(held.contactIds, ['primary']);
    expect(held.edition(AppLocale.ptPT).headline, 'held headline');
    expect(held.edition(AppLocale.ptPT).contacts['primary'], 'held contact');
  });
  test('outer late-child rejection refunds fresh values without revoking the borrowed header', () {
    final held = _held('borrowed_header_refusal');
    final graph = held.toManifest();
    final editions = graph['editions'] as Map<String, Object?>;
    final edition = editions[AppLocale.ptPT.code] as Map<String, Object?>;
    final supplied = _LateHeaderValue(edition, 'headline', String.fromCharCode(0xdc00));
    graph['editions'] = <String, Object?>{...editions, AppLocale.ptPT.code: supplied};
    final bytes = AdmissionBudget.shared.reservedBytes;
    final tickets = AdmissionBudget.shared.ticketCount;
    expect(() => Project.fromManifest(graph), throwsFormatException);
    expect(supplied.keysReads, greaterThan(0));
    expect((edition['headline'] as String).codeUnits, [0xdc00]);
    expect(AdmissionBudget.shared.reservedBytes, bytes);
    expect(AdmissionBudget.shared.ticketCount, tickets);
    expect(held.name, 'held manual');
    expect(held.contactIds, ['primary']);
    expect(held.edition(AppLocale.ptPT).headline, 'held headline');
    expect(held.edition(AppLocale.ptPT).contacts['primary'], 'held contact');
    final revision = held.withRevision(1);
    expect(revision.contactIds, same(held.contactIds));
    expect(revision.edition(AppLocale.ptPT), same(held.edition(AppLocale.ptPT)));
    expect(revision.name, 'held manual');
  });
}
