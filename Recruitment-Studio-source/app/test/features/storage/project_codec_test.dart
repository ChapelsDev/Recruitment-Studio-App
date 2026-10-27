import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/features/projects/project.dart';
import 'package:recruitment_studio/features/projects/project_bundle.dart';
import 'package:recruitment_studio/features/storage/project_codec.dart';
import 'package:recruitment_studio/features/storage/package_preflight.dart';
import 'package:recruitment_studio/shared/operation.dart';
import 'package:recruitment_studio/shared/work_budget.dart';
import 'package:recruitment_studio/shared/problem.dart';

import 'package_test_fixtures.dart';

void main() {
  late Directory sandbox;
  late WorkBudgetController budget;
  setUp(() {
    sandbox = Directory.systemTemp.createTempSync('t06-codec-');
    budget = WorkBudgetController();
  });
  tearDown(() {
    sandbox.deleteSync(recursive: true);
    expect(budget.reservedBytes, 0);
  });

  test('guardar e abrir nao precisa dos caminhos originais', () async {
    final b = await fixtureBundle();
    final file = File('${sandbox.path}/project.recruitproj');
    final codec = ZipProjectCodec(budget: budget);
    await codec.encode(b, file);
    final restored = await codec.decode(file);
    expect(restored.project.toManifest(), b.project.toManifest());
    expect(restored.resources.keys, unorderedEquals(b.resources.keys));
    for (final key in b.resources.keys) {
      expect(restored.resources[key], b.resources[key]);
      expect(identical(restored.resources[key], b.resources[key]), false);
    }
    expect(b.project.revision, 107);
  });
  test('blank incomplete project remains blank', () async {
    final b = ProjectBundle(Project.blank(id: 'blank'), {});
    final file = File('${sandbox.path}/blank.recruitproj');
    final codec = ZipProjectCodec(budget: budget);
    await codec.encode(b, file);
    expect(
      (await codec.decode(file)).project.toManifest(),
      b.project.toManifest(),
    );
    expect(
      (await PackagePreflight(budget: budget).inspect(file)).entries.keys,
      ['manifest.json'],
    );
  });
  test(
    'same bytes distinct role IDs deduplicate ZIP but restore both',
    () async {
      final b = await fixtureBundle(identicalRoles: true);
      final file = File('${sandbox.path}/dedup.recruitproj');
      final codec = ZipProjectCodec(budget: budget);
      await codec.encode(b, file);
      expect(
        (await PackagePreflight(budget: budget).inspect(file)).entries.length,
        2,
      );
      final restored = await codec.decode(file);
      expect(restored.resources.keys, unorderedEquals(['photo', 'logo']));
      expect(restored.project.toManifest(), b.project.toManifest());
    },
  );
  test(
    'encoder prunes only unreferenced retention without mutating original',
    () async {
      final b = await fixtureBundle();
      final retained = ProjectBundle(b.project, {
        ...b.resources,
        'old': Uint8List.fromList([1, 2, 3]),
      });
      final codec = ZipProjectCodec(budget: budget);
      final file = File('${sandbox.path}/pruned.recruitproj');
      await codec.encode(retained, file);
      expect(
        (await codec.decode(file)).resources.keys,
        unorderedEquals(['photo', 'logo']),
      );
      expect(retained.resources['old'], [1, 2, 3]);
    },
  );
  test('existing output preserved with no overwrite approval', () async {
    final file = File('${sandbox.path}/prior.recruitproj')
      ..writeAsBytesSync([7, 9]);
    await expectLater(
      ZipProjectCodec(budget: budget).encode(await fixtureBundle(), file),
      throwsA(isA<Exception>()),
    );
    expect(file.readAsBytesSync(), [7, 9]);
  });
  test(
    'output link and linked ancestor refused without touching target',
    () async {
      final prior = File('${sandbox.path}/prior')..writeAsBytesSync([9]);
      final link = Link('${sandbox.path}/alias')..createSync(prior.path);
      await expectLater(
        ZipProjectCodec(budget: budget)
            .encode(await fixtureBundle(), File(link.path)),
        throwsA(isA<Exception>()),
      );
      final dir = Directory('${sandbox.path}/real')..createSync();
      Link('${sandbox.path}/linked').createSync(dir.path);
      await expectLater(
        ZipProjectCodec(budget: budget)
            .encode(await fixtureBundle(), File('${sandbox.path}/linked/out')),
        throwsA(isA<Exception>()),
      );
      expect(prior.readAsBytesSync(), [9]);
      expect(dir.listSync(), isEmpty);
    },
  );
  test(
    'borrowed operation stays open and fresh output survives finish',
    () async {
      final op = WorkOperation.create();
      final codec = ZipProjectCodec(budget: budget);
      final file = File('${sandbox.path}/borrowed.recruitproj');
      await codec.encode(await fixtureBundle(), file, operation: op);
      expect(op.isFinishing, false);
      await codec.decode(file, operation: op);
      expect(op.isFinishing, false);
      await op.finish();
      expect(file.existsSync(), true);
    },
  );
  test(
    'cancelled encode preserves foreign output and produces no candidate',
    () async {
      final op = WorkOperation.create()..cancel();
      final file = File('${sandbox.path}/cancelled.recruitproj');
      await expectLater(
        ZipProjectCodec(budget: budget)
            .encode(await fixtureBundle(), file, operation: op),
        throwsA(isA<OperationException>()),
      );
      expect(file.existsSync(), false);
      await op.finish();
    },
  );
  test(
    'late cancellation before publication preserves input and prior bundle',
    () async {
      final b = await fixtureBundle(),
          bytes = packageZip(packagePayload(await fixtureBundle()));
      final file = await writePackage(sandbox, bytes),
          op = WorkOperation.create();
      final codec = ZipProjectCodec(
        budget: budget,
        onPhase: (p) {
          if (p == 'beforePublication') {
            op.cancel();
          }
        },
      );
      await expectLater(
        codec.decode(file, operation: op),
        throwsA(isA<OperationException>()),
      );
      expect(file.readAsBytesSync(), bytes);
      expect(b.project.revision, 107);
      await op.finish();
    },
  );
  test('finishing before publication never returns candidate', () async {
    final file = await writePackage(
          sandbox,
          packageZip(packagePayload(await fixtureBundle())),
        ),
        op = WorkOperation.create();
    Future<void>? finish;
    final codec = ZipProjectCodec(
      budget: budget,
      onPhase: (p) {
        if (p == 'beforePublication') {
          finish = op.finish();
        }
      },
    );
    await expectLater(
      codec.decode(file, operation: op),
      throwsA(isA<OperationException>()),
    );
    await finish;
  });
  test(
    'validated snapshot STORE reuse performs no second media worker or digest',
    () async {
      final phases = <String>[];
      final codec = ZipProjectCodec(budget: budget, onPhase: phases.add);
      final b = await fixtureBundle();
      await codec.encode(b, File('${sandbox.path}/first'));
      expect(phases.where((p) => p == 'mediaAdmission').length, 2);
      expect(phases.where((p) => p == 'digest').length, 2);
      phases.clear();
      await codec.encode(
        b.withProject(b.project.withName('changed text')),
        File('${sandbox.path}/second'),
      );
      expect(
        phases.where((p) => p == 'mediaAdmission' || p == 'digest'),
        isEmpty,
      );
    },
  );
  test('capacity refusal before output creation preserves source', () async {
    final codec = ZipProjectCodec(
      budget: WorkBudgetController(capacityBytes: 1),
    );
    final b = await fixtureBundle();
    final file = File('${sandbox.path}/capacity');
    await expectLater(codec.encode(b, file), throwsA(isA<CapacityExceeded>()));
    expect(file.existsSync(), false);
    expect(b.project.revision, 107);
  });
  test(
    'cancellation after output flush deletes only owned prepared output',
    () async {
      final op = WorkOperation.create();
      final codec = ZipProjectCodec(
        budget: budget,
        onPhase: (p) {
          if (p == 'outputClosed') {
            op.cancel();
          }
        },
      );
      final file = File('${sandbox.path}/prepared');
      await expectLater(
        codec.encode(await fixtureBundle(), file, operation: op),
        throwsA(isA<OperationException>()),
      );
      await op.finish();
      expect(file.existsSync(), false);
    },
  );
  test('encoder rejects malformed Unicode without replacing text', () async {
    final project = Project.blank(id: 'unicode').withName('\ud800');
    final bundle = ProjectBundle(project, {}),
        file = File('${sandbox.path}/unicode');
    await expectLater(
      ZipProjectCodec(budget: budget).encode(bundle, file),
      throwsA(isA<FormatException>()),
    );
    expect(file.existsSync(), false);
    expect(bundle.project.name.codeUnitAt(0), 0xd800);
  });
  test(
    'cancel after closed output replacement preserves foreign file',
    () async {
      final op = WorkOperation.create(),
          file = File('${sandbox.path}/replaced');
      final codec = ZipProjectCodec(
        budget: budget,
        onPhase: (p) {
          if (p == 'outputClosed') {
            file.deleteSync();
            file.writeAsBytesSync([7, 9, 11]);
            op.cancel();
          }
        },
      );
      await expectLater(
        codec.encode(await fixtureBundle(), file, operation: op),
        throwsA(isA<OperationException>()),
      );
      await op.finish();
      expect(file.readAsBytesSync(), [7, 9, 11]);
    },
  );

  test(
    'T06 cleanup-accounting-01 borrowed rich missing output drains',
    () async {
      await cleanupAccountingCase(sandbox, budget, mode: 'missing');
    },
  );
  test(
    'T06 cleanup-accounting-01 borrowed blank missing output drains',
    () async {
      await cleanupAccountingCase(
        sandbox,
        budget,
        mode: 'missing',
        rich: false,
      );
    },
  );
  test(
    'T06 cleanup-accounting-01 owned rich missing output releases',
    () async {
      await cleanupAccountingCase(
        sandbox,
        budget,
        mode: 'missing',
        owned: true,
      );
    },
  );
  test(
    'T06 cleanup-accounting-01 borrowed rich replacement directory survives',
    () async {
      await cleanupAccountingCase(sandbox, budget, mode: 'directory');
    },
  );
  test(
    'T06 cleanup-accounting-01 borrowed rich discarded hook error drains',
    () async {
      await cleanupAccountingCase(sandbox, budget, mode: 'hook');
    },
  );
  test(
    'T06 cleanup-accounting-01 owned rich discarded hook error releases',
    () async {
      await cleanupAccountingCase(sandbox, budget, mode: 'hook', owned: true);
    },
  );
  test(
    'T06 cleanup-accounting-01 ordinary borrowed rich cancellation control',
    () async {
      await cleanupAccountingCase(sandbox, budget, mode: 'ordinary');
    },
  );
  test(
    'T06 cleanup-accounting-01 regular replacement preservation control',
    () async {
      await cleanupAccountingCase(sandbox, budget, mode: 'regular');
    },
  );
}

