import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/features/documents/document_gateway.dart';
import 'package:recruitment_studio/features/editor/editor_session.dart';
import 'package:recruitment_studio/features/editor/preview_owner.dart';
import 'package:recruitment_studio/runtime/product_runtime.dart';
import 'package:recruitment_studio/shared/admission_budget.dart';

import 'features/documents/android_document_gateway_test.dart'
    show MemoryDocuments;
import 'support/project_fixtures.dart';

class IdleLogoReleaseFailure implements DocumentChannel {
  IdleLogoReleaseFailure(this.bytes);
  final Uint8List bytes;
  final native = MemoryDocuments();
  bool fail = true, targetLive = true;
  final roots = <String>[];
  @override
  Future<Map<String, Object?>> invoke(
    String method,
    Map<String, Object?> args,
  ) async {
    roots.add(args['operationId'] as String);
    if (method == 'readChunk') {
      native.methods.add(method);
      final offset = args['offset'] as int;
      final end = (offset + (args['length'] as int)).clamp(0, bytes.length);
      return {
        'status': 'ready',
        'bytes': Uint8List.sublistView(bytes, offset, end),
      };
    }
    if (method == 'abortPrepared' && fail) {
      native.methods.add(method);
      return {
        'status': 'failed',
        'problem': 'ioFailure',
        'residualPlaceholder': true,
      };
    }
    if (method == 'abortWrite' && args['releaseTarget'] == true) {
      targetLive = false;
    }
    return native.invoke(method, args);
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test('J05 idle logo finish failure clears terminal request and restores actual preview', () async {
    final root = await Directory.systemTemp.createTemp('joint-logo-idle-');
    final provider = IdleLogoReleaseFailure(
      await File('test/fixtures/assets/logo.png').readAsBytes(),
    );
    final runtime = await ProductRuntime.open(
      root,
      (stage, budget) => AndroidDocumentGateway(
        provider,
        stagingDirectory: stage,
        budget: budget,
      ),
    );
    await runtime.adoptSession(
      EditorSession.fromBundle(await fixtureBundle(), budget: runtime.budget),
    );
    runtime.host!.preview.setPaused(true);
    await runtime.host!.preview.processingSettled;
    await runtime.scheduler!.checkpoint();
    final importing = runtime.importProfileLogo();
    try {
      await importing.timeout(const Duration(seconds: 10));
      expect(
        runtime.profile.draft.logo,
        isNotNull,
        reason: 'Real image import/adoption has finished',
      );
      expect(runtime.message, contains('Operação'));
      expect(
        runtime.canCancel,
        isFalse,
        reason: 'A rejected terminal root is not active work',
      );
      await runtime.host!.preview.processingSettled;
      expect(
        runtime.host!.preview.status,
        PreviewStatus.ready,
        reason: 'Independent live preview must resume after the real finalization failure',
      );
      expect(provider.targetLive, isTrue);
      expect(provider.roots.toSet().length, 1);
      expect(AdmissionBudget.shared.reservedBytes, greaterThanOrEqualTo(32768));
    } finally {
      provider.fail = false;
      await importing.timeout(const Duration(seconds: 10));
      await runtime.close().timeout(const Duration(seconds: 10));
      runtime.dispose();
      await root.delete(recursive: true);
    }
  });
}
