import '../features/composition/export_format.dart';
import '../features/projects/project_values.dart';

enum ProblemCode {
  missingPhoto,
  missingHeadline,
  missingContact,
  incompleteSection,
  textOverflow,
  unsupportedGlyph,
  invalidResource,
  insufficientResolution,
  lowContrast,
  incompatibleProject,
  unsafePackage,
  capacityExceeded,
  permissionDenied,
  noSpace,
  ioFailure,
  operationCancelled,
  invalidSelection,
}

enum ProblemSeverity { info, warning, error }

final class Problem {
  const Problem({
    required this.code,
    required this.severity,
    this.locale,
    this.format,
    this.sectionId,
    this.field,
    this.actionLabel = '',
  });
  final ProblemCode code;
  final ProblemSeverity severity;
  final AppLocale? locale;
  final ExportFormat? format;
  final String? sectionId;
  final String? field;
  final String actionLabel;
}

final class CapacityExceeded implements Exception {
  const CapacityExceeded();
  Problem get problem => const Problem(
    code: ProblemCode.capacityExceeded,
    severity: ProblemSeverity.error,
  );
  @override
  String toString() => 'Capacity exceeded';
}
