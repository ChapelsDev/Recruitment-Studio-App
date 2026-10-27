import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/features/projects/project.dart';

import 'package:recruitment_studio/features/composition/export_format.dart';
import 'package:recruitment_studio/shared/work_limits.dart';
import 'package:recruitment_studio/shared/problem.dart';

AssetRef asset(AssetKind kind, {String id = 'a1'}) => AssetRef(
  id: id,
  kind: kind,
  mediaType: MediaType.png,
  width: 20,
  height: 10,
  sha256: 'a' * 64,
);

void main() {
  test('exact UTF8 manifest threshold and first invalid preserve previous value', () {
    final p = Project.blank(id: 'exact').withSections(
      List.generate(
        4,
        (s) => Section(
          id: 's$s',
          items: List.generate(
            8,
            (i) => SectionItem(
              id: 'i$i',
              textByLocale: {AppLocale.ptPT: 'x' * 16000},
            ),
          ),
        ),
      ),
    );
    final bytes = utf8.encode(p.toManifestJson()).length;
    final gap = WorkLimits.manifestUtf8Bytes - bytes;
    expect(gap, inInclusiveRange(0, WorkLimits.fieldUtf16Units - 1));
    final exact = p.withName('x' * gap);
    expect(
      utf8.encode(exact.toManifestJson()).length,
      WorkLimits.manifestUtf8Bytes,
    );
    expect(Project.fromManifest(exact.toManifest()).name, exact.name);
    expect(
      () => exact.withName('${exact.name}x'),
      throwsA(isA<CapacityExceeded>()),
    );
    expect(
      utf8.encode(exact.toManifestJson()).length,
      WorkLimits.manifestUtf8Bytes,
    );
    final extra = Project.blank(id: 'depth').toManifest();
    Object? nested = 0;
    for (var i = 0; i < 30; i++) {
      nested = [nested];
    }
    extra['extra'] = nested;
    // Depth 32 reaches the schema unknown-key refusal, not the graph depth cap.
    expect(() => Project.fromManifest(extra), throwsFormatException);
    extra['extra'] = [nested];
    expect(() => Project.fromManifest(extra), throwsA(isA<CapacityExceeded>()));
  });
  test('direct constructor copies every container and rejects independent order mismatches', () {
    final contacts = ['c'];
    final locales = [AppLocale.ptPT, AppLocale.en];
    final editions = {
      AppLocale.ptPT: Edition(contacts: {'c': 'A'}),
      AppLocale.en: Edition(contacts: {'c': 'B'}),
    };
    final crops = {
      ExportFormat.square: NormalizedRect(left: 0, top: 0, width: 1, height: 1),
    };
    final sections = [Section(id: 'a'), Section(id: 'b')];
    final p = ImmutableProject(
      id: 'ctor',
      contactIds: contacts,
      localeOrder: locales,
      editions: editions,
      cropByFormat: crops,
      sections: sections,
    );
    contacts.clear();
    locales.clear();
    editions.clear();
    crops.clear();
    sections.clear();
    expect(p.edition(AppLocale.en).contacts, {'c': 'B'});
    expect(p.cropByFormat.length, 1);
    expect(p.sections.map((s) => s.id), ['a', 'b']);
    final reordered = p.withSections(p.sections.reversed.toList());
    expect(reordered.sections.map((s) => s.id), ['b', 'a']);
    expect(p.sections.map((s) => s.id), ['a', 'b']);
    expect(
      () => ImmutableProject(
        id: 'bad',
        contactIds: ['c'],
        editions: {AppLocale.ptPT: Edition()},
      ),
      throwsArgumentError,
    );
    expect(
      () => ImmutableProject(
        id: 'bad',
        localeOrder: [AppLocale.ptPT, AppLocale.ptPT],
      ),
      throwsArgumentError,
    );
    expect(
      () => ImmutableProject(
        id: 'bad',
        localeOrder: [AppLocale.ptPT],
        editions: {AppLocale.en: Edition()},
      ),
      throwsArgumentError,
    );
    expect(
      () => ImmutableProject(id: 'bad', revision: -1),
      throwsArgumentError,
    );
    expect(
      () => ImmutableProject(
        id: 'bad',
        revision: 0x7fffffffffffffff,
      ).withName('overflow'),
      throwsArgumentError,
    );
    final m = p.toManifest();
    m['sections'] = 'wrong';
    expect(() => Project.fromManifest(m), throwsFormatException);
    final map = p.toManifest();
    map['style'] = [];
    expect(() => Project.fromManifest(map), throwsFormatException);
    final boolMap = p.toManifest();
    ((boolMap['sections'] as List).first as Map)['visible'] = 0;
    expect(() => Project.fromManifest(boolMap), throwsFormatException);
    final key = p.toManifest();
    key['editions'] = {0: 'bad'};
    expect(() => Project.fromManifest(key), throwsFormatException);
    final scaleType =
        jsonDecode(jsonEncode(p.toManifest())) as Map<String, Object?>;
    (scaleType['style'] as Map)['logoScale'] = 'bad';
    expect(() => Project.fromManifest(scaleType), throwsFormatException);
    final huge = p.toManifest();
    huge['extra'] = 'x' * (WorkLimits.manifestUtf8Bytes + 1);
    expect(() => Project.fromManifest(huge), throwsA(isA<CapacityExceeded>()));
  });
  test('asset dimensions accept exact caps and reject first invalid on either side', () {
    AssetRef sized(AssetKind kind, int width, int height) => AssetRef(
      id: 'size',
      kind: kind,
      mediaType: MediaType.png,
      width: width,
      height: height,
      sha256: 'a' * 64,
    );
    expect(sized(AssetKind.photo, 4000, 3000).width, 4000);
    expect(sized(AssetKind.logo, 2000, 2000).height, 2000);
    expect(sized(AssetKind.thumbnail, 512, 512).height, 512);
    expect(
      () => sized(AssetKind.photo, 4001, 3000),
      throwsA(isA<CapacityExceeded>()),
    );
    expect(
      () => sized(AssetKind.logo, 2000, 2001),
      throwsA(isA<CapacityExceeded>()),
    );
    expect(
      () => sized(AssetKind.thumbnail, 1, 513),
      throwsA(isA<CapacityExceeded>()),
    );
    expect(() => sized(AssetKind.photo, 1, -1), throwsArgumentError);
    expect(
      () =>
          Project.blank(id: 'p').withContact(AppLocale.ptPT, 'c', 'x' * 16001),
      throwsA(isA<CapacityExceeded>()),
    );
    expect(
      () => Project.blank(id: 'p').withLocation(AppLocale.ptPT, 'x' * 16001),
      throwsA(isA<CapacityExceeded>()),
    );
    expect(
      () => Project.blank(id: 'p').withName('x' * 16001),
      throwsA(isA<CapacityExceeded>()),
    );
    expect(
      () => Section(id: 's', titleByLocale: {AppLocale.ptPT: 'x' * 16001}),
      throwsA(isA<CapacityExceeded>()),
    );
    expect(
      () => SectionItem(id: 'i', textByLocale: {AppLocale.ptPT: 'x' * 16001}),
      throwsA(isA<CapacityExceeded>()),
    );
    expect(
      Project.blank(id: 'p')
          .withContactIds(List.generate(8, (i) => 'c$i'))
          .contactIds
          .length,
      8,
    );
  });
  test('schema round trips every field and detached manifest with deterministic JSON', () {
    var p = Project.blank(id: 'rt')
        .withHeadline(AppLocale.ptPT, '  X😀 ')
        .withLocation(AppLocale.ptPT, 'Location')
        .withName('Name')
        .withContact(AppLocale.ptPT, 'c1', 'Email@Test')
        .withSections([
          Section(
            id: 's',
            visible: false,
            titleByLocale: {AppLocale.ptPT: 'Title'},
            items: [
              SectionItem(id: 'i', textByLocale: {AppLocale.ptPT: 'Item'}),
            ],
          ),
        ])
        .withPhoto(asset(AssetKind.photo))
        .withLogo(asset(AssetKind.logo, id: 'logo'))
        .withStyle(ProjectStyle(bodyPx: 26, logoScale: 0.5));
    for (final f in ExportFormat.values) {
      p = p.withCrop(
        f,
        NormalizedRect(left: 0, top: 0.25, width: 1, height: 0.5),
      );
    }
    for (final l in AppLocale.values.skip(1)) {
      p = p.withLocale(l).withHeadline(l, l.code);
    }
    final encoded = p.toManifestJson();
    final next = Project.fromManifest(
      jsonDecode(encoded) as Map<String, Object?>,
    );
    expect(next.toManifestJson(), encoded);
    expect(next.revision, p.revision);
    expect(next.id, 'rt');
    expect(next.edition(AppLocale.deCH).headline, 'de-CH');
    final manifest = next.toManifest();
    (manifest['localeOrder'] as List).clear();
    ((manifest['editions'] as Map)['pt-PT'] as Map)['headline'] = 'Changed';
    ((manifest['sections'] as List).single as Map)['id'] = 'changed';
    expect(next.toManifestJson(), encoded);
    final input = p.toManifest();
    final restored = Project.fromManifest(input);
    input.clear();
    expect(restored.toManifestJson(), encoded);
    final blank = Project.blank(id: 'blank');
    expect(
      Project.fromManifest(blank.toManifest()).toManifestJson(),
      blank.toManifestJson(),
    );
    final reordered = p.toManifest();
    reordered['localeOrder'] = AppLocale.values.reversed
        .map((l) => l.code)
        .toList();
    expect(
      Project.fromManifest(reordered).localeOrder,
      AppLocale.values.reversed,
    );
  });
  test('schema rejects single invalid cause with full passing controls', () {
    final p = Project.blank(id: 'valid')
        .withPhoto(asset(AssetKind.photo))
        .withContact(AppLocale.ptPT, 'c1', 'test')
        .withSections([
          Section(
            id: 's',
            items: [SectionItem(id: 'i')],
          ),
        ]);
    expect(Project.fromManifest(p.toManifest()).id, 'valid');
    void reject(void Function(Map<String, Object?>) mutate) {
      final m = p.toManifest();
      mutate(m);
      expect(
        () => Project.fromManifest(m),
        throwsA(
          anyOf(
            isA<FormatException>(),
            isA<ArgumentError>(),
            isA<CapacityExceeded>(),
          ),
        ),
      );
      expect(p.id, 'valid');
    }

    reject((m) => m['schemaVersion'] = 2);
    reject((m) => m['modelVersion'] = 'editorial-other');
    reject((m) => m['revision'] = -1);
    reject((m) => m['revision'] = 1.5);
    reject((m) => m['id'] = '../bad');
    reject((m) => m['name'] = null);
    reject((m) => m['extra'] = true);
    reject((m) => m.remove('style'));
    reject((m) => m['localeOrder'] = ['en']);
    reject((m) => m['localeOrder'] = ['pt-PT', 'pt-PT']);
    reject((m) => m['localeOrder'] = ['pt']);
    reject((m) => m['localeOrder'] = []);
    reject((m) => m['contactIds'] = ['c1', 'c1']);
    reject((m) => m['contactIds'] = ['c2']);
    reject((m) => (m['photo'] as Map)['kind'] = 'thumbnail');
    reject((m) => (m['photo'] as Map)['sha256'] = 'x');
    reject((m) => (m['photo'] as Map)['width'] = 0);
    reject((m) => (m['photo'] as Map)['mediaType'] = 'gif');
    reject((m) => (m['style'] as Map)['logoScale'] = double.nan);
    reject(
      (m) => m['cropByFormat'] = {
        'story': {'left': 0, 'top': 0, 'width': 2, 'height': 1},
      },
    );
    reject(
      (m) => m['cropByFormat'] = {
        'other': {'left': 0, 'top': 0, 'width': 1, 'height': 1},
      },
    );
    reject((m) => (m['sections'] as List).add((m['sections'] as List).single));
    reject(
      (m) => (((m['sections'] as List).single as Map)['items'] as List).add(
        ((((m['sections'] as List).single as Map)['items'] as List).single),
      ),
    );
    reject(
      (m) => (((m['sections'] as List).single as Map)['titles'] as Map)['en'] =
          'hidden',
    );
    reject((m) {
      ((m['editions'] as Map)['pt-PT'] as Map)['headline'] = 'x' * 16001;
    });
    final cycle = p.toManifest();
    cycle['extra'] = cycle;
    expect(() => Project.fromManifest(cycle), throwsFormatException);
    Object? nested = 0;
    for (var i = 0; i < 33; i++) {
      nested = [nested];
    }
    reject((m) => m['extra'] = nested);
    reject((m) => m['extra'] = Object());
  });
  test(
    'aggregate UTF8 manifest bound is independent of field UTF16 maxima',
    () {
      final full = List.generate(
        12,
        (s) => Section(
          id: 's$s',
          titleByLocale: {AppLocale.ptPT: 'a' * 16000},
          items: List.generate(
            8,
            (i) => SectionItem(
              id: 'i$i',
              textByLocale: {AppLocale.ptPT: 'a' * 16000},
            ),
          ),
        ),
      );
      final empty = Project.blank(id: 'capacity');
      expect(() => empty.withSections(full), throwsA(isA<CapacityExceeded>()));
      expect(empty.sections, isEmpty);
      final utf8Full = List.generate(
        12,
        (s) => Section(id: 's$s', titleByLocale: {AppLocale.ptPT: '€' * 16000}),
      );
      expect(
        () => empty.withSections(utf8Full),
        throwsA(isA<CapacityExceeded>()),
      );
      expect(
        empty
            .withSections(List.generate(12, (s) => Section(id: 's$s')))
            .sections
            .length,
        12,
      );
    },
  );
  test(
    'complete manual DTO snapshots and all edits preserve other locales',
    () {
      final titles = {AppLocale.ptPT: ' Título '};
      final texts = {AppLocale.ptPT: ' Texto\u00a0 '};
      final items = [SectionItem(id: 'i1', textByLocale: texts)];
      final sections = [
        Section(id: 's1', visible: false, titleByLocale: titles, items: items),
      ];
      var p = Project.blank(id: 'manual')
          .withName('  Name  ')
          .withLocation(AppLocale.ptPT, ' Porto\n')
          .withContact(AppLocale.ptPT, 'contact-1', ' A@B.Test\u00a0 ')
          .withSections(sections)
          .withPhoto(asset(AssetKind.photo))
          .withLogo(asset(AssetKind.logo, id: 'logo1'))
          .withCrop(
            ExportFormat.story,
            NormalizedRect(left: 0.1, top: 0.2, width: 0.5, height: 0.5),
          )
          .withStyle(ProjectStyle(bodyPx: 34, logoScale: 2));
      titles.clear();
      texts.clear();
      items.clear();
      sections.clear();
      expect(p.id, 'manual');
      expect(p.name, '  Name  ');
      expect(p.modelVersion, 'editorial-b-v1');
      expect(p.edition(AppLocale.ptPT).location, ' Porto\n');
      expect(
        p.edition(AppLocale.ptPT).contacts['contact-1'],
        ' A@B.Test\u00a0 ',
      );
      expect(p.sections.single.title(AppLocale.ptPT), ' Título ');
      expect(
        p.sections.single.items.single.text(AppLocale.ptPT),
        ' Texto\u00a0 ',
      );
      expect(p.sections.single.visible, isFalse);
      final old = p;
      for (final locale in AppLocale.values.skip(1)) {
        p = p.withLocale(locale);
      }
      for (final locale in AppLocale.values.skip(1)) {
        expect(p.edition(locale).headline, '');
        expect(p.edition(locale).location, '');
        expect(p.edition(locale).contacts, {'contact-1': ''});
        expect(p.sections.single.title(locale), '');
        expect(p.sections.single.items.single.text(locale), '');
      }
      expect(old.localeOrder, [AppLocale.ptPT]);
      expect(p.withLocale(AppLocale.en), same(p));
      final edited = p
          .withHeadline(AppLocale.fr, 'Bonjour')
          .withLocation(AppLocale.fr, 'Paris')
          .withContact(AppLocale.fr, 'contact-1', ' F@X ');
      expect(
        edited.edition(AppLocale.ptPT).contacts,
        old.edition(AppLocale.ptPT).contacts,
      );
      final copy = edited.duplicate(newId: 'copy1');
      expect(copy.id, 'copy1');
      expect(copy.revision, 0);
      expect(copy.edition(AppLocale.fr).headline, 'Bonjour');
      final removed = copy.withoutLocale(AppLocale.fr).withLogo(null);
      expect(removed.localeOrder.contains(AppLocale.fr), isFalse);
      expect(removed.logo, isNull);
      expect(
        removed.sections.single.titleByLocale.containsKey(AppLocale.fr),
        isFalse,
      );
      expect(copy.localeOrder.contains(AppLocale.fr), isTrue);
      final contacts = ['second', 'contact-1'];
      final ordered = edited.withContactIds(contacts);
      contacts.clear();
      expect(ordered.contactIds, ['second', 'contact-1']);
      expect(ordered.edition(AppLocale.fr).contacts['second'], '');
      expect(
        ordered.withContactIds(['second']).edition(AppLocale.fr).contacts,
        {'second': ''},
      );
      expect(() => copy.duplicate(newId: copy.id), throwsArgumentError);
      expect(
        () => Project.blank(id: 'x').withoutLocale(AppLocale.ptPT),
        throwsArgumentError,
      );
      expect(
        () => copy.withoutLocale(AppLocale.fr).withoutLocale(AppLocale.fr),
        throwsArgumentError,
      );
      expect(() => edited.withContactIds(['x', 'x']), throwsArgumentError);
      expect(() => Project.blank(id: ''), throwsArgumentError);
      expect(() => Project.blank(id: '../x'), throwsArgumentError);
      expect(
        () => p.withPhoto(asset(AssetKind.thumbnail)),
        throwsArgumentError,
      );
      expect(() => p.withLogo(asset(AssetKind.photo)), throwsArgumentError);
      expect(() => p.withLogo(asset(AssetKind.logo)), throwsArgumentError);
      expect(
        () => p.withHeadline(AppLocale.fr, 'x' * 16001),
        throwsA(isA<CapacityExceeded>()),
      );
      expect(
        p
            .withHeadline(AppLocale.fr, '😀' * 8000)
            .edition(AppLocale.fr)
            .headline
            .length,
        16000,
      );
      expect(
        () => p.withContactIds(List.generate(9, (i) => 'c$i')),
        throwsA(isA<CapacityExceeded>()),
      );
      expect(
        () => p.withSections([old.sections.single, old.sections.single]),
        throwsArgumentError,
      );
      expect(() => p.sections.clear(), throwsUnsupportedError);
      expect(() => p.cropByFormat.clear(), throwsUnsupportedError);
      expect(() => p.contactIds.clear(), throwsUnsupportedError);
      expect(
        () => p.edition(AppLocale.ptPT).contacts.clear(),
        throwsUnsupportedError,
      );
      expect(
        () => p.sections.single.titleByLocale.clear(),
        throwsUnsupportedError,
      );
      expect(() => p.sections.single.items.clear(), throwsUnsupportedError);
      expect(
        () => p.sections.single.items.single.textByLocale.clear(),
        throwsUnsupportedError,
      );
      expect(Project.blank(id: 'empty').name, '');
      expect(Project.blank(id: 'empty').photo, isNull);
      expect(Project.blank(id: 'empty').logo, isNull);
      expect(Project.blank(id: 'empty').sections, isEmpty);
      expect(Project.blank(id: 'empty').contactIds, isEmpty);
    },
  );
  test('DTO guards reject invalid bounds and preserve full valid controls', () {
    final style = ProjectStyle();
    expect(style.ink, 0xff173e38);
    expect(style.accent, 0xff205b50);
    expect(style.paper, 0xfff4f1e9);
    expect(style.bodyPx, 30);
    expect(style.logoScale, 1);
    for (final body in WorkLimits.bodyPxChoices) {
      expect(ProjectStyle(bodyPx: body).bodyPx, body);
    }
    for (final scale in [0.1, 4.0]) {
      expect(ProjectStyle(logoScale: scale).logoScale, scale);
    }
    for (final scale in [0.0, 4.1, double.nan, double.infinity]) {
      expect(() => ProjectStyle(logoScale: scale), throwsArgumentError);
    }
    expect(() => ProjectStyle(bodyPx: 25), throwsArgumentError);
    expect(() => ProjectStyle(ink: -1), throwsArgumentError);
    expect(() => ProjectStyle(paper: 0x100000000), throwsArgumentError);
    final rect = NormalizedRect(left: 0, top: 0, width: 1, height: 1);
    expect(rect.left, 0);
    expect(rect.top, 0);
    expect(rect.width, 1);
    expect(rect.height, 1);
    for (final values in [
      [-0.1, 0.0, 1.0, 1.0],
      [0.0, 0.0, 0.0, 1.0],
      [0.0, 0.5, 1.0, 0.6],
      [double.nan, 0.0, 1.0, 1.0],
      [0.0, 0.0, double.infinity, 1.0],
    ]) {
      expect(
        () => NormalizedRect(
          left: values[0],
          top: values[1],
          width: values[2],
          height: values[3],
        ),
        throwsArgumentError,
      );
    }
    expect(asset(AssetKind.photo).mediaType, MediaType.png);
    expect(
      () => AssetRef(
        id: 'bad',
        kind: AssetKind.photo,
        mediaType: MediaType.jpeg,
        width: 0,
        height: 10,
        sha256: 'a' * 64,
      ),
      throwsArgumentError,
    );
    expect(
      () => AssetRef(
        id: 'bad',
        kind: AssetKind.photo,
        mediaType: MediaType.jpeg,
        width: 12000001,
        height: 1,
        sha256: 'a' * 64,
      ),
      throwsA(isA<CapacityExceeded>()),
    );
    expect(
      () => AssetRef(
        id: 'bad',
        kind: AssetKind.logo,
        mediaType: MediaType.png,
        width: 4000001,
        height: 1,
        sha256: 'a' * 64,
      ),
      throwsA(isA<CapacityExceeded>()),
    );
    expect(
      () => AssetRef(
        id: 'bad',
        kind: AssetKind.thumbnail,
        mediaType: MediaType.png,
        width: 513,
        height: 1,
        sha256: 'a' * 64,
      ),
      throwsA(isA<CapacityExceeded>()),
    );
    expect(
      () => AssetRef(
        id: 'bad',
        kind: AssetKind.thumbnail,
        mediaType: MediaType.jpeg,
        width: 1,
        height: 1,
        sha256: 'a' * 64,
      ),
      throwsArgumentError,
    );
    expect(
      () => AssetRef(
        id: 'bad',
        kind: AssetKind.photo,
        mediaType: MediaType.jpeg,
        width: 1,
        height: 1,
        sha256: 'A' * 64,
      ),
      throwsArgumentError,
    );
    expect(
      () => Section(
        id: 's',
        items: [
          SectionItem(id: 'i'),
          SectionItem(id: 'i'),
        ],
      ),
      throwsArgumentError,
    );
    expect(
      () => Section(
        id: 's',
        items: List.generate(9, (i) => SectionItem(id: 'i$i')),
      ),
      throwsA(isA<CapacityExceeded>()),
    );
    expect(
      () =>
          Project.blank(id: 'p')
              .withSections(List.generate(13, (i) => Section(id: 's$i'))),
      throwsA(isA<CapacityExceeded>()),
    );
    expect(
      () => Project.blank(id: 'p').withSections([
        Section(id: 's', titleByLocale: {AppLocale.en: 'hidden'}),
      ]),
      throwsArgumentError,
    );
  });
  test('new language is empty and leaves original manual text intact', () {
    final p = Project.blank(id: 'p1')
        .withHeadline(AppLocale.ptPT, '  Vaga de teste\n');
    final next = p.withLocale(AppLocale.deCH);
    expect(next.edition(AppLocale.deCH).headline, '');
    expect(p.localeOrder.contains(AppLocale.deCH), isFalse);
    expect(next.edition(AppLocale.ptPT).headline, '  Vaga de teste\n');
    expect(p.revision, 1);
    expect(next.revision, 2);
    expect(Project.blank(id: 'p2').edition(AppLocale.ptPT).headline, '');
    expect(AppLocale.values.map((l) => l.code), [
      'pt-PT',
      'en',
      'fr',
      'it',
      'de-DE',
      'de-CH',
      'es',
    ]);
    expect(() => p.localeOrder.add(AppLocale.en), throwsUnsupportedError);
    expect(() => p.edition(AppLocale.en), throwsArgumentError);
  });
}
