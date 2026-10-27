import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/features/projects/company_profile.dart';
import 'package:recruitment_studio/features/projects/project.dart';
import 'package:recruitment_studio/features/projects/project_bundle.dart';
import 'package:recruitment_studio/shared/problem.dart';

void main() {
  test('partial profile defaults blank and defensively copies only explicit contacts colours', () {
    final blank = CompanyProfile();
    expect(blank.contacts, isEmpty);
    expect(blank.colours, isEmpty);
    expect(blank.logo, isNull);
    final contacts = {'tel': '  +00 Test  '};
    final colours = {'accent': 0xff000001};
    final p = CompanyProfile(contacts: contacts, colours: colours);
    contacts['tel'] = 'changed';
    colours['accent'] = 0;
    expect(p.contacts['tel'], '  +00 Test  ');
    expect(p.colours['accent'], 0xff000001);
    expect(() => p.contacts.clear(), throwsUnsupportedError);
    expect(() => p.colours.clear(), throwsUnsupportedError);
  });
  test(
    'profile validates literal IDs limits and only ink accent paper keys',
    () {
      for (final colours in <Map<String, int>>[
        {'unknown': 1},
        {'paper': -1},
        {'ink': 0x100000000},
      ]) {
        expect(() => CompanyProfile(colours: colours), throwsArgumentError);
      }
      expect(
        () => CompanyProfile(contacts: {'../tel': 'x'}),
        throwsArgumentError,
      );
      expect(
        () => CompanyProfile(contacts: {for (var i = 0; i < 9; i++) 'c$i': ''}),
        throwsA(isA<CapacityExceeded>()),
      );
      expect(
        () => CompanyProfile(contacts: {'tel': '😀' * 8001}),
        throwsA(isA<CapacityExceeded>()),
      );
      final bytes = Uint8List.fromList([1]);
      final photo = ResourceEntry(
        ref: AssetRef(
          id: 'logo',
          kind: AssetKind.photo,
          mediaType: MediaType.png,
          width: 1,
          height: 1,
          sha256: sha256.convert(bytes).toString(),
        ),
        bytes: bytes,
      );
      expect(() => CompanyProfile(logo: photo), throwsArgumentError);
      final logo = ResourceEntry(
        ref: AssetRef(
          id: 'logo',
          kind: AssetKind.logo,
          mediaType: MediaType.png,
          width: 1,
          height: 1,
          sha256: sha256.convert(bytes).toString(),
        ),
        bytes: bytes,
      );
      expect(CompanyProfile(logo: logo).logo, same(logo));
    },
  );
}
