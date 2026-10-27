import 'dart:io';

import 'package:flutter/services.dart';
import 'package:path_provider/path_provider.dart';

import '../features/documents/document_gateway.dart';
import '../shared/work_budget.dart';
import '../shared/work_limits.dart';

/// Persistent private roots, never template filenames or user document paths.
/// Android's small separate channel returns Context.filesDir only; the accepted
/// documents protocol and capability issuance remain byte-identical.
abstract final class NativeProductBootstrap {
  static const _channel = MethodChannel('local.recruitment/private_runtime');
  static Future<Directory> privateRoot({TargetPlatform? platform}) async {
    final target =
        platform ??
        (Platform.isAndroid
            ? TargetPlatform.android
            : Platform.isWindows
            ? TargetPlatform.windows
            : TargetPlatform.linux);
    final String path;
    switch (target) {
      case TargetPlatform.android:
        final value = await _channel.invokeMethod<String>('privateRoot');
        if (value == null ||
            value.isEmpty ||
            value.length > WorkLimits.stagingPathUnits - 20 ||
            value.contains('\u0000') ||
            !Directory(value).isAbsolute) {
          throw StateError('Private Android root unavailable');
        }
        path = value;
      case TargetPlatform.windows:
        path = (await getApplicationSupportDirectory()).path;
      default:
        // No Linux native document picker or nominal unconfigured service flow.
        throw UnsupportedError('Windows or Android native runtime required');
    }
    return Directory('$path/recruitment-studio');
  }

  static DocumentGateway gateway(
    Directory staging,
    WorkBudgetController budget,
  ) {
    if (Platform.isWindows) {
      return WindowsDocumentGateway(stagingDirectory: staging, budget: budget);
    }
    if (Platform.isAndroid) {
      return AndroidDocumentGateway(
        const MethodDocumentChannel(),
        stagingDirectory: staging,
        budget: budget,
      );
    }
    throw UnsupportedError(
      'Native document picker unavailable on this platform',
    );
  }
}
