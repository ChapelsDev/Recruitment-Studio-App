// Frozen inert source-first maximum-shape controls; no test execution claimed.
import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/features/composition/export_format.dart';
import 'package:recruitment_studio/features/projects/project.dart';
import 'package:recruitment_studio/shared/admission_budget.dart';
import 'package:recruitment_studio/shared/work_limits.dart';

// Synthetic references exercise model validation, not real media/package I/O.
const _digest = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
Map<String, Object?> _ref(String id, String kind) => {
  'id': id, 'kind': kind, 'mediaType': 'png', 'width': 2, 'height': 2,
  'sha256': _digest,
};
Map<String, Object?> _maximumManifest({required bool withThumbnail}) {
  final contacts = List.generate(WorkLimits.contacts, (i) => 'contact_$i');
  return <String, Object?>{
    'schemaVersion': 1, 'modelVersion': 'editorial-b-v1',
    'id': 'maximum_project', 'revision': 0, 'name': 'maximum manual',
    'photo': _ref('maximum_photo', 'photo'),
    'logo': _ref('maximum_logo', 'logo'),
    'cropByFormat': <String, Object?>{
      for (final format in ExportFormat.values)
        format.name: <String, Object?>{
          'left': 0.0, 'top': 0.0, 'width': 1.0, 'height': 1.0,
        },
    },
    'contactIds': contacts,
    'localeOrder': [for (final locale in AppLocale.values) locale.code],
    'editions': <String, Object?>{
      for (final locale in AppLocale.values)
        locale.code: <String, Object?>{
          'headline': 'headline ${locale.code}',
          'location': 'location ${locale.code}',
          'contacts': <String, Object?>{
            for (final contact in contacts) contact: '${locale.code}:$contact',
          },
        },
    },
    'sections': <Object?>[
      for (var section = 0; section < WorkLimits.sections; section++)
        <String, Object?>{
          'id': 'section_$section', 'visible': section.isEven,
          'titles': <String, Object?>{
            for (final locale in AppLocale.values)
              locale.code: 'title $section ${locale.code}',
          },
          'items': <Object?>[
            for (var item = 0; item < WorkLimits.itemsPerSection; item++)
              <String, Object?>{
                'id': 'item_${section}_$item',
                'texts': <String, Object?>{
                  for (final locale in AppLocale.values)
                    locale.code: 'text $section $item ${locale.code}',
                },
              },
          ],
        },
    ],
    'style': <String, Object?>{
      'ink': 0xff000000, 'accent': 0xff336699, 'paper': 0xffffffff,
      'bodyPx': WorkLimits.bodyPxChoices.first, 'logoScale': 1.0,
    },
    if (withThumbnail) 'thumbnailRef': _ref('maximum_thumbnail', 'thumbnail'),
  };
}
Uint8List _bytes(Map<String, Object?> manifest) =>
    Uint8List.fromList(utf8.encode(jsonEncode(manifest)));
void _expectMaximumProject(ImmutableProject project) {
  expect(project.id, 'maximum_project');
  expect(project.revision, 0);
  expect(project.name, 'maximum manual');
  expect(project.modelVersion, 'editorial-b-v1');
  expect(project.localeOrder, AppLocale.values);
  expect(project.contactIds,
      List.generate(WorkLimits.contacts, (i) => 'contact_$i'));
  expect(project.photo!.id, 'maximum_photo');
  expect(project.photo!.kind, AssetKind.photo);
  expect(project.logo!.id, 'maximum_logo');
  expect(project.logo!.kind, AssetKind.logo);
  for (final ref in [project.photo!, project.logo!]) {
    expect(ref.mediaType, MediaType.png);
    expect(ref.width, 2);
    expect(ref.height, 2);
    expect(ref.sha256, _digest);
  }
  expect(project.cropByFormat.keys, unorderedEquals(ExportFormat.values));
  for (final crop in project.cropByFormat.values) {
    expect([crop.left, crop.top, crop.width, crop.height], [0.0, 0.0, 1.0, 1.0]);
  }
  for (final locale in AppLocale.values) {
    final edition = project.edition(locale);
    expect(edition.headline, 'headline ${locale.code}');
    expect(edition.location, 'location ${locale.code}');
    expect(edition.contacts.keys, unorderedEquals(project.contactIds));
    for (final contact in project.contactIds) {
      expect(edition.contacts[contact], '${locale.code}:$contact');
    }
  }
  expect(project.sections, hasLength(WorkLimits.sections));
  for (var index = 0; index < project.sections.length; index++) {
    final section = project.sections[index];
    expect(section.id, 'section_$index');
    expect(section.visible, index.isEven);
    expect(section.items, hasLength(WorkLimits.itemsPerSection));
    for (final locale in AppLocale.values) {
      expect(section.title(locale), 'title $index ${locale.code}');
      for (var item = 0; item < section.items.length; item++) {
        expect(section.items[item].id, 'item_${index}_$item');
        expect(section.items[item].text(locale), 'text $index $item ${locale.code}');
      }
    }
  }
  expect(project.style.ink, 0xff000000);
  expect(project.style.accent, 0xff336699);
  expect(project.style.paper, 0xffffffff);
  expect(project.style.bodyPx, WorkLimits.bodyPxChoices.first);
  expect(project.style.logoScale, 1.0);
}

