import 'dart:io';

import 'package:recruitment_studio/shared/operation.dart';
import 'package:recruitment_studio/shared/problem.dart';

import '../test/support/operation_io_witness.dart';

// Explicit supplement: dart run tool/operation_posix_witness.dart
// Genuine unprivileged POSIX directory permission denial, NOT Windows evidence.
// Exit77/NOT_RUN if platform or permission capability is unavailable.
Future<void> main() async {
  if (!Platform.isLinux && !Platform.isMacOS) {
    stdout.writeln('NOT_RUN: POSIX platform required');
    exitCode = 77;
    return;
  }
  final root = await createOperationTestDirectory();
  final locked = await Directory('${root.path}/locked').create();
  Future<void> mode(String value) async {
    final result = await Process.run(
      'chmod',
      [value, locked.path],
      environment: {'PATH': '/usr/local/bin:/usr/bin:/bin', 'LANG': 'C.UTF-8'},
      includeParentEnvironment: false,
    );
    if (result.exitCode != 0) {
      throw StateError('Permission capability unavailable');
    }
  }

  try {
    final denied = await File('${locked.path}/denied').writeAsString('staging');
    final allowed = await File('${root.path}/allowed').writeAsString('staging');
    final control = await File('${locked.path}/control')
        .writeAsString('control');
    final input = await File('${root.path}/input').writeAsString('original');
    final op =
        Operation.create(); // Default real SDK deleter, no injected seam.
    op.ownStaging(denied);
    op.ownStaging(allowed);
    await mode('500');
    var permissionDenied = false;
    try {
      await control.delete();
    } on FileSystemException catch (e) {
      permissionDenied = e.osError?.errorCode == 13; // EACCES on POSIX.
    }
    if (!permissionDenied) {
      stdout.writeln('NOT_RUN: unprivileged EACCES capability unavailable');
      exitCode = 77;
      return;
    }
    var ioFailure = false;
    try {
      await op.finish();
    } on OperationException catch (e) {
      ioFailure = e.problem.code == ProblemCode.ioFailure;
    }
    if (!ioFailure ||
        !await denied.exists() ||
        await allowed.exists() ||
        await input.readAsString() != 'original') {
      throw StateError('Real permission-denial cleanup contract failed');
    }
    stdout.writeln(
      'PASS: 1 explicit POSIX supplement; actual EACCES, safe ioFailure, other owned file deleted, foreign input preserved',
    );
  } finally {
    await mode('700');
    await root.delete(recursive: true);
  }
}
