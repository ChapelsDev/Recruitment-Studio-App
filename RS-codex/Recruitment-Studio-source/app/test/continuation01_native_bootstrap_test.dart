import 'dart:io';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/runtime/native_bootstrap.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test('C05 Android private root boundary and actual main construct the functional production runtime', () async {
    final root = await Directory.systemTemp.createTemp('c05-native-boundary-');
    const channel = MethodChannel('local.recruitment/private_runtime');
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (call) async {
          expect(call.method, 'privateRoot');
          expect(call.arguments, isNull);
          return root.path;
        });
    try {
      final actual = await NativeProductBootstrap.privateRoot(
        platform: TargetPlatform.android,
      );
      expect(actual.path, '${root.path}/recruitment-studio');
      final main = await File('lib/main.dart').readAsString();
      expect(main, contains('buildFunctionalApplication()'));
      expect(main, contains('WidgetsFlutterBinding.ensureInitialized()'));
      final registration = await File(
        'android/app/src/main/kotlin/local/recruitment/recruitment_studio/MainActivity.kt',
      ).readAsString();
      expect(registration, contains('PrivateRootBridge.register'));
      final bridge = await File(
        'android/app/src/main/kotlin/local/recruitment/recruitment_studio/bootstrap/PrivateRootBridge.kt',
      ).readAsString();
      expect(bridge, contains('context.filesDir'));
      expect(bridge, contains('local.recruitment/private_runtime'));
    } finally {
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(channel, null);
      await root.delete(recursive: true);
    }
  });
}
