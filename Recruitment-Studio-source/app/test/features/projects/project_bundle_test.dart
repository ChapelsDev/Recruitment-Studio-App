import 'dart:io';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as image;
import 'package:recruitment_studio/features/projects/project.dart';
import 'package:recruitment_studio/features/projects/project_bundle.dart';
import 'package:recruitment_studio/shared/problem.dart';
import 'package:recruitment_studio/shared/work_limits.dart';

import '../../support/project_fixtures.dart';
import '../../../tool/create_fixture_assets.dart';

AssetRef ref(
  Uint8List bytes, {
  String id = 'photo',
  AssetKind kind = AssetKind.photo,
}) => AssetRef(
  id: id,
  kind: kind,
  mediaType: MediaType.png,
  width: 1,
  height: 1,
  sha256: sha256.convert(bytes).toString(),
);
void main() {
  test('selective retention preserves authenticated readonly storage without digest work', () {
    final data = Uint8List.fromList([1, 2, 3]);
    final work = <int>[];
    final p = Project.blank(id: 'retain').withPhoto(ref(data));
    final b = ProjectBundle(p, {
      'photo': data,
      'unused': Uint8List.fromList([9]),
    }, onResourceDigest: work.add);
    final retained = b.retainResources(['photo']);
    expect(retained.resources.keys, ['photo']);
    expect(retained.resources['photo'], same(b.resources['photo']));
    expect(b.resources.keys, ['photo', 'unused']);
    retained.withProject(p.withName('text only'));
    expect(work, [3]);
    final bytes = retained.resources['photo']!;
    expect(() => bytes[0] = 9, throwsUnsupportedError);
    expect(() => bytes.buffer.asUint8List()[0] = 9, throwsUnsupportedError);
    expect(() => Uint8List.view(bytes.buffer)[0] = 9, throwsUnsupportedError);
    expect(() => Uint8List.sublistView(bytes)[0] = 9, throwsUnsupportedError);
    expect(
      () => ByteData.view(bytes.buffer).setUint8(0, 9),
      throwsUnsupportedError,
    );
    expect(
      () => bytes.buffer.asByteData().setUint8(0, 9),
      throwsUnsupportedError,
    );
    expect(() => retained.resources.clear(), throwsUnsupportedError);
    for (final ids in <List<String>>[
      [],
      ['photo', 'photo'],
      ['photo', 'missing'],
      ['photo', '../unused'],
    ]) {
      expect(() => b.retainResources(ids), throwsArgumentError);
      expect(b.resources['photo'], [1, 2, 3]);
      expect(work, [3]);
    }
    final noPhoto = b.withProject(Project.blank(id: 'retain'));
    expect(noPhoto.retainResources([]).resources, isEmpty);
    expect(b.project.photo, isNotNull);
  });
  test('retention preserves logo references and cached digest refusal on subsequent metadata', () {
    final data = Uint8List.fromList([3]);
    final work = <int>[];
    final logo = ref(data, id: 'logo', kind: AssetKind.logo);
    final b = ProjectBundle(Project.blank(id: 'logo').withLogo(logo), {
      'logo': data,
    }, onResourceDigest: work.add);
    expect(() => b.retainResources([]), throwsArgumentError);
    final retained = b.retainResources(['logo']);
    expect(
      () => retained.withProject(
        retained.project.withLogo(
          ref(Uint8List.fromList([4]), id: 'logo', kind: AssetKind.logo),
        ),
      ),
      throwsArgumentError,
    );
    expect(work, [1]);
  });
  test('actual digest work is reused only for owned authenticated immutable storage', () {
    final data = Uint8List.fromList([1, 2, 3]);
    final spare = Uint8List.fromList([4, 5]);
    final work = <int>[];
    final p = Project.blank(id: 'digest').withPhoto(ref(data));
    final original = ProjectBundle(p, {
      'photo': data,
      'spare': spare,
    }, onResourceDigest: work.add);
    expect(work, [3]);
    final stored = original.resources['photo'];
    var edit = original;
    for (var i = 0; i < 5; i++) {
      edit = edit.withProject(
        edit.project
            .withHeadline(AppLocale.ptPT, 'headline $i')
            .withLocation(AppLocale.ptPT, 'location $i')
            .withContact(AppLocale.ptPT, 'contact-1', 'contact $i'),
      );
      expect(edit.resources['photo'], same(stored));
    }
    expect(work, [3]); // The production crypto path, not a wall-time gate.
    expect(original.project.edition(AppLocale.ptPT).headline, '');
    final changedMetadata = AssetRef(
      id: 'photo',
      kind: AssetKind.photo,
      mediaType: MediaType.jpeg,
      width: 2,
      height: 2,
      sha256: p.photo!.sha256,
    );
    edit = edit.withProject(edit.project.withPhoto(changedMetadata));
    expect(edit.project.photo!.width, 2);
    expect(work, [
      3,
    ]); // Known actual digest is reusable, metadata still parsed.
    final wrongDigest = ref(Uint8List.fromList([9]));
    expect(
      () => edit.withProject(edit.project.withPhoto(wrongDigest)),
      throwsArgumentError,
    );
    expect(work, [3]);
    expect(
      () => edit.withProject(edit.project.withPhoto(ref(data, id: 'missing'))),
      throwsArgumentError,
    );
    edit = edit.withProject(edit.project.withPhoto(ref(spare, id: 'spare')));
    expect(work, [
      3,
      2,
    ]); // Previously unreferenced storage must hash on first use.
    edit = edit.withProject(edit.project.withPhoto(ref(spare, id: 'spare')));
    expect(work, [3, 2]); // Recreated reference is not the cache key.
    final replacement = Uint8List.fromList([8, 7, 6, 5]);
    final entry = ResourceEntry(ref: ref(replacement), bytes: replacement);
    replacement[0] = 0;
    final replaced = edit.withResource(
      entry,
      project: edit.project.withPhoto(entry.ref),
    );
    expect(work, [3, 2, 4]);
    expect(replaced.resources['photo'], [8, 7, 6, 5]);
    expect(original.resources['photo'], [1, 2, 3]);
    expect(
      () => replaced.withProject(replaced.project.withPhoto(p.photo!)),
      throwsArgumentError,
    );
    expect(work, [3, 2, 4]);
    final constructed = ProjectBundle(p, {
      'photo': Uint8List.fromList([1, 2, 3]),
    }, onResourceDigest: work.add);
    expect(constructed.resources['photo'], isNot(same(stored)));
    expect(work, [
      3,
      2,
      4,
      3,
    ]); // New ownership must authenticate, even same ID/digest.
    expect(
      () => ProjectBundle(p, {
        'photo': Uint8List.fromList([9, 9, 9]),
      }, onResourceDigest: work.add),
      throwsArgumentError,
    );
    expect(work, [3, 2, 4, 3, 3]);
    final sameContentEntry = ResourceEntry(
      ref: ref(Uint8List.fromList([1, 2, 3])),
      bytes: Uint8List.fromList([1, 2, 3]),
    );
    final sameContentReplacement = original.withResource(sameContentEntry);
    expect(sameContentReplacement.resources['photo'], isNot(same(stored)));
    expect(work, [3, 2, 4, 3, 3, 3]);
    sameContentReplacement.withProject(
      sameContentReplacement.project.withHeadline(
        AppLocale.ptPT,
        'after replacement',
      ),
    );
    expect(work, [3, 2, 4, 3, 3, 3]);
    // A sibling derived from the old snapshot does not inherit validations
    // learned only in a later snapshot (no mutable cross-snapshot cache).
    original.withProject(original.project.withPhoto(ref(spare, id: 'spare')));
    expect(work, [3, 2, 4, 3, 3, 3, 2]);
    final badStored = ProjectBundle(Project.blank(id: 'unused'), {
      'photo': Uint8List.fromList([7]),
    }, onResourceDigest: work.add);
    expect(() => badStored.withProject(p), throwsArgumentError);
    expect(work.last, 1);
  });
  test(
    'cached digest never bypasses changed kind size IDs or aggregate checks',
    () {
      final bytes = Uint8List(WorkLimits.logoBytes + 1);
      final work = <int>[];
      final p = Project.blank(id: 'kind').withPhoto(ref(bytes));
      final b = ProjectBundle(p, {'photo': bytes}, onResourceDigest: work.add);
      final wrongKind = ref(bytes, kind: AssetKind.logo);
      expect(
        () => b.withProject(Project.blank(id: 'kind').withLogo(wrongKind)),
        throwsA(isA<CapacityExceeded>()),
      );
      expect(work, [bytes.length]);
      expect(
        () => b.withProject(p.withPhoto(ref(bytes, kind: AssetKind.logo))),
        throwsArgumentError,
      );
      final empty = Uint8List(0);
      expect(
        () => ProjectBundle(Project.blank(id: 'empty').withPhoto(ref(empty)), {
          'photo': empty,
        }, onResourceDigest: work.add),
        throwsArgumentError,
      );
      expect(
        () => b.withResource(
          ResourceEntry(
            ref: ref(Uint8List.fromList([1]), id: 'logo', kind: AssetKind.logo),
            bytes: Uint8List.fromList([1]),
          ),
          project: p.withPhoto(ref(Uint8List.fromList([2]))),
        ),
        throwsArgumentError,
      );
      expect(b.resources['photo']!.length, bytes.length);
    },
  );
  test(
    'passive digest observer cannot forge checksum or alter readonly snapshots',
    () {
      final data = Uint8List.fromList([1]);
      final p = Project.blank(id: 'observer').withPhoto(ref(data));
      final b = ProjectBundle(
        p,
        {'photo': data},
        onResourceDigest: (_) {
          data[0] = 9;
          throw StateError('observer only');
        },
      );
      expect(b.resources['photo'], [1]);
      expect(
        () => ProjectBundle(
          p,
          {
            'photo': Uint8List.fromList([2]),
          },
          onResourceDigest: (_) {
            throw StateError('observer only');
          },
        ),
        throwsArgumentError,
      );
    },
  );
  test('encoded resource byte caps accept exact and refuse first invalid for all kinds', () {
    for (final pair in [
      (AssetKind.photo, WorkLimits.photoBytes),
      (AssetKind.logo, WorkLimits.logoBytes),
      (AssetKind.thumbnail, WorkLimits.thumbnailBytes),
    ]) {
      final exact = Uint8List(pair.$2);
      final entry = ResourceEntry(
        ref: ref(exact, kind: pair.$1),
        bytes: exact,
      );
      expect(entry.bytes.length, pair.$2);
      final over = Uint8List(pair.$2 + 1);
      expect(
        () => ResourceEntry(
          ref: ref(over, kind: pair.$1),
          bytes: over,
        ),
        throwsA(isA<CapacityExceeded>()),
      );
    }
    final data = Uint8List.fromList([1]);
    final p = Project.blank(id: 'entry-limit');
    final resources = {for (var i = 0; i < 16; i++) 'r$i': data};
    expect(ProjectBundle(p, resources).resources.length, 16);
    final atEntryLimit = ProjectBundle(p, resources);
    expect(
      () => atEntryLimit.withResource(
        ResourceEntry(
          ref: ref(data, id: 'extra'),
          bytes: data,
        ),
      ),
      throwsA(isA<CapacityExceeded>()),
    );
    final b = ProjectBundle(p, {});
    final entry = ResourceEntry(ref: ref(data), bytes: data);
    final inserted = b.withResource(entry);
    expect(inserted.project.id, p.id);
    expect(inserted.resources['photo'], [1]);
    expect(b.resources, isEmpty);
    expect(
      () => ResourceEntry(ref: ref(Uint8List(0)), bytes: Uint8List(0)),
      throwsArgumentError,
    );
    expect(
      () => ResourceEntry(ref: ref(data), bytes: Uint8List.fromList([2])),
      throwsArgumentError,
    );
    final exactTotal = Uint8List(WorkLimits.projectExpandedBytes);
    final atByteLimit = ProjectBundle(p, {'retained': exactTotal});
    expect(
      atByteLimit.resources['retained']!.length,
      WorkLimits.projectExpandedBytes,
    );
    expect(
      () => atByteLimit.withResource(entry),
      throwsA(isA<CapacityExceeded>()),
    );
  });
  test('synthetic generator produces deterministic real JPEG and alpha PNG fixtures', () async {
    await createFixtureAssets();
    final jpg = await File('test/fixtures/assets/photo.jpg').readAsBytes();
    final png = await File('test/fixtures/assets/logo.png').readAsBytes();
    expect(image.findDecoderForData(jpg), isA<image.JpegDecoder>());
    expect(image.findDecoderForData(png), isA<image.PngDecoder>());
    final photo = image.decodeJpg(jpg)!;
    final logo = image.decodePng(png)!;
    expect([photo.width, photo.height], [640, 480]);
    expect(logo.numChannels, 4);
    expect(logo.getPixel(0, 0).a, 0);
    expect(logo.getPixel(logo.width ~/ 2, logo.height ~/ 2).a, 255);
    await createFixtureAssets();
    expect(await File('test/fixtures/assets/photo.jpg').readAsBytes(), jpg);
    expect(await File('test/fixtures/assets/logo.png').readAsBytes(), png);
    final p = fixtureProject();
    final bundle = await fixtureBundle();
    expect(p.id, 'fixture-project');
    expect(p.photo!.id, 'fixture-photo');
    expect(p.edition(AppLocale.ptPT).headline, 'Vaga de teste');
    expect(p.edition(AppLocale.ptPT).contacts, {
      'contact-1': 'contacto@invalid.test',
    });
    expect(bundle.resources.keys, ['fixture-photo']);
    expect(bundle.resources['fixture-photo'], jpg);
    expect(p.photo!.sha256, sha256.convert(jpg).toString());
  });
  test('bundle copies caller bytes and all alias views are readonly without text edit recopy', () {
    final input = Uint8List.fromList([1, 2, 3]);
    final photo = ref(input);
    final caller = {'photo': input};
    final b = ProjectBundle(Project.blank(id: 'b').withPhoto(photo), caller);
    caller.clear();
    input[0] = 9;
    final bytes = b.resources['photo']!;
    expect(bytes, [1, 2, 3]);
    expect(() => bytes[0] = 4, throwsUnsupportedError);
    expect(() => bytes.setAll(0, [4]), throwsUnsupportedError);
    expect(() => bytes.buffer.asUint8List()[0] = 4, throwsUnsupportedError);
    expect(() => Uint8List.view(bytes.buffer)[0] = 4, throwsUnsupportedError);
    expect(() => Uint8List.sublistView(bytes)[0] = 4, throwsUnsupportedError);
    expect(
      () => ByteData.view(bytes.buffer).setUint8(0, 4),
      throwsUnsupportedError,
    );
    expect(
      () => bytes.buffer.asByteData().setUint8(0, 4),
      throwsUnsupportedError,
    );
    final detached = bytes.sublist(0);
    detached[0] = 8;
    expect(bytes[0], 1);
    expect(() => b.resources.clear(), throwsUnsupportedError);
    final next = b.withProject(b.project.withHeadline(AppLocale.ptPT, 'x'));
    expect(next.resources['photo'], same(bytes));
    // Dart creates fresh readonly ByteBuffer wrappers on getter access;
    // identical typed storage above is the no-copy witness, not wrapper identity.
    expect(next.resources['photo']!.lengthInBytes, bytes.lengthInBytes);
    final duplicate = next.withProject(next.project.duplicate(newId: 'b-copy'));
    expect(duplicate.resources['photo'], same(bytes));
    final extra = Uint8List.fromList([7]);
    final warnings = [
      const Problem(
        code: ProblemCode.lowContrast,
        severity: ProblemSeverity.warning,
      ),
    ];
    final entry = ResourceEntry(
      ref: ref(extra, id: 'logo', kind: AssetKind.logo),
      bytes: extra,
      warnings: warnings,
    );
    warnings.clear();
    extra[0] = 9;
    expect(entry.warnings.length, 1);
    expect(entry.bytes[0], 7);
    expect(() => entry.warnings.clear(), throwsUnsupportedError);
    expect(
      () => entry.bytes.buffer.asUint8List()[0] = 0,
      throwsUnsupportedError,
    );
    final inserted = duplicate.withResource(
      entry,
      project: duplicate.project.withLogo(entry.ref),
    );
    expect(inserted.resources['photo'], same(bytes));
    expect(inserted.resources['logo'], [7]);
    expect(duplicate.resources.containsKey('logo'), isFalse);
    expect(
      inserted
          .withProject(inserted.project.withLogo(null))
          .resources
          .containsKey('logo'),
      isTrue,
    );
  });
  test('bundle refuses absent references bad hashes and byte/entry overflow without mutating inputs', () {
    final data = Uint8List.fromList([1]);
    final p = Project.blank(id: 'p').withPhoto(ref(data));
    expect(() => ProjectBundle(p, {}), throwsArgumentError);
    expect(
      () => ProjectBundle(p, {
        'photo': Uint8List.fromList([2]),
      }),
      throwsArgumentError,
    );
    expect(
      () => ProjectBundle(Project.blank(id: 'p'), {'../bad': data}),
      throwsArgumentError,
    );
    final b = ProjectBundle(p, {'photo': data});
    expect(
      () => b.withProject(
        p.withLogo(ref(data, id: 'absent', kind: AssetKind.logo)),
      ),
      throwsArgumentError,
    );
    expect(
      () => ProjectBundle(Project.blank(id: 'p'), {
        for (var i = 0; i < 17; i++) 'r$i': data,
      }),
      throwsA(isA<CapacityExceeded>()),
    );
    final oversized = Uint8List(WorkLimits.photoBytes + 1);
    expect(
      () => ResourceEntry(ref: ref(oversized), bytes: oversized),
      throwsA(isA<CapacityExceeded>()),
    );
    final large = Uint8List(WorkLimits.projectExpandedBytes + 1);
    expect(
      () => ProjectBundle(Project.blank(id: 'p'), {'unused': large}),
      throwsA(isA<CapacityExceeded>()),
    );
    expect(b.resources['photo'], [1]);
    expect(data, [1]);
  });
}
