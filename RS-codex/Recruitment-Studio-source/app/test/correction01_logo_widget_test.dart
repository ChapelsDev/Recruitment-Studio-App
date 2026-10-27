import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/runtime/product_runtime.dart';
import 'package:recruitment_studio/runtime/profile_panel.dart';
import 'package:recruitment_studio/features/documents/document_gateway.dart';
import 'package:recruitment_studio/features/projects/project.dart';
import 'package:recruitment_studio/features/projects/company_profile.dart';
import 'package:recruitment_studio/features/media/resource_service.dart';

import 'features/documents/windows_document_gateway_test.dart'
    show HostIo, HostPicker;

void main() {
  testWidgets(
    'D03 reachable logo removal retires profile copy only and persists only on explicit save',
    (tester) async {
      final root = (await tester.runAsync(
        () => Directory.systemTemp.createTemp('d03-logo-'),
      ))!;
      final runtime = (await tester.runAsync(
        () => ProductRuntime.open(
          root,
          (stage, budget) => WindowsDocumentGateway(
            picker: HostPicker(null),
            io: HostIo(),
            stagingDirectory: stage,
            budget: budget,
          ),
        ),
      ))!;
      final resources = ResourceService(budget: runtime.budget);
      final logo = (await tester.runAsync(
        () async => resources.importImage(
          await File('test/fixtures/assets/logo.png').readAsBytes(),
          AssetKind.logo,
        ),
      ))!;
      try {
        await tester.runAsync(runtime.create);
        runtime.profile.setDraft(
          CompanyProfile(
            logo: logo,
            contacts: {'tel': 'manual'},
            colours: {'ink': 0xff123456},
          ),
        );
        runtime.profile.apply(
          runtime.session!,
          {AppLocale.ptPT},
          contactIds: {'tel'},
          colourRoles: {'ink'},
          includeLogo: true,
        );
        await tester.runAsync(runtime.saveProfile);
        final before = runtime.session!.project.toManifest();
        final id = runtime.session!.project.logo!.id;
        final bytes = List<int>.from(runtime.session!.bundle.resources[id]!);
        final paidBefore = runtime.budget.reservedBytes;
        await tester.pumpWidget(
          MaterialApp(
            home: ProductProfilePanel(runtime: runtime, onBack: () {}),
          ),
        );
        await tester.scrollUntilVisible(
          find.byKey(const Key('profile-logo')),
          200,
          scrollable: find.byType(Scrollable).first,
        );
        final remove = find.byKey(const Key('profile-logo-remove'));
        expect(
          remove,
          findsOneWidget,
          reason: 'Profile logo removal must be a reachable manual action',
        );
        await tester.scrollUntilVisible(
          remove,
          200,
          scrollable: find.byType(Scrollable).first,
        );
        await tester.tap(remove);
        await tester.pump();
        expect(runtime.profile.draft.logo, isNull);
        expect(runtime.profile.draft.contacts['tel'], 'manual');
        expect(runtime.profile.draft.colours['ink'], 0xff123456);
        expect(runtime.budget.reservedBytes, paidBefore - logo.bytes.length);
        expect(runtime.session!.project.toManifest(), before);
        expect(runtime.session!.bundle.resources[id], bytes);
        await tester.runAsync(runtime.reloadProfile);
        expect(
          runtime.profile.draft.logo,
          isNotNull,
          reason: 'Removal was not automatically saved',
        );
        await tester.pumpWidget(
          MaterialApp(
            home: ProductProfilePanel(
              key: const Key('reloaded'),
              runtime: runtime,
              onBack: () {},
            ),
          ),
        );
        await tester.scrollUntilVisible(
          remove,
          200,
          scrollable: find.byType(Scrollable).first,
        );
        await tester.tap(remove);
        await tester.pump();
        await tester.runAsync(runtime.saveProfile);
        await tester.runAsync(runtime.reloadProfile);
        expect(runtime.profile.draft.logo, isNull);
        expect(runtime.session!.bundle.resources[id], bytes);
      } finally {
        await tester.pumpWidget(const SizedBox());
        await tester.runAsync(() => resources.release(logo));
        await tester.runAsync(runtime.close);
        runtime.dispose();
        await tester.runAsync(() => root.delete(recursive: true));
      }
    },
  );
}