void main() {
  test('private reader accepts maximum legal shape with the fresh thumbnail and header', () {
    final input = _bytes(_maximumManifest(withThumbnail: true));
    expect(input.length, lessThan(WorkLimits.manifestUtf8Bytes));
    final before = AdmissionBudget.shared.reservedBytes;
    final parsed = StrictManifestJson.readProject(input);
    _expectMaximumProject(parsed.project);
    expect(parsed.thumbnail, isNotNull);
    final thumbnail = parsed.thumbnail!;
    expect(thumbnail.id, 'maximum_thumbnail');
    expect(thumbnail.kind, AssetKind.thumbnail);
    expect(thumbnail.mediaType, MediaType.png);
    expect([thumbnail.width, thumbnail.height], [2, 2]);
    expect(thumbnail.sha256, _digest);
    expect(AdmissionBudget.shared.reservedBytes, greaterThan(before));
    expect(() => parsed.project.contactIds.add('foreign'), throwsUnsupportedError);
  });

  test('private reader preserves maximum legal shape without an optional thumbnail', () {
    final input = _bytes(_maximumManifest(withThumbnail: false));
    expect(input.length, lessThan(WorkLimits.manifestUtf8Bytes));
    final before = AdmissionBudget.shared.reservedBytes;
    final parsed = StrictManifestJson.readProject(input);
    _expectMaximumProject(parsed.project);
    expect(parsed.thumbnail, isNull);
    expect(AdmissionBudget.shared.reservedBytes, greaterThan(before));
    expect(() => parsed.project.sections.clear(), throwsUnsupportedError);
  });

  test('late maximum project refusal refunds fresh thumbnail and header without retiring held owners', () {
    final held = ImmutableProject(id: 'held_at_late_refusal',
        name: 'still held', contactIds: ['held_contact']);
    final heldAlias = held.contactIds;
    final heldEdition = held.edition(AppLocale.ptPT);
    final guard = AdmissionBudget.shared.reserve(1024);
    try {
      final manifest = _maximumManifest(withThumbnail: true);
      // Valid JSON/type/shape reaches ImmutableProject._ after all outer fresh
      // children, thumbnail and header have been created. The unchanged negative
      // revision guard is intentionally later than those producer births.
      manifest['revision'] = -1;
      final input = _bytes(manifest);
      expect(input.length, lessThan(WorkLimits.manifestUtf8Bytes));
      final before = AdmissionBudget.shared.reservedBytes;
      final tickets = AdmissionBudget.shared.ticketCount;
      expect(() => StrictManifestJson.readProject(input), throwsA(
        isA<ArgumentError>().having((error) => error.message,
            'late revision guard', 'Invalid revision or locale order')));
      // Synchronous observation: no await, forced GC, reset or retry.
      expect(AdmissionBudget.shared.reservedBytes, before);
      expect(AdmissionBudget.shared.ticketCount, tickets);
      expect(guard.isActive, isTrue);
      expect(held.name, 'still held');
      expect(held.revision, 0);
      expect(heldAlias, ['held_contact']);
      expect(held.contactIds, same(heldAlias));
      expect(held.edition(AppLocale.ptPT), same(heldEdition));
      expect(heldEdition.contacts['held_contact'], '');
    } finally { guard.release(); }
  });
}
