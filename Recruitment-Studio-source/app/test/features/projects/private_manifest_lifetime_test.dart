// Inert source-first controls. No SDK execution authorized for repair05 author.
import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/features/projects/project.dart';
import 'package:recruitment_studio/features/projects/project_bundle.dart';
import 'package:recruitment_studio/shared/admission_budget.dart';
import 'package:recruitment_studio/shared/problem.dart';
import 'package:recruitment_studio/shared/work_limits.dart';
import '../storage/package_test_fixtures.dart';

final class _ExternalProject implements Project {
  _ExternalProject(this.graph);
  final Map<String, Object?> graph;
  @override
  Map<String, Object?> toManifest() => graph;
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  test('private manifest bytes retire graph credit at synchronous last use', () async {
    final bundle = await fixtureBundle(identicalRoles: true);
    final project = ImmutableProject.snapshot(bundle.project);
    final workspace = AdmissionBudget.shared.reserve(8 * 1024 * 1024);
    try {
      final before = AdmissionBudget.shared.reservedBytes;
      final tickets = AdmissionBudget.shared.ticketCount;
      final bytes = project.manifestBytes(workspace: workspace);
      expect(jsonDecode(utf8.decode(bytes)), project.toManifest());
      // The equality operand is a real escaping graph and therefore charged.
      // Isolate private delta in a second call with no escaping equality operand.
      final stable = AdmissionBudget.shared.reservedBytes;
      final stableTickets = AdmissionBudget.shared.ticketCount;
      final second = project.manifestBytes(workspace: workspace);
      expect(second, bytes);
      expect(AdmissionBudget.shared.reservedBytes, stable);
      expect(AdmissionBudget.shared.ticketCount, stableTickets);
      expect(stable, greaterThan(before));
      expect(stableTickets, greaterThan(tickets));
    } finally { workspace.release(); }
  });
  test('private manifest refusal rolls back without retiring other owners', () {
    final project = ImmutableProject(id: 'owned');
    final workspace = AdmissionBudget.shared.reserve(8 * 1024 * 1024);
    AdmissionTicket? filler;
    try {
      filler = AdmissionBudget.shared.reserve(WorkLimits.ordinaryAdmissionBytes -
          AdmissionBudget.shared.reservedBytes - 1);
      final before = AdmissionBudget.shared.reservedBytes;
      final tickets = AdmissionBudget.shared.ticketCount;
      expect(() => project.manifestBytes(workspace: workspace),
          throwsA(isA<CapacityExceeded>()));
      expect(AdmissionBudget.shared.reservedBytes, before);
      expect(AdmissionBudget.shared.ticketCount, tickets);
    } finally { filler?.release(); workspace.release(); }
  });
  test('public nested alias remains paid after outer reference is dropped', () {
    final project = ImmutableProject(id: 'alias');
    final before = AdmissionBudget.shared.reservedBytes;
    Map<String, Object?>? outer = project.toManifest();
    final nested = outer['editions'] as Map;
    final charged = AdmissionBudget.shared.reservedBytes;
    expect(charged, greaterThan(before));
    outer = null;
    // Synchronous observation; no GC timing, reset or finalizer credit oracle.
    expect(AdmissionBudget.shared.reservedBytes, charged);
    expect((nested['pt-PT'] as Map)['headline'], '');
  });
  test('immutable bundle reuse preserves paid exact identity and readonly data', () async {
    final bundle = await fixtureBundle(identicalRoles: true);
    final next = ProjectBundle(bundle.project, bundle.resources);
    expect(identical(next.project, bundle.project), isTrue);
    expect(() => next.project.contactIds.add('mutate'), throwsUnsupportedError);
    expect(next.resources.keys, unorderedEquals(bundle.resources.keys));
  });
  test('generic snapshot pays escaped graph and detaches semantic fields', () async {
    final bundle = await fixtureBundle(identicalRoles: true);
    final graph = bundle.project.toManifest();
    final before = AdmissionBudget.shared.reservedBytes;
    final snapshot = ImmutableProject.snapshot(_ExternalProject(graph));
    final editions = graph['editions'] as Map;
    final french = editions['fr'] as Map;
    french['headline'] = 'caller mutation';
    expect(snapshot.edition(AppLocale.fr).headline, 'fr\n É œ ß 😀');
    expect(snapshot.edition(AppLocale.fr).location, '');
    expect(snapshot.contactIds, ['second', 'first']);
    expect(AdmissionBudget.shared.reservedBytes, greaterThan(before));
    expect((editions['fr'] as Map)['headline'], 'caller mutation');
  });
  test('generic snapshot refuses unknown keys rather than using custom getters', () {
    final graph = ImmutableProject(id: 'invalid').toManifest();
    graph['unrecognized'] = true;
    expect(() => ImmutableProject.snapshot(_ExternalProject(graph)),
        throwsA(isA<FormatException>()));
  });
}
