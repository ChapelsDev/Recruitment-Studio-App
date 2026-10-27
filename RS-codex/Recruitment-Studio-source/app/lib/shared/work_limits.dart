/// Initial engineering guardrails. Unmeasured; T13 calibrates native capacity.
/// Owned buffers are accounted bytes, not a bound on process RSS.
abstract final class WorkLimits {
  static const int photoBytes = 25 * 1024 * 1024;
  static const int photoPixels = 12000000;
  static const int logoBytes = 8 * 1024 * 1024;
  static const int logoPixels = 4000000;
  static const int thumbnailBytes = 1024 * 1024;
  static const int thumbnailSide = 512;
  static const int projectCompressedBytes = 64 * 1024 * 1024;
  static const int projectExpandedBytes = 64 * 1024 * 1024;
  static const int packageEntries = 16;
  static const int manifestUtf8Bytes = 512 * 1024;
  static const int manifestDepth = 32;
  static const int sections = 12;
  static const int itemsPerSection = 8;
  static const int contacts = 8;
  static const int fieldUtf16Units = 16000;
  static const int ownedBufferBytes = 256 * 1024 * 1024;
  // Initial bounded admission queue; cancelled/finished waiters are removed.
  static const int heavyWaiters = 64;
  static const int ordinaryAdmissionBytes = 16 * 1024 * 1024;
  static const int admissionTickets = 8192;
  static const int liveOperations = 256;
  static const int pendingCompletions = 64;
  static const int idleCallbacks = 128;
  static const int drainFinalizers = 128;
  static const int stopListeners = 128;
  static const int stagingFiles = 64;
  static const int stagingPathUnits = 4096;
  static const int reservations = 256;
  static const int operationReservations = 128;
  static const int workers = 1;
  static const int retainedMedia = 32;
  static const int capturedSnapshots = 64;
  static const int preparationFrames = 64;
  static const int removalImpacts = 128;
  static const int parserNodes = 8192;
  static const int parserMembers = 1024;
  // Every PNG chunk occupies at least 12 encoded bytes. Inspection keeps only
  // scalar state and the decoder coalesces IDAT in two passes, so no retained
  // chunk-descriptor population justifies rejecting valid empty fragmentation.
  static const int pngChunks = photoBytes ~/ 12;
  static const int exifPending = 64;
  static const Duration decodeTimeout = Duration(seconds: 15);
  static const int undoSnapshots = 20;
  static const int undoBytes = 96 * 1024 * 1024;
  static const int exportImages = 21;
  static const int exportImageBytes = 16 * 1024 * 1024;
  static const int exportStagingBytes = 512 * 1024 * 1024;
  static const int jpgQuality = 95;
  static const List<int> bodyPxChoices = [26, 30, 34];
  static const int minimumBodyPx = 26;
  static const Duration draftIdle = Duration(seconds: 2);
  static const Duration draftCheckpoint = Duration(seconds: 10);
  // Initial finite positive scale rails, not measured composition quality.
  static const double minimumLogoScale = 0.1;
  static const double maximumLogoScale = 4;
}