Future<void> cleanupAccountingCase(
  Directory sandbox,
  WorkBudgetController budget, {
  required String mode,
  bool rich = true,
  bool owned = false,
}) async {
  const deadline = Duration(seconds: 3);
  final bundle = rich
      ? await fixtureBundle()
      : ProjectBundle(Project.blank(id: 'cleanup-blank'), {});
  final priorManifest = bundle.project.toManifest();
  final file = File('${sandbox.path}/cleanup-output');
  final borrowed = owned ? null : WorkOperation.create();
  final abort = StateError('synthetic outputClosed abort');
  final diagnostic = StateError('synthetic outputDiscarded diagnostic');
  final phases = <String>[];
  var chargedAtClosed = 0;
  final codec = ZipProjectCodec(
    budget: budget,
    onPhase: (phase) {
      phases.add(phase);
      if (phase == 'outputClosed') {
        chargedAtClosed = budget.reservedBytes;
        if (mode == 'missing' || mode == 'directory' || mode == 'regular') {
          file.deleteSync();
        }
        if (mode == 'directory') {
          Directory(file.path).createSync();
          File('${file.path}/sentinel').writeAsBytesSync([31, 41, 59]);
        }
        if (mode == 'regular') {
          file.writeAsBytesSync([7, 9, 11]);
        }
        if (borrowed != null) {
          borrowed.cancel();
        } else {
          throw abort;
        }
      }
      if (phase == 'outputDiscarded' && mode == 'hook') {
        throw diagnostic;
      }
    },
  );
  Object? encodeError;
  try {
    await codec.encode(bundle, file, operation: borrowed).timeout(deadline);
  } catch (error) {
    encodeError = error;
  }
  final callerStillOwns = borrowed == null || !borrowed.isFinishing;
  Object? finishError;
  if (borrowed != null) {
    try {
      await borrowed.finish().timeout(deadline);
    } catch (error) {
      finishError = error;
    }
  }
  final afterTeardown = budget.reservedBytes;
  final probe = WorkOperation.create();
  Object? slotError;
  try {
    final lease = await budget.acquire(probe, 1).timeout(deadline);
    lease.release();
  } catch (error) {
    slotError = error;
    probe.cancel();
  }
  await probe.finish().timeout(deadline);

  expect(finishError, isNull, reason: 'borrowed pending output must drain');
  expect(slotError, isNull, reason: 'heavy slot must be reacquirable');
  expect(
    afterTeardown,
    0,
    reason: 'codec charge and child scratch must release',
  );
  expect(budget.reservedBytes, 0);
  expect(budget.queuedCount, 0);
  expect(callerStillOwns, true, reason: 'codec must not finish borrowed owner');
  expect(chargedAtClosed, greaterThanOrEqualTo(16 * 1024 * 1024));
  expect(phases.where((p) => p == 'outputClosed').length, 1);
  expect(phases.where((p) => p == 'outputDiscarded').length, 1);
  expect(phases.where((p) => p == 'mediaAdmission').length, rich ? 2 : 0);
  expect(phases.where((p) => p == 'digest').length, rich ? 2 : 0);
  if (mode == 'hook') {
    expect(encodeError, same(diagnostic));
  } else if (owned) {
    expect(encodeError, same(abort));
  } else {
    expect(encodeError, isA<OperationException>());
  }
  if (mode == 'directory') {
    expect(Directory(file.path).existsSync(), true);
    expect(File('${file.path}/sentinel').readAsBytesSync(), [31, 41, 59]);
  } else if (mode == 'regular') {
    expect(file.readAsBytesSync(), [7, 9, 11]);
  } else {
    expect(FileSystemEntity.typeSync(file.path), FileSystemEntityType.notFound);
  }
  expect(bundle.project.toManifest(), priorManifest);
}
