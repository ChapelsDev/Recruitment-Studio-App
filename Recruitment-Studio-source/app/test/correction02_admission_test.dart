import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/features/composition/export_format.dart';
import 'package:recruitment_studio/features/documents/document_gateway.dart';
import 'package:recruitment_studio/features/editor/editor_session.dart';
import 'package:recruitment_studio/features/export/export_selection.dart';
import 'package:recruitment_studio/features/projects/project.dart';
import 'package:recruitment_studio/runtime/product_runtime.dart';
import 'package:recruitment_studio/shared/admission_budget.dart';
import 'package:recruitment_studio/shared/work_budget.dart';

import 'features/documents/windows_document_gateway_test.dart' show HostIo;
import 'support/project_fixtures.dart';

class CountPicker implements WindowsDocumentPicker {
  int opens = 0, saves = 0;
  @override
  Future<String?> open(Set<String> mimes) async {
    opens++;
    return null;
  }

  @override
  Future<String?> save(String name, String mime) async {
    saves++;
    return null;
  }
}

final selection = ExportSelection(
  locales: [AppLocale.ptPT],
  formats: [ExportFormat.square],
  encoding: ImageEncoding.png,
  bundleAsZip: false,
);

Future<(Directory, ProductRuntime, CountPicker)> stableRuntime() async {
  final root = await Directory.systemTemp.createTemp('e02-');
  final budget = WorkBudgetController();
  final picker = CountPicker();
  final runtime = await ProductRuntime.open(
    root,
    (stage, domain) => WindowsDocumentGateway(
      picker: picker,
      io: HostIo(),
      stagingDirectory: stage,
      budget: domain,
    ),
    budget: budget,
  );
  await runtime.adoptSession(
    EditorSession.fromBundle(await fixtureBundle(), budget: budget),
  );
  runtime.host!.edit((s) => s.setName('manual retained value'));
  runtime.host!.preview.setPaused(true);
  await runtime.host!.preview.processingSettled;
  await runtime.scheduler!.checkpoint();
  await Future<void>.delayed(Duration.zero);
  return (root, runtime, picker);
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test(
    'E02 open ordinary root refusal retires paid capture and leave permit',
    () async {
      final (root, runtime, picker) = await stableRuntime();
      final current = runtime.session!;
      final generation = current.generation;
      final ordinary = AdmissionBudget.shared;
      final before = ordinary.reservedBytes;
      final pressure = ordinary.reserve(ordinary.capacityBytes - before - 1024);
      try {
        expect(ordinary.capacityBytes - ordinary.reservedBytes, 1024);
        await runtime.openProject();
        expect(runtime.message, contains('Limite de capacidade'));
        expect(picker.opens, 0);
        expect(
          ordinary.capacityBytes - ordinary.reservedBytes,
          1024,
          reason: 'Root refusal must not retain its admitted capture ticket',
        );
        pressure.release();
        final attempt = current.beginLeaveAttempt();
        expect(
          attempt,
          isNotNull,
          reason: 'Real transition permit must be available after refusal',
        );
        attempt!.end();
        await runtime.openProject();
        expect(picker.opens, 1);
        expect(identical(runtime.session, current), isTrue);
        expect(current.project.name, 'manual retained value');
        expect(current.generation, generation);
        expect(current.hasUnsavedChanges, isTrue);
      } finally {
        pressure.release();
        await runtime.close();
        runtime.dispose();
        await root.delete(recursive: true);
      }
    },
  );
}
