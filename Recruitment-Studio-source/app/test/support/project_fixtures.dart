import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:recruitment_studio/features/projects/project.dart';
import 'package:recruitment_studio/features/projects/project_bundle.dart';

Project fixtureProject() {
  final bytes = File('test/fixtures/assets/photo.jpg').readAsBytesSync();
  final ref = AssetRef(
    id: 'fixture-photo',
    kind: AssetKind.photo,
    mediaType: MediaType.jpeg,
    width: 640,
    height: 480,
    sha256: sha256.convert(bytes).toString(),
  );
  return Project.blank(id: 'fixture-project')
      .withHeadline(AppLocale.ptPT, 'Vaga de teste')
      .withContact(AppLocale.ptPT, 'contact-1', 'contacto@invalid.test')
      .withPhoto(ref);
}

Future<ProjectBundle> fixtureBundle() async {
  final bytes = await File('test/fixtures/assets/photo.jpg').readAsBytes();
  return ProjectBundle(fixtureProject(), {'fixture-photo': bytes});
}
