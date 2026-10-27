import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/features/media/media_worker.dart';
import 'package:recruitment_studio/features/media/resource_service.dart';
import 'package:recruitment_studio/features/projects/project.dart';
import 'package:recruitment_studio/features/projects/project_bundle.dart';
import 'package:recruitment_studio/features/storage/package_preflight.dart';
import 'package:recruitment_studio/shared/operation.dart';
import 'package:recruitment_studio/shared/work_budget.dart';
import 'package:recruitment_studio/shared/work_limits.dart';
import 'package:recruitment_studio/shared/problem.dart';

import '../media/media_test_fixtures.dart';
import 'package_test_fixtures.dart';

void main() {
  late Directory sandbox;
  late WorkBudgetController budget;
  setUp(() {
    sandbox = Directory.systemTemp.createTempSync('t06-preflight-');
    budget = WorkBudgetController();
  });
  tearDown(() {
    sandbox.deleteSync(recursive: true);
    expect(budget.reservedBytes, 0);
  });
  Future<void> refused(Uint8List bytes, {Matcher? error}) async {
    final phases = <String>[];
    final service = ResourceService(
      budget: budget,
      worker: MediaWorker(onPhase: phases.add),
    );
    final file = await writePackage(sandbox, bytes);
    await expectLater(
      PackagePreflight(budget: budget, resources: service).inspect(file),
      throwsA(error ?? anything),
    );
    expect(file.readAsBytesSync(), bytes);
    expect(phases, isEmpty);
  }

  for (final deflate in [false, true]) {
    test(
      'whole package valid ${deflate ? 'DEFLATE' : 'STORE'} verifies actual images',
      () async {
        final phases = <String>[];
        final b = await fixtureBundle();
        final bytes = packageZip(packagePayload(b), deflate: deflate);
        final file = await writePackage(sandbox, bytes);
        final index = await PackagePreflight(
          budget: budget,
          resources: ResourceService(
            budget: budget,
            worker: MediaWorker(onPhase: phases.add),
          ),
        ).inspect(file);
        expect(index.project.toManifest(), b.project.toManifest());
        expect(index.entries.length, 3);
        expect(phases.where((p) => p == 'verified').length, 2);
        expect(file.readAsBytesSync(), bytes);
      },
    );
  }
  final names = [
    '../manifest.json',
    r'..\manifest.json',
    r'assets/..\manifest.json',
    'C:relative',
    'C:/manifest.json',
    r'\\server\share\manifest.json',
    r'\\?\C:\manifest.json',
    r'\\.\device',
    '/manifest.json',
    'manifest.json\u0000',
    'manifest.json:stream',
    'Manifest.json',
    'manifest.json.',
    'manifest.json ',
    'assets//x.png',
    'assets/nested.zip',
    'README',
    'é.png',
  ];
  for (var i = 0; i < names.length; i++) {
    test('unsafe raw ZIP name $i refused without normalization', () async {
      await refused(packageZip({names[i]: jsonBytes('{}')}));
    });
  }
  test('duplicate exact names rejected before manifest', () async {
    await refused(
      packageZip({
        'manifest.json': jsonBytes('{}'),
      }, duplicateName: 'manifest.json'),
    );
  });
  for (final mode in [0xa1ff, 0x41ed, 0x61a4]) {
    test('foreign ZIP file type $mode rejected', () async {
      await refused(packageZip({'manifest.json': jsonBytes('{}')}, mode: mode));
    });
  }
  for (final flags in [1, 8, 0x40, 0x2000, 0x8001]) {
    test('unsupported flags $flags rejected', () async {
      await refused(
        packageZip({'manifest.json': jsonBytes('{}')}, flags: flags),
      );
    });
  }
  test('UTF8 flag ASCII control accepted', () async {
    final b = ProjectBundle(Project.blank(id: 'utf8'), {});
    expect(
      (await PackagePreflight(budget: budget).inspect(
        await writePackage(
          sandbox,
          packageZip(packagePayload(b), flags: 0x800),
        ),
      )).project.id,
      'utf8',
    );
  });
  final localMutations = <String, List<int>>{
    'signature': [0, 0, 4],
    'version': [4, 45, 2],
    'flags': [6, 1, 2],
    'method': [8, 99, 2],
    'crc': [14, 1, 4],
    'compressed': [18, 1, 4],
    'expanded': [22, 1, 4],
    'extra': [28, 1, 2],
    'nameLength': [26, 1, 2],
  };
  for (final e in localMutations.entries) {
    test('local central divergence ${e.key} rejected', () async {
      final b = packageZip(packagePayload(await fixtureBundle()));
      await refused(mutateZip(b, e.value[0], e.value[1], width: e.value[2]));
    });
  }
  final centralMutations = <String, List<int>>{
    'signature': [0, 0, 4],
    'version': [6, 45, 2],
    'method': [10, 12, 2],
    'disk': [34, 1, 2],
    'extra': [30, 1, 2],
    'comment': [32, 1, 2],
    'offset': [42, 1, 4],
  };
  for (final e in centralMutations.entries) {
    test('central malformed ${e.key} rejected', () async {
      final b = packageZip(packagePayload(await fixtureBundle()));
      await refused(
        mutateZip(
          b,
          centralOffset(b) + e.value[0],
          e.value[1],
          width: e.value[2],
        ),
      );
    });
  }
  test('payload CRC corruption refused before any image decoder', () async {
    final b = packageZip(packagePayload(await fixtureBundle()));
    b[45] ^= 1;
    await refused(b);
  });
  test('truncated and trailing hidden container data rejected', () async {
    final b = packageZip(packagePayload(await fixtureBundle()));
    await refused(Uint8List.sublistView(b, 0, b.length - 1));
    await refused(Uint8List.fromList([...b, 0, 1]));
  });
  test('entry count capped before index allocation', () async {
    await refused(
      packageZip({for (var i = 0; i < 17; i++) 'entry$i': Uint8List(0)}),
      error: isA<CapacityExceeded>(),
    );
  });
  test('compressed cap checked before payload read', () async {
    final file = File('${sandbox.path}/large')..createSync();
    final raf = file.openSync(mode: FileMode.write);
    raf.truncateSync(WorkLimits.projectCompressedBytes + 1);
    raf.closeSync();
    await expectLater(
      PackagePreflight(budget: budget).inspect(file),
      throwsA(isA<CapacityExceeded>()),
    );
  });
  test('manifest byte cap before decode', () async {
    await refused(
      packageZip({
        'manifest.json': Uint8List(WorkLimits.manifestUtf8Bytes + 1),
      }),
      error: isA<CapacityExceeded>(),
    );
  });
  test('cumulative declared expansion cap composed across entries', () async {
    await refused(
      packageZip({
        'manifest.json': jsonBytes('{}'),
        'thumbnail.png': Uint8List(0),
      }, declaredSize: WorkLimits.projectExpandedBytes),
      error: isA<CapacityExceeded>(),
    );
  });
  test('actual DEFLATE expansion exceeds declaration refused', () async {
    await refused(
      packageZip(
        {'manifest.json': jsonBytes(' ' * 20000)},
        deflate: true,
        declaredSize: 3,
      ),
    );
  });
  test('legitimate high compression manifest is not ratio-rejected', () async {
    final p = Project.blank(id: 'compress').withName(' ' * 16000),
        b = ProjectBundle(p, {});
    final index = await PackagePreflight(budget: budget).inspect(
      await writePackage(sandbox, packageZip(packagePayload(b), deflate: true)),
    );
    expect(index.project.name.length, 16000);
    expect(index.entries['manifest.json']!.compressionRatio, greaterThan(20));
  });
  test(
    'missing referenced resource and orphan entry refused before media',
    () async {
      final entries = packagePayload(await fixtureBundle());
      entries.remove(entries.keys.last);
      await refused(packageZip(entries));
      final blank = packagePayload(
        ProjectBundle(Project.blank(id: 'blank'), {}),
      );
      blank['assets/${'a' * 64}.png'] = realPng();
      await refused(packageZip(blank));
    },
  );
  test(
    'same digest inconsistent declared role metadata refused before media',
    () async {
      final b = await fixtureBundle(identicalRoles: true),
          entries = packagePayload(await fixtureBundle(identicalRoles: true));
      final manifest = b.project.toManifest();
      (manifest['logo'] as Map<String, Object?>)['width'] = 4;
      entries['manifest.json'] = jsonBytes(jsonEncode(manifest));
      await refused(packageZip(entries));
    },
  );
  for (final field in [
    'schemaVersion',
    'modelVersion',
    'localeOrder',
    'contactIds',
    'id',
    'photo',
  ]) {
    test('domain strict $field rejects with no promotion', () async {
      final b = await fixtureBundle(), m = b.project.toManifest();
      m[field] = switch (field) {
        'schemaVersion' => 2,
        'modelVersion' => 'editorial-b-v2',
        'localeOrder' => ['pt-PT', 'pt-PT'],
        'contactIds' => ['a', 'a'],
        'id' => '../unsafe',
        _ => null,
      };
      final entries = packagePayload(b);
      entries['manifest.json'] = jsonBytes(jsonEncode(m));
      await refused(packageZip(entries));
    });
  }
  final invalidJson = [
    '{"a":1,"a":2}',
    r'{"a":1,"\u0061":2}',
    '{"a":{"x":1,"x":2}}',
    r'{"a":"\ud800"}',
    r'{"a":"\udc00"}',
    '{"a":01}',
    '{"a":NaN}',
    '{"a":1e999}',
    '{}{}',
    '[1,]',
    '{"x":true,}',
    'null',
    '\ufeff{}',
  ];
  for (var i = 0; i < invalidJson.length; i++) {
    test('strict JSON adversarial $i', () {
      expect(
        () => StrictManifestJson.parse(jsonBytes(invalidJson[i])),
        throwsA(anything),
      );
    });
  }
  test('strict JSON rejects malformed UTF8, depth and fanout before tree', () {
    expect(
      () => StrictManifestJson.parse(
        Uint8List.fromList([123, 34, 120, 34, 58, 34, 0xc0, 0xaf, 34, 125]),
      ),
      throwsA(isA<FormatException>()),
    );
    expect(
      () =>
          StrictManifestJson.parse(jsonBytes('{"x":${'[' * 33}0${']' * 33}}')),
      throwsA(isA<CapacityExceeded>()),
    );
    expect(
      () => StrictManifestJson.parse(
        jsonBytes('{"x":[${List.filled(10000, '0').join(',')}]}'),
      ),
      throwsA(isA<CapacityExceeded>()),
    );
  });
  test(
    'strict JSON exact scalar positive control escaped key and surrogate pair',
    () {
      expect(
        StrictManifestJson.parse(
          jsonBytes(r'{"\u0061":"\ud83d\ude00","n":-1.25e2,"b":true,"z":null}'),
        ),
        {'a': '😀', 'n': -125.0, 'b': true, 'z': null},
      );
    },
  );
  for (final imageCase in [
    'giant',
    'multiframe',
    'private',
    'wrongDimensions',
    'wrongType',
    'wrongHash',
  ]) {
    test('true-schema embedded $imageCase never invokes decoder', () async {
      var bytes = realPng();
      if (imageCase == 'giant') {
        bytes = Uint8List.fromList([
          ...pngHeader(100000, 100000),
          ...pngChunk('IDAT', [0]),
          ...pngChunk('IEND', []),
        ]);
      }
      if (imageCase == 'multiframe') {
        bytes = insertPngChunk(bytes, 'acTL', List.filled(8, 0));
      }
      if (imageCase == 'private') {
        bytes = insertPngChunk(bytes, 'tEXt', [65, 0, 66]);
      }
      final ref = packageRef(
        bytes,
        AssetKind.photo,
        width: imageCase == 'wrongDimensions' ? 4 : 3,
        type: imageCase == 'wrongType' ? MediaType.jpeg : MediaType.png,
      );
      final b = ProjectBundle(Project.blank(id: 'bad').withPhoto(ref), {
        ref.id: bytes,
      });
      final entries = packagePayload(b);
      if (imageCase == 'wrongHash') {
        entries[assetPath(ref)] = realPng(width: 4);
      }
      await refused(packageZip(entries));
    });
  }
  test('valid 512 thumbnail auxiliary not published as resource', () async {
    final b = await fixtureBundle();
    final thumbnail = realPng(width: 512, height: 512);
    final index = await PackagePreflight(budget: budget).inspect(
      await writePackage(
        sandbox,
        packageZip(packagePayload(b, thumbnail: thumbnail)),
      ),
    );
    expect(index.thumbnailRef!.kind, AssetKind.thumbnail);
    expect(index.thumbnailBytes, thumbnail);
    expect(index.resources.keys, unorderedEquals(['photo', 'logo']));
  });
  test(
    'thumbnail correct digest giant header refused before decoder',
    () async {
      final entries = packagePayload(
        await fixtureBundle(),
        thumbnail: realPng(width: 512, height: 512),
      );
      final giant = Uint8List.fromList([
        ...pngHeader(513, 512),
        ...pngChunk('IDAT', [0]),
        ...pngChunk('IEND', []),
      ]);
      entries['thumbnail.png'] = giant;
      final m = jsonDecode(
        utf8.decode(entries['manifest.json']!),
      ) as Map<String, dynamic>;
      (m['thumbnailRef'] as Map<String, dynamic>)['sha256'] = packageRef(
        giant,
        AssetKind.photo,
      ).sha256;
      entries['manifest.json'] = jsonBytes(jsonEncode(m));
      await refused(packageZip(entries));
    },
  );
  test('thumbnail omission and undeclared cache refused', () async {
    final b = await fixtureBundle();
    final index = await PackagePreflight(budget: budget)
        .inspect(await writePackage(sandbox, packageZip(packagePayload(b))));
    expect(index.thumbnailRef, null);
    final entries = packagePayload(b);
    entries['thumbnail.png'] = realPng();
    await refused(packageZip(entries));
  });
  test('cancel during index read preserves input and closes stream', () async {
    final bytes = packageZip(packagePayload(await fixtureBundle())),
        op = WorkOperation.create();
    final file = await writePackage(sandbox, bytes);
    final preflight = PackagePreflight(
      budget: budget,
      onPhase: (p) {
        if (p == 'indexRead') {
          op.cancel();
        }
      },
    );
    await expectLater(
      preflight.inspect(file, operation: op),
      throwsA(isA<OperationException>()),
    );
    await op.finish();
    expect(file.readAsBytesSync(), bytes);
  });
  test('input symlink refused without modifying regular target', () async {
    final bytes = packageZip(packagePayload(await fixtureBundle())),
        file = await writePackage(
          sandbox,
          packageZip(packagePayload(await fixtureBundle())),
        );
    Link('${sandbox.path}/alias').createSync(file.path);
    await expectLater(
      PackagePreflight(budget: budget).inspect(File('${sandbox.path}/alias')),
      throwsA(isA<Exception>()),
    );
    expect(file.readAsBytesSync(), bytes);
  });
}
