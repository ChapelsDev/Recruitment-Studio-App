// Inert full-composition control; original14-case target is unchanged.
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/features/projects/project.dart';
import 'package:recruitment_studio/features/projects/project_bundle.dart';
import 'package:recruitment_studio/features/storage/project_codec.dart';
import 'package:recruitment_studio/shared/admission_budget.dart';
import 'package:recruitment_studio/shared/work_budget.dart';
import 'package:recruitment_studio/shared/work_limits.dart';
import 'package_test_fixtures.dart';

void _manual(Project project, Project expected) {
  expect(project.id, expected.id);
  expect(project.revision, 107);
  expect(project.name, 'SYNTHETIC\n É œ ß 😀');
  expect(project.localeOrder, AppLocale.values.reversed.toList());
  expect(project.contactIds, ['second', 'first']);
  for (final locale in AppLocale.values) {
    expect(project.edition(locale).headline, '${locale.code}\n É œ ß 😀');
    expect(project.edition(locale).location, locale == AppLocale.fr ? '' : ' ${locale.code} ');
    expect(project.edition(locale).contacts, {'second': '', 'first': '${locale.code}@invalid.test'});
    for (var n = 0; n < 2; n++) {
      final section = project.sections[n];
      expect(section.id, 'section-$n');
      expect(section.visible, n == 0);
      expect(section.title(locale), '${locale.code} title $n');
      expect(section.items[0].text(locale), '');
      expect(section.items[1].text(locale), '${locale.code}\nitem $n');
    }
  }
  for (final format in expected.cropByFormat.keys) {
    final crop = project.cropByFormat[format]!;
    final original = expected.cropByFormat[format]!;
    expect([crop.left, crop.top, crop.width, crop.height],
        [original.left, original.top, original.width, original.height]);
  }
  expect([project.style.ink, project.style.accent, project.style.paper,
      project.style.bodyPx, project.style.logoScale],
      [0xff112233, 0xffabcdef, 0xfffefdfc, 34, 1.7]);
  expect(project.photo!.sha256, project.logo!.sha256);
  expect(project.photo!.id, isNot(project.logo!.id));
}

void main() {
  test('whole STORE DEFLATE pipeline holds genuine escaped graphs through handoff', () async {
    final sandbox = Directory.systemTemp.createTempSync('repair05-private-');
    final budget = WorkBudgetController();
    final bundle = await fixtureBundle(identicalRoles: true);
    final held = <Map<String, Object?>>[];
    final owners = <ProjectBundle>[bundle];
    final phases = <String>[];
    final codec = ZipProjectCodec(budget: budget, onPhase: (phase) {
      phases.add(phase);
      expect(AdmissionBudget.shared.reservedBytes, lessThanOrEqualTo(WorkLimits.ordinaryAdmissionBytes));
      expect(AdmissionBudget.shared.ticketCount, lessThanOrEqualTo(WorkLimits.admissionTickets));
      expect(budget.reservedBytes, lessThanOrEqualTo(WorkLimits.ownedBufferBytes));
    });
    try {
      final store = File('${sandbox.path}/store.recruitproj');
      await codec.encode(bundle, store);
      final restored = await codec.decode(store);
      owners.add(restored);
      held.add(restored.project.toManifest());
      held.add(bundle.project.toManifest());
      expect(held[0], held[1]);
      _manual(restored.project, bundle.project);
      // Hold the fixture serialization graph too: no requested GC credit.
      held.add(bundle.project.toManifest());
      final compressed = File('${sandbox.path}/deflate.recruitproj');
      compressed.writeAsBytesSync(packageZip(packagePayload(bundle), deflate: true));
      final second = await codec.decode(compressed);
      owners.add(second);
      held.add(second.project.toManifest());
      held.add(bundle.project.toManifest());
      expect(held[3], held[4]);
      _manual(second.project, bundle.project);
      expect(second.resources.keys, unorderedEquals(bundle.resources.keys));
      expect(second.resources[second.project.photo!.id], bundle.resources[bundle.project.photo!.id]);
      expect(second.resources[second.project.logo!.id], bundle.resources[bundle.project.logo!.id]);
      expect(phases.where((p) => p == 'beforePublication').length, 2);
      expect(budget.reservedBytes, 0);
      expect(held.length, 5);
      expect(owners.length, 3);
      // Source-only accounting is in ownership-accounting.json. These actual
      // assertions are controls for a later released run, not past measurements.
    } finally { sandbox.deleteSync(recursive: true); }
  });
}
