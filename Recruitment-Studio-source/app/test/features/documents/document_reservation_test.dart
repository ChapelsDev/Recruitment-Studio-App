import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/features/documents/document_gateway.dart';
import 'package:recruitment_studio/shared/operation.dart';

final class UnreadableReservation implements DocumentChannel {
  @override
  Future<Map<String, Object?>> invoke(
    String method,
    Map<String, Object?> args,
  ) async {
    if (method == 'prepareSave') {
      return {
        'status': 'prepared',
        'operationId': args['operationId'],
        'opaqueId': 'reserved',
        'displayName': 'a.png',
        'canReadBack': false,
        'ownsReservedPlaceholder': true,
      };
    }
    if (method == 'releaseOperation') {
      return {'status': 'released', 'residualPlaceholder': true};
    }
    throw StateError('Unexpected $method');
  }
}

void main() {
  test('refused reservation reports residual when provider cannot delete owned placeholder', () async {
    final op = Operation.create();
    final gateway = AndroidDocumentGateway(UnreadableReservation());
    try {
      await expectLater(
        gateway.prepareSave(['a.png'], 'image/png', operation: op),
        throwsA(
          isA<DocumentGatewayException>().having(
            (e) => e.residualPlaceholder,
            'honest residual',
            true,
          ),
        ),
      );
    } finally {
      await gateway.close();
      await op.finish();
    }
  });
}
