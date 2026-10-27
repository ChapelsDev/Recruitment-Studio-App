// Real ProductApplication + default native Windows gateway, sandbox private root.
// No fake picker, IO, runtime or provider. Automated cohort never drives a native
// picker. The explicitly opted-in operator cohort uses the ACTUAL system dialogs.
// Production KnownFolder bootstrap, DPI/focus/accessibility, offline first launch,
// native dialog cancellation and physical bilateral transfer remain manual gates.
import 'dart:io';

import 'package:archive/archive.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:recruitment_studio/product_application.dart';
import 'package:recruitment_studio/runtime/product_runtime.dart';
import 'package:recruitment_studio/features/composition/export_format.dart';
import 'package:recruitment_studio/features/editor/leave_project_guard.dart';
import 'package:recruitment_studio/features/export/export_name.dart';
import 'package:recruitment_studio/features/export/export_selection.dart';
import 'package:recruitment_studio/features/projects/project.dart';
import 'package:recruitment_studio/features/storage/project_codec.dart';

import 'support/windows_native_fixtures.dart';

Future<void> waitWindows(WidgetTester tester, bool Function() predicate,
    {Duration timeout = const Duration(seconds: 30)}) async {
  final clock = Stopwatch()..start();
  while (!predicate() && clock.elapsed < timeout) {
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 25)));
    await tester.pump();
  }
  expect(predicate(), isTrue, reason: 'Actual Windows state did not settle in $timeout');
}

Future<void> tapWindows(WidgetTester tester, String key) async {
  final finder = find.byKey(Key(key));
  await tester.ensureVisible(finder);
  await tester.tap(finder);
  await tester.pump();
}

Future<ProductRuntime> startWindowsProduct(WidgetTester tester, Directory root) async {
  try {
    await tester.pumpWidget(buildFunctionalApplication(privateDirectory: root));
    await waitWindows(tester, () => find.byKey(const Key('library-create')).evaluate().isNotEmpty);
    return tester.state<ProductApplicationState>(find.byType(ProductApplication)).runtime!;
  } catch (_) {
    final finder = find.byType(ProductApplication);
    final runtime = finder.evaluate().isEmpty ? null : tester.state<ProductApplicationState>(finder).runtime;
    if (runtime != null) {
      await closeWindowsProduct(tester, runtime);
    } else {
      // Frozen ProductApplicationState._open (54-71) has no public join future.
      // Unmount triggers its real not-mounted cleanup, but do NOT erase the
      // sandbox or claim a joined opening terminal when that seam is unavailable.
      await tester.pumpWidget(const SizedBox());
    }
    rethrow;
  }
}

Future<void> closeWindowsProduct(WidgetTester tester, ProductRuntime runtime) async {
  final closing = runtime.close();
  await tester.pumpWidget(const SizedBox()); // detach RawImage consumers first
  await tester.runAsync(() => closing);
  expect(runtime.unresolvedCleanup, isFalse);
  expect(runtime.budget.reservedBytes, 0, reason: 'Owned buffers retire after actual drain, not RSS');
}

