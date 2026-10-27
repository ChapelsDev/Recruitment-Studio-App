import 'dart:io';

/// Per-run TMPDIR wins; Windows TEMP/TMP are also honored. Otherwise defer to
/// the SDK's platform temporary root. Selector injection models missing/Windows
/// inputs without changing global environment or creating files there.
String operationTestRoot({
  Map<String, String>? environment,
  String Function()? platformTemporaryRoot,
}) {
  final values = environment ?? Platform.environment;
  for (final key in ['TMPDIR', 'TEMP', 'TMP']) {
    final root = values[key];
    if (root != null && root.isNotEmpty) return root;
  }
  return (platformTemporaryRoot ?? () => Directory.systemTemp.path)();
}

Future<Directory> createOperationTestDirectory() =>
    Directory(operationTestRoot()).createTemp('T01-operation-');

/// Only the named eligible owned file fails; every successful call really
/// deletes through the SDK. This is a portable IO-error witness, NOT evidence
/// of native permission denial. Production ownership guards run before it.
final class DeletionErrorWitness {
  DeletionErrorWitness(this.deniedPath);
  final String deniedPath;
  final List<String> visited = [];
  Future<void> delete(File file) async {
    visited.add(file.absolute.path);
    if (file.absolute.path == deniedPath) {
      throw const FileSystemException('specific portable deletion witness');
    }
    await file.delete();
  }
}
