import 'dart:io';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/runtime/product_runtime.dart';
import 'package:recruitment_studio/runtime/native_bootstrap.dart';
import 'package:recruitment_studio/features/documents/document_gateway.dart';
import 'package:recruitment_studio/features/projects/company_profile.dart';
import 'package:recruitment_studio/features/storage/local_repository.dart';
import 'package:recruitment_studio/shared/work_budget.dart';

import 'features/documents/windows_document_gateway_test.dart'
    show HostIo, HostPicker;

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test('C15 failed real profile persistence and unavailable load retain typed manual profile and never alter existing project', () async {
    final root = await Directory.systemTemp.createTemp('c15-profile-refusal-');
    final budget = WorkBudgetController();
    final runtime = await ProductRuntime.open(
      root,
      (stage, domain) => WindowsDocumentGateway(
        picker: HostPicker(null),
        io: HostIo(),
        stagingDirectory: stage,
        budget: domain,
      ),
      budget: budget,
    );
    try {
      await runtime.create();
      runtime.host!.edit((s) => s.setName('Independent manual project'));
      final generation = runtime.session!.generation;
      runtime.profile.setDraft(
        CompanyProfile(contacts: {'typed': 'old@example.invalid'}),
      );
      await runtime.saveProfile();
      final manual = CompanyProfile(
        contacts: {'typed': 'new@example.invalid'},
        colours: {'accent': 0xff123456},
      );
      runtime.profile.setDraft(manual);
      runtime.repository.store.onPhase = (phase) async {
        if (phase == RepositoryPhase.writeSnapshot) {
          throw const FileSystemException(
            'Controlled private filesystem failure',
          );
        }
      };
      await runtime.saveProfile();
      expect(runtime.profile.draft, same(manual));
      expect(runtime.message, contains('não confirmada'));
      expect(runtime.session!.generation, generation);
      expect(runtime.session!.project.name, 'Independent manual project');
      runtime.repository.store.onPhase = null;
      final snapshots = await runtime.repository.directory
          .list()
          .where(
            (e) => e is File && e.uri.pathSegments.last.startsWith('profile-'),
          )
          .cast<File>()
          .toList();
      expect(snapshots, isNotEmpty);
      final file = snapshots.first, bytes = await snapshots.first.readAsBytes();
      await file.writeAsBytes([0, 1]);
      await runtime.reloadProfile();
      expect(runtime.profile.draft, same(manual));
      expect(runtime.message, contains('não confirmada'));
      await file.writeAsBytes(bytes);
    } finally {
      runtime.repository.store.onPhase = null;
      await runtime.close();
      runtime.dispose();
      await root.delete(recursive: true);
    }
    expect(budget.reservedBytes, 0);
  });
  test('C16 native private root boundary refuses missing relative overlong NUL and unsupported Linux rather than fabricating paths', () async {
    const channel = MethodChannel('local.recruitment/private_runtime');
    Object? response;
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (call) async => response);
    try {
      for (final invalid in <String?>[
        null,
        '',
        'relative-root',
        '/a\u0000b',
        '/${'a' * 4096}',
      ]) {
        response = invalid;
        await expectLater(
          NativeProductBootstrap.privateRoot(platform: TargetPlatform.android),
          throwsStateError,
        );
      }
      await expectLater(
        NativeProductBootstrap.privateRoot(platform: TargetPlatform.linux),
        throwsUnsupportedError,
      );
    } finally {
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(channel, null);
    }
  });
}
