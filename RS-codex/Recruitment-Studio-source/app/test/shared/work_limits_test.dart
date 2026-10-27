import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/shared/work_limits.dart';
import 'package:recruitment_studio/shared/problem.dart';
import 'package:recruitment_studio/features/composition/export_format.dart';
import 'package:recruitment_studio/features/projects/project.dart';

void main() {
  test('engineering limits retain exact owner units and unmeasured caps', () {
    expect(WorkLimits.photoBytes, 25 * 1024 * 1024);
    expect(WorkLimits.photoPixels, 12000000);
    expect(WorkLimits.logoBytes, 8 * 1024 * 1024);
    expect(WorkLimits.logoPixels, 4000000);
    expect(WorkLimits.thumbnailBytes, 1024 * 1024);
    expect(WorkLimits.thumbnailSide, 512);
    expect(WorkLimits.projectCompressedBytes, 64 * 1024 * 1024);
    expect(WorkLimits.projectExpandedBytes, 64 * 1024 * 1024);
    expect(WorkLimits.packageEntries, 16);
    expect(WorkLimits.manifestUtf8Bytes, 512 * 1024);
    expect(WorkLimits.manifestDepth, 32);
    expect(WorkLimits.sections, 12);
    expect(WorkLimits.itemsPerSection, 8);
    expect(WorkLimits.contacts, 8);
    expect(WorkLimits.fieldUtf16Units, 16000);
    expect(WorkLimits.ownedBufferBytes, 256 * 1024 * 1024);
    expect(WorkLimits.decodeTimeout, const Duration(seconds: 15));
    expect(WorkLimits.undoSnapshots, 20);
    expect(WorkLimits.undoBytes, 96 * 1024 * 1024);
    expect(WorkLimits.exportImages, 21);
    expect(WorkLimits.exportImageBytes, 16 * 1024 * 1024);
    expect(WorkLimits.exportStagingBytes, 512 * 1024 * 1024);
    expect(WorkLimits.jpgQuality, 95);
    expect(WorkLimits.bodyPxChoices, [26, 30, 34]);
    expect(WorkLimits.minimumBodyPx, 26);
    expect(WorkLimits.draftIdle, const Duration(seconds: 2));
    expect(WorkLimits.draftCheckpoint, const Duration(seconds: 10));
  });
  test('formats and enum DTOs expose exact values without widgets', () {
    expect(ExportFormat.values.map((f) => [f.width, f.height]), [
      [1080, 1080],
      [1080, 1350],
      [1080, 1920],
    ]);
    expect(ImageEncoding.values.map((e) => e.name), ['png', 'jpg']);
    expect(ProblemCode.values.map((c) => c.name), [
      'missingPhoto',
      'missingHeadline',
      'missingContact',
      'incompleteSection',
      'textOverflow',
      'unsupportedGlyph',
      'invalidResource',
      'insufficientResolution',
      'lowContrast',
      'incompatibleProject',
      'unsafePackage',
      'capacityExceeded',
      'permissionDenied',
      'noSpace',
      'ioFailure',
      'operationCancelled',
      'invalidSelection',
    ]);
    final p = Problem(
      code: ProblemCode.invalidSelection,
      severity: ProblemSeverity.error,
      locale: AppLocale.fr,
      format: ExportFormat.story,
      sectionId: 's1',
      field: 'headline',
      actionLabel: 'Edit',
    );
    expect(p.code, ProblemCode.invalidSelection);
    expect(p.severity, ProblemSeverity.error);
    expect(p.locale, AppLocale.fr);
    expect(p.format, ExportFormat.story);
    expect(p.sectionId, 's1');
    expect(p.field, 'headline');
    expect(p.actionLabel, 'Edit');
    expect(const CapacityExceeded().problem.code, ProblemCode.capacityExceeded);
    expect(const CapacityExceeded().toString(), 'Capacity exceeded');
  });
}
