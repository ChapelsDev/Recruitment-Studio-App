import 'dart:io';

/// Injectable filesystem frontiers; default uses actual private host/native IO.
/// Tests may hold/reject retirement without replacing encoded bytes or identity.
class PrivateFileIo {
  const PrivateFileIo();
  Future<RandomAccessFile> open(File file, {FileMode mode = FileMode.read}) =>
      file.open(mode: mode);
  Future<void> close(RandomAccessFile handle) => handle.close();
  Future<void> deleteFile(File file) => file.delete();
  Future<void> deleteDirectory(Directory directory) => directory.delete();
}
