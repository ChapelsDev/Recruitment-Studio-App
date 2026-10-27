// Inert source-finding specifications; not compiled, discovered or executed.
import 'dart:async';
import 'dart:collection';
import 'dart:typed_data';
import 'package:crypto/crypto.dart' as crypto;
import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/features/composition/font_catalog.dart';
import 'package:recruitment_studio/features/editor/editor_session.dart';
import 'package:recruitment_studio/features/editor/preview_owner.dart';
import 'package:recruitment_studio/features/projects/project.dart';
import 'package:recruitment_studio/features/projects/project_bundle.dart';
import 'package:recruitment_studio/shared/work_budget.dart';
import 'preview_owner_test.dart' show PreviewRig, bounded;

// The scanner sees delegated entries/length. Only the later keys frontier mutates.
final class _KeysMutation extends MapBase<String, Object?> {
  _KeysMutation(this.backing, this.field, this.replacement);
  final Map<String, Object?> backing;
  final String field;
  final Object? replacement;
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

AssetRef _photo(Uint8List data) => AssetRef(id: 'photo', kind: AssetKind.photo,
  mediaType: MediaType.png, width: 1, height: 1,
  sha256: crypto.sha256.convert(data).toString());

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(FontCatalog.load);
  test('late root keys Unicode mutation is rejected at supplied capture boundary', () {
    final backing = ImmutableProject(id: 'late_root').toManifest();
    final supplied = _KeysMutation(backing, 'name', String.fromCharCode(0xd800));
    expect(supplied.length, 13);
    expect(() => Project.fromManifest(supplied), throwsFormatException);
    expect(supplied.keysReads, greaterThan(0));
    expect((backing['name'] as String).codeUnits, [0xd800]);
  });
  test('late nested keys Unicode mutation is rejected after DTO materialization', () {
    final backing = ImmutableProject(id: 'late_nested').toManifest();
    final editions = backing['editions'] as Map<String, Object?>;
    final edition = editions[AppLocale.ptPT.code] as Map<String, Object?>;
    final supplied = _KeysMutation(edition, 'headline', String.fromCharCode(0xdc00));
    backing['editions'] = <String, Object?>{...editions, AppLocale.ptPT.code: supplied};
    expect(() => Project.fromManifest(backing), throwsFormatException);
    expect(supplied.keysReads, greaterThan(0));
    expect((edition['headline'] as String).codeUnits, [0xdc00]);
  });
  test('valid late keys values are captured independently of later producer edits', () {
    final backing = ImmutableProject(id: 'late_valid').toManifest();
    final supplied = _KeysMutation(backing, 'name', 'valid captured name');
    final admitted = Project.fromManifest(supplied);
    expect(supplied.keysReads, greaterThan(0));
    expect(admitted.name, 'valid captured name');
    backing['name'] = String.fromCharCode(0xd800);
    expect(admitted.name, 'valid captured name');
    expect(admitted.edition(AppLocale.ptPT).headline, '');
  });
  test('internal manual UTF16 remains literal while ordinary external input refuses', () {
    final literal = String.fromCharCode(0xd800);
    final p = ImmutableProject(id: 'internal_literal', name: literal);
    final session = EditorSession(p);
    try {
      session.setHeadline(AppLocale.ptPT, literal);
      expect(session.project.name.codeUnits, [0xd800]);
      expect(session.project.edition(AppLocale.ptPT).headline.codeUnits, [0xd800]);
      final supplied = p.toManifest();
      expect(() => Project.fromManifest(supplied), throwsFormatException);
      expect(p.name.codeUnits, [0xd800]);
    } finally { session.dispose(); }
  });
  test('admitted invalid resource reports its real three byte digest work and refunds', () {
    final p = Project.blank(id: 'invalid_admitted').withPhoto(
      _photo(Uint8List.fromList([1, 2, 3])));
    final budget = WorkBudgetController(capacityBytes: 6);
    final work = <int>[];
    final source = Uint8List.fromList([9, 9, 9]);
    expect(() => ProjectBundle(p, {'photo': source}, budget: budget,
      onResourceDigest: work.add), throwsArgumentError);
    expect(work, [3]);
    expect(source, [9, 9, 9]);
    expect(budget.reservedBytes, 0);
  });
  test('unadmitted zero capacity invalid resource refuses semantics without observer', () {
    final p = Project.blank(id: 'invalid_unadmitted').withPhoto(
      _photo(Uint8List.fromList([1, 2, 3])));
    final budget = WorkBudgetController(capacityBytes: 0);
    final work = <int>[];
    final source = Uint8List.fromList([9, 9, 9]);
    expect(() => ProjectBundle(p, {'photo': source}, budget: budget,
      onResourceDigest: work.add), throwsArgumentError);
    expect(work, isEmpty);
    expect(budget.reservedBytes, 0);
    expect(() => EditorSession(p, resources: {'photo': source}, budget: budget),
      throwsArgumentError);
    expect(source, [9, 9, 9]);
    expect(budget.reservedBytes, 0);
  });
  test('valid admitted mutable copy keeps actual observer passive and identity cache', () {
    final source = Uint8List.fromList([1, 2, 3]);
    final p = Project.blank(id: 'valid_admitted').withPhoto(_photo(source));
    final budget = WorkBudgetController(capacityBytes: 6);
    final work = <int>[];
    final bundle = ProjectBundle(p, {'photo': source}, budget: budget,
      onResourceDigest: (n) {
        work.add(n);
        source[0] = 9;
        throw StateError('passive observer');
      });
    final stored = bundle.resources['photo']!;
    expect(source, [9, 2, 3]);
    expect(stored, [1, 2, 3]);
    expect(() => stored[0] = 0, throwsUnsupportedError);
    final edited = bundle.withProject(bundle.project.withName('edited'));
    expect(edited.resources['photo'], same(stored));
    expect(work, [3]);
    expect(budget.reservedBytes, 0);
  });
  testWidgets('fresh registration reentrant close joins actual stage and capture tails', (tester) async {
    final events = <PreviewEvent>[];
    Future<void>? closed, processing, idle;
    var registrations = 0;
    late PreviewRig rig;
    rig = PreviewRig(hooks: PreviewTestHooks(
      beforeRegistration: (phase) {
        if (phase == PreviewPhase.beforeInspection) {
          registrations++;
          processing = rig.owner.processingSettled;
          idle = rig.owner.idle;
          closed = rig.owner.close().then((_) {
            expect(events, containsAllInOrder([
              PreviewEvent.stageSettled, PreviewEvent.snapshotReleased]));
            expect(events, isNot(contains(PreviewEvent.framePublished)));
            expect(rig.owner.current, isNull);
            expect(rig.owner.ownedImageCount, 0);
            expect(rig.budget.reservedBytes, rig.baseline);
          });
        }
      },
      onEvent: (event, phase, token, images, bytes) { events.add(event); }));
    try {
      await tester.runAsync(() async {
        rig.request();
        expect(registrations, 1);
        expect(closed, isNotNull);
        await bounded(closed!);
        await bounded(processing!);
        await bounded(idle!);
        expect(rig.owner.status, PreviewStatus.closing);
      });
      expect(tester.takeException(), isNull);
    } finally { await tester.runAsync(rig.finish); }
  });
  testWidgets('fresh registration reentrant dispose retains the same real close obligation', (tester) async {
    final events = <PreviewEvent>[];
    Future<void>? closed, exactClose;
    var registrations = 0;
    late PreviewRig rig;
    rig = PreviewRig(hooks: PreviewTestHooks(
      beforeRegistration: (phase) {
        if (phase == PreviewPhase.beforeInspection) {
          registrations++;
          rig.owner.dispose();
          exactClose = rig.owner.close();
          closed = exactClose!.then((_) {
            expect(events, containsAllInOrder([
              PreviewEvent.stageSettled, PreviewEvent.snapshotReleased]));
            expect(events, isNot(contains(PreviewEvent.framePublished)));
            expect(rig.budget.reservedBytes, rig.baseline);
            expect(rig.owner.ownedImageCount, 0);
          });
        }
      },
      onEvent: (event, phase, token, images, bytes) { events.add(event); }));
    try {
      await tester.runAsync(() async {
        rig.request();
        expect(registrations, 1);
        expect(closed, isNotNull);
        expect(rig.owner.close(), same(exactClose));
        await bounded(closed!);
        await bounded(rig.owner.processingSettled);
        await bounded(rig.owner.idle);
      });
      expect(tester.takeException(), isNull);
    } finally { await tester.runAsync(rig.finish); }
  });
  testWidgets('real predecessor retirement still blocks a replacement and closes only after refund', (tester) async {
    late final Completer<void> entered, release;
    await tester.runAsync(() async {
      entered = Completer<void>();
      release = Completer<void>();
    });
    var registrations = 0;
    final rig = PreviewRig(hooks: PreviewTestHooks(
      beforeRegistration: (phase) {
        if (phase == PreviewPhase.beforeInspection) { registrations++; }
      },
      beforePhase: (phase) async {
        if (phase == PreviewPhase.beforeRetire && !entered.isCompleted) {
          entered.complete();
          await release.future;
        }
      }));
    try {
      await tester.runAsync(() async {
        rig.request();
        expect(registrations, 1);
        await bounded(rig.owner.idle);
        final old = rig.owner.current!;
        rig.request(AppLocale.en);
        await bounded(rig.owner.idle);
        await bounded(entered.future);
        expect(old.isRetiring, isTrue);
        expect(registrations, 2);
        rig.request(AppLocale.fr);
        await Future<void>.delayed(Duration.zero);
        expect(registrations, 2);
        release.complete();
        await bounded(rig.owner.idle);
        expect(registrations, 3);
        expect(rig.owner.current!.locale, AppLocale.fr);
        await bounded(old.retired);
        await bounded(rig.owner.close());
        expect(rig.budget.reservedBytes, rig.baseline);
      });
      expect(tester.takeException(), isNull);
    } finally {
      if (!release.isCompleted) { release.complete(); }
      await tester.runAsync(rig.finish);
    }
  });
}