Future<void> editSevenManualLanguages(WidgetTester tester, ProductRuntime runtime) async {
  await tapWindows(tester, 'step-languages');
  for (final locale in AppLocale.values) {
    if (!runtime.session!.project.localeOrder.contains(locale)) {
      await tapWindows(tester, 'enable-${locale.code}');
      expect(runtime.session!.project.edition(locale).headline, isEmpty,
        reason: 'Adding an edition never translates existing manual content');
    }
    await tapWindows(tester, 'select-${locale.code}');
    final headline = find.byKey(Key('headline-${locale.code}'));
    await tester.ensureVisible(headline);
    await tester.enterText(headline, manualHeadlines[locale]!);
    final location = find.byKey(Key('location-${locale.code}'));
    await tester.ensureVisible(location);
    await tester.enterText(location, 'Local ${locale.code}');
    await tester.pump();
    expect(runtime.session!.project.edition(locale).headline, manualHeadlines[locale]);
  }
  expect(runtime.session!.project.localeOrder, AppLocale.values);
}

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  testWidgets('Windows real library profile blank editor seven manual languages draft save and recovery', (tester) async {
    final root = await windowsSandbox();
    ProductRuntime? runtime;
    var drained = false;
    try {
      runtime = await startWindowsProduct(tester, root);
      expect(runtime.rows, isEmpty);
      await tapWindows(tester, 'library-profile');
      await tester.enterText(find.byKey(const Key('profile-contact-id')), 'contact-1');
      await tester.enterText(find.byKey(const Key('profile-contact-value')), 'qa@invalid.test');
      await tapWindows(tester, 'profile-contact-apply');
      await tapWindows(tester, 'profile-save');
      await waitWindows(tester, () => !runtime!.busy);
      expect(runtime.profile.draft.contacts['contact-1'], 'qa@invalid.test');
      await tapWindows(tester, 'profile-reload');
      await waitWindows(tester, () => !runtime!.busy);
      expect(runtime.profile.draft.contacts['contact-1'], 'qa@invalid.test');
      await tapWindows(tester, 'profile-back');
      await tapWindows(tester, 'library-create');
      await waitWindows(tester, () => runtime!.session != null && !runtime.busy);
      expect(runtime.session!.project.name, isEmpty);
      expect(runtime.session!.project.photo, isNull);
      expect(runtime.session!.project.edition(AppLocale.ptPT).headline, isEmpty);
      expect(runtime.session!.project.contactIds, isEmpty,
        reason: 'Saved profile must not auto-populate a blank project');
      await tester.enterText(find.byKey(const Key('project-name')), 'Windows manual QA');
      await editSevenManualLanguages(tester, runtime);
      await tapWindows(tester, 'product-apply-profile');
      await waitWindows(tester, () => find.byKey(const Key('profile-select-pt-PT')).evaluate().isNotEmpty);
      await tapWindows(tester, 'profile-select-pt-PT');
      await tapWindows(tester, 'profile-select-contact-contact-1');
      await tapWindows(tester, 'profile-copy-confirm');
      await waitWindows(tester, () => !runtime!.host!.mediaBusy);
      expect(runtime.session!.project.edition(AppLocale.ptPT).contacts['contact-1'], 'qa@invalid.test');
      for (final locale in AppLocale.values.where((value) => value != AppLocale.ptPT)) {
        expect(runtime.session!.project.edition(locale).contacts['contact-1'], isEmpty);
      }
      final id = runtime.session!.project.id;
      await tapWindows(tester, 'product-draft');
      await waitWindows(tester, () => !runtime!.busy);
      expect(runtime.message, 'Rascunho confirmado');
      await tapWindows(tester, 'product-library');
      await waitWindows(tester, () => find.byKey(const Key('leave-cancel')).evaluate().isNotEmpty);
      await tapWindows(tester, 'leave-cancel');
      expect(runtime.session!.project.id, id);
      expect(runtime.session!.hasUnsavedChanges, isTrue);
      await tapWindows(tester, 'product-library');
      await tapWindows(tester, 'leave-discard');
      await waitWindows(tester, () => runtime!.session == null && !runtime.busy);
      expect(runtime.rows.single.id, id);
      await tapWindows(tester, 'recover-$id');
      await waitWindows(tester, () => runtime!.session != null && !runtime.busy);
      expect(runtime.session!.project.name, 'Windows manual QA');
      for (final locale in AppLocale.values) {
        expect(runtime.session!.project.edition(locale).headline, manualHeadlines[locale]);
      }
      // External editable FILE roundtrip through current codec, not a mocked
      // acknowledgement and not the production save dialog/known-folder route.
      final codec = ZipProjectCodec(budget: runtime.budget);
      final editable = File('${root.path}/manual-editable.recruitproj');
      final capture = runtime.session!.captureSnapshot();
      try {
        await codec.encode(capture.bundle, editable);
        final reopened = await codec.decodeEditorSession(editable);
        try { expect(reopened.project.toManifest(), capture.bundle.project.toManifest()); }
        finally { reopened.dispose(); }
      } finally { capture.release(); }
      await closeWindowsProduct(tester, runtime);
      drained = true;
    } finally {
      // A failed close is NOT release proof: retain the sandbox/paid runtime
      // for diagnosis instead of deleting live resources or claiming success.
      if (!drained && runtime != null) {
        await closeWindowsProduct(tester, runtime);
        drained = true;
      }
      if (drained) await root.delete(recursive: true);
    }
  });

  const operatorPickers = bool.fromEnvironment('WINDOWS_OPERATOR_PICKERS');
  testWidgets('Windows OPERATOR actual save reopen PNG JPG ZIP and native picker cancellation', (tester) async {
    final root = await windowsSandbox();
    ProductRuntime? runtime;
    WindowsFixture? fixture;
    var drained = false;
    try {
      runtime = await startWindowsProduct(tester, root);
      await tapWindows(tester, 'library-create');
      await waitWindows(tester, () => runtime!.session != null && !runtime.busy);
      await tester.enterText(find.byKey(const Key('project-name')), 'Windows operator QA');
      await editSevenManualLanguages(tester, runtime);
      fixture = await WindowsFixture.generate();
      final photo = fixture.session.project.photo!;
      final input = File('${root.path}/on-device-photo.jpg');
      await writeFreshBytes(input, fixture.session.bundle.resources[photo.id]!);
      // Intentional operator instructions in explicitly opt-in native QA.
      // ignore: avoid_print
      print('OPERATOR: choose generated ${input.path} in the ACTUAL photo Open dialog.');
      await tapWindows(tester, 'step-content');
      await tapWindows(tester, 'choose-photo');
      await waitWindows(tester, () => !runtime!.host!.mediaBusy, timeout: const Duration(minutes: 3));
      expect(runtime.session!.project.photo, isNotNull);
      expect(runtime.session!.project.photo!.kind, AssetKind.photo);
      expect(runtime.session!.project.photo!.width, 640);
      expect(runtime.session!.project.photo!.height, 480);
      await tapWindows(tester, 'product-profile');
      // Intentional operator instructions in explicitly opt-in native QA.
      // ignore: avoid_print
      print('OPERATOR: choose SAME generated ${input.path} in the ACTUAL profile-logo Open dialog.');
      await tapWindows(tester, 'profile-logo');
      await waitWindows(tester, () => !runtime!.busy, timeout: const Duration(minutes: 3));
      expect(runtime.profile.draft.logo, isNotNull);
      await tapWindows(tester, 'profile-save');
      await waitWindows(tester, () => !runtime!.busy);
      await tapWindows(tester, 'profile-back');
      await tapWindows(tester, 'product-apply-profile');
      await waitWindows(tester, () => find.byKey(const Key('profile-select-logo')).evaluate().isNotEmpty);
      await tapWindows(tester, 'profile-select-pt-PT');
      await tapWindows(tester, 'profile-select-logo');
      await tapWindows(tester, 'profile-copy-confirm');
      await waitWindows(tester, () => !runtime!.host!.mediaBusy);
      expect(runtime.session!.project.logo!.sha256, runtime.profile.draft.logo!.ref.sha256);
      runtime.host!.edit((session) {
        for (final locale in AppLocale.values) {
          session.setContact(locale, 'contact-1', '${locale.code}@invalid.test');
        }
      });
      final saved = File('${root.path}/operator.recruitproj');
      // Intentional operator instructions in explicitly opt-in native QA.
      // ignore: avoid_print
      print('OPERATOR: save NEW editable file to ${saved.path}; never select personal files.');
      await tapWindows(tester, 'product-save');
      await waitWindows(tester, () => !runtime!.busy, timeout: const Duration(minutes: 3));
      expect(await saved.exists(), isTrue);
      expect(runtime.session!.hasConfirmedProjectSave, isTrue);
      final manifest = runtime.session!.project.toManifest();
      // Intentional operator instructions in explicitly opt-in native QA.
      // ignore: avoid_print
      print('OPERATOR: choose the SAME ${saved.path} in the actual Open dialog.');
      await tapWindows(tester, 'product-open');
      await waitWindows(tester, () => !runtime!.busy, timeout: const Duration(minutes: 3));
      expect(runtime.session!.project.toManifest(), manifest);
      for (final encoding in ImageEncoding.values) {
        for (final format in ExportFormat.values) {
          final output = File('${root.path}/operator-${format.name}.${encoding.name}');
          // Intentional operator instructions in explicitly opt-in native QA.
          // ignore: avoid_print
          print('OPERATOR: choose NEW destination ${output.path}. Content and destination approval are explicit QA inputs, not UI-dialog proof.');
          await tester.runAsync(() => runtime!.exportSelected(
            ExportSelection(locales: [AppLocale.ptPT], formats: [format], encoding: encoding),
            approveContent: (check) async {
              expect(check.invalidVariants, isEmpty);
              return false; // no omissions
            }, approveDestination: (check) async {
              expect(check.readyToExport, isTrue);
              return true;
            }));
          final decoded = await inspectImage(output, budget: runtime.budget, format: format);
          expect([decoded.width, decoded.height], [format.width, format.height]);
        }
      }
      final zip = File('${root.path}/operator-full.zip');
      // Intentional operator instructions in explicitly opt-in native QA.
      // ignore: avoid_print
      print('OPERATOR: choose NEW ZIP destination ${zip.path} after the ACTUAL content dialog.');
      await tapWindows(tester, 'step-review');
      for (final locale in AppLocale.values) {
        final key = 'export-locale-${locale.code}';
        if (!tester.widget<CheckboxListTile>(find.byKey(Key(key))).value!) {
          await tapWindows(tester, key);
        }
      }
      await tapWindows(tester, 'review-export');
      await waitWindows(tester, () => find.byKey(const Key('export-options-confirm')).evaluate().isNotEmpty);
      await tapWindows(tester, 'export-options-confirm');
      await waitWindows(tester, () => find.byKey(const Key('export-content-confirm')).evaluate().isNotEmpty);
      await tapWindows(tester, 'export-content-confirm');
      await waitWindows(tester, () => find.byKey(const Key('export-destination-confirm')).evaluate().isNotEmpty,
        timeout: const Duration(minutes: 3));
      await tapWindows(tester, 'export-destination-confirm');
      await waitWindows(tester, () => !runtime!.busy, timeout: const Duration(minutes: 3));
      final archive = ZipDecoder().decodeBytes(await zip.readAsBytes(), verify: true);
      final expectedNames = {
        for (final locale in AppLocale.values)
          for (final format in ExportFormat.values)
            '${locale.code}/${ExportName.forVariant(runtime.session!.project.name, locale, format, ImageEncoding.png)}',
      };
      expect(archive.files.map((entry) => entry.name).toSet(), expectedNames);
      expect(archive.files.length, expectedNames.length);
      for (var i = 0; i < archive.files.length; i++) {
        final entry = archive.files[i];
        final format = ExportFormat.values.singleWhere((format) => entry.name.endsWith('${format.width}x${format.height}.png'));
        final extracted = File('${root.path}/zip-member-$i.png');
        await writeFreshBytes(extracted, entry.content);
        final decoded = await inspectImage(extracted, budget: runtime.budget, format: format);
        expect([decoded.width, decoded.height], [format.width, format.height]);
      }
      runtime.host!.edit((session) => session.setName('Changed after reopen'));
      final beforeCancel = runtime.session!.project.toManifest();
      // Intentional operator instructions in explicitly opt-in native QA.
      // ignore: avoid_print
      print('OPERATOR: CANCEL the actual Save dialog (no output).');
      await tapWindows(tester, 'product-save');
      await waitWindows(tester, () => !runtime!.busy, timeout: const Duration(minutes: 3));
      expect(runtime.session!.project.toManifest(), beforeCancel);
      expect(runtime.session!.hasUnsavedChanges, isTrue);
      // Intentional operator instructions in explicitly opt-in native QA.
      // ignore: avoid_print
      print('OPERATOR: CANCEL the actual Open dialog; the direct QA call does not show a leave dialog.');
      await tester.runAsync(() => runtime!.openProject(decision: LeaveDecision.discard));
      expect(runtime.session!.project.toManifest(), beforeCancel);
      expect(runtime.message, 'Abertura cancelada — rascunho preservado');
      await closeWindowsProduct(tester, runtime);
      drained = true;
    } finally {
      try { fixture?.dispose(); }
      finally {
        if (!drained && runtime != null) { await closeWindowsProduct(tester, runtime); drained = true; }
        if (drained) await root.delete(recursive: true);
      }
    }
  }, skip: !operatorPickers); // MANUAL REQUIRED: opt in WINDOWS_OPERATOR_PICKERS=true, actual Windows operator; not an automated PASS
}
