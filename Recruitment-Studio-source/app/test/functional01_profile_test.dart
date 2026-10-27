import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/features/projects/project_profile.dart';
import 'package:recruitment_studio/features/projects/project.dart';
import 'package:recruitment_studio/features/editor/editor_session.dart';
import 'package:recruitment_studio/features/storage/local_repository.dart';
import 'package:recruitment_studio/shared/work_budget.dart';

void main() {
 test('F01 profile is empty saves without previous project and applies only chosen contacts and locales', () async {
  final root = await Directory.systemTemp.createTemp('f01-profile-');
  final budget = WorkBudgetController();
  final repo = FileLocalRepository(root, budget: budget);
  final profiles = ProjectProfileController(repo, budget: budget);
  try {
   await profiles.load();
   expect(profiles.draft.contacts, isEmpty);
   expect(profiles.draft.colours, isEmpty);
   expect(profiles.draft.logo, isNull);
   final entered = CompanyProfile(contacts: {'tel': '+00 000', 'email': 'human@invalid.test'}, colours: {'ink': 0xff102030});
   await profiles.save(entered);
   final session = EditorSession(Project.blank(id:'manual').withLocale(AppLocale.en), budget: budget);
   profiles.apply(session, {AppLocale.en}, contactIds: {'tel'}, colourRoles: {}, includeLogo:false);
   expect(session.project.edition(AppLocale.en).contacts['tel'], '+00 000');
   expect(session.project.edition(AppLocale.ptPT).contacts['tel'], '');
   expect(session.project.contactIds, ['tel']);
   final before = session.project.toManifest();
   await profiles.save(CompanyProfile(contacts: {'tel': 'changed'}));
   expect(session.project.toManifest(), before);
   session.dispose();
  } finally { profiles.close(); await repo.close(); await root.delete(recursive:true); }
  expect(budget.reservedBytes, 0);
 });
}
