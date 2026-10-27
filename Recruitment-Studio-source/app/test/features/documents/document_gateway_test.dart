import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/features/documents/document_gateway.dart';

final class FakeDocumentChannel implements DocumentChannel {
  int writeCalls = 0;
  @override
  Future<Map<String, Object?>> invoke(
    String method,
    Map<String, Object?> args,
  ) async {
    if (method == 'writePrepared') writeCalls++;
    return {'status': 'cancelled'};
  }
}

void main() {
  test('cancelled native picker never confirms or writes a document', () async {
    final channel = FakeDocumentChannel();
    final gateway = AndroidDocumentGateway(channel);
    final destination = await gateway.prepareSave(['test.png'], 'image/png');
    expect(destination, isNull);
    expect(channel.writeCalls, 0);
  });
}
