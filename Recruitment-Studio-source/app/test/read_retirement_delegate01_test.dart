import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/features/documents/document_gateway.dart';
import 'package:recruitment_studio/shared/operation.dart';
import 'package:recruitment_studio/shared/problem.dart';
import 'package:recruitment_studio/shared/work_budget.dart';

import 'correction01_shutdown_test.dart' show CloseFaultGateway;
import 'features/documents/windows_document_gateway_test.dart'
    show HostIo, HostPicker;

class BoundReadGateway extends CloseFaultGateway
    implements OpenCapabilityRetirementDelegate {
  BoundReadGateway(super.real, this.delegate);
  final DocumentGateway delegate;
  int resolutions = 0;
  @override
  DocumentGateway get openCapabilityDelegate {
    resolutions++;
    return delegate;
  }

  @override
  Future<void> close() => real.close();
}

class ThrowingReadGateway extends BoundReadGateway {
  ThrowingReadGateway(super.real, super.delegate);
  @override
  DocumentGateway get openCapabilityDelegate {
    resolutions++;
    throw const FileSystemException(
      'synthetic-private-marker',
      '/private/never-emit',
    );
  }
}

class CyclicReadGateway extends BoundReadGateway {
  CyclicReadGateway(super.real, super.delegate);
  @override
  DocumentGateway get openCapabilityDelegate {
    resolutions++;
    return this;
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  for (final scenario in [
    'valid',
    'foreign-gateway',
    'foreign-root',
    'nested',
    'getter-error',
  ]) {
    test(
      'RDG $scenario authenticates actual native receiver once without weakening identity',
      () async {
        final root = await Directory.systemTemp.createTemp('rdg-');
        final source = File('${root.path}/input.bin');
        await source.writeAsBytes([1, 2, 3, 4], flush: true);
        final domain = WorkBudgetController();
        final real = WindowsDocumentGateway(
          picker: HostPicker(source.path),
          io: HostIo(),
          stagingDirectory: root,
          budget: domain,
        );
        final foreign = WindowsDocumentGateway(
          picker: HostPicker(source.path),
          io: HostIo(),
          stagingDirectory: root,
          budget: domain,
        );
        final request = WorkOperation.create(), wrong = WorkOperation.create();
        late final BoundReadGateway wrapper;
        if (scenario == 'getter-error') {
          wrapper = ThrowingReadGateway(real, real);
        } else if (scenario == 'nested') {
          wrapper = CyclicReadGateway(real, real);
        } else {
          wrapper = BoundReadGateway(
            real,
            scenario == 'foreign-gateway' ? foreign : real,
          );
        }
        try {
          final ref = (await wrapper.pickOpen({
            'application/octet-stream',
          }, operation: request))!;
          final stage = await wrapper.stageRead(ref, 1024, operation: request);
          if (scenario == 'valid') {
            await wrapper.retireOpen(ref, operation: request);
            await Future<void>.delayed(Duration.zero);
            var idle = false;
            request.afterPending(() => idle = true);
            expect(idle, isTrue);
            expect(request.isFinishing, isFalse);
            await expectLater(
              real.retireOpen(ref, operation: request),
              throwsA(isA<DocumentGatewayException>()),
            );
          } else {
            Object? error;
            try {
              await wrapper.retireOpen(
                ref,
                operation: scenario == 'foreign-root' ? wrong : request,
              );
            } catch (caught) {
              error = caught;
            }
            expect(error, isA<DocumentGatewayException>());
            expect(
              (error as DocumentGatewayException).problem.code,
              scenario == 'getter-error'
                  ? ProblemCode.ioFailure
                  : ProblemCode.invalidSelection,
            );
            expect(
              error.toString(),
              isNot(contains('synthetic-private-marker')),
            );
            expect(error.toString(), isNot(contains('/private/never-emit')));
            // Refusal cannot consume the real identity; authentic owner can still retire it.
            await real.retireOpen(ref, operation: request);
          }
          expect(wrapper.resolutions, 1);
          expect(await source.readAsBytes(), [1, 2, 3, 4]);
          expect(await stage.readAsBytes(), [1, 2, 3, 4]);
        } finally {
          await real.close();
          await foreign.close();
          await request.finish();
          await wrong.finish();
          await root.delete(recursive: true);
        }
      },
    );
  }
}
