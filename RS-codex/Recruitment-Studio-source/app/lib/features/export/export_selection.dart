import '../composition/export_format.dart';
import '../projects/project.dart';
import '../../shared/work_limits.dart';
import '../../shared/problem.dart';

final class ExportSelection {
  ExportSelection({
    required Iterable<AppLocale> locales,
    required Iterable<ExportFormat> formats,
    required this.encoding,
    this.bundleAsZip = false,
    this.invalidOmissionsApproved = false,
    this.destinationApproved = false,
  }) : locales = _bounded(locales, AppLocale.values.length),
       formats = _bounded(formats, ExportFormat.values.length);
  static List<T> _bounded<T>(Iterable<T> values, int cap) {
    final out = <T>[];
    for (final value in values) {
      if (out.length == cap) throw const CapacityExceeded();
      out.add(value);
    }
    return List.unmodifiable(out);
  }

  final List<AppLocale> locales;
  final List<ExportFormat> formats;
  final ImageEncoding encoding;
  final bool bundleAsZip, invalidOmissionsApproved, destinationApproved;
  bool get structurallyValid =>
      locales.isNotEmpty &&
      formats.isNotEmpty &&
      locales.toSet().length == locales.length &&
      formats.toSet().length == formats.length &&
      locales.length * formats.length <= WorkLimits.exportImages;
  ExportSelection approve({bool omissions = false, bool destination = false}) =>
      ExportSelection(
        locales: locales,
        formats: formats,
        encoding: encoding,
        bundleAsZip: bundleAsZip,
        invalidOmissionsApproved: omissions,
        destinationApproved: destination,
      );
  String get mimeType => bundleAsZip
      ? 'application/zip'
      : encoding == ImageEncoding.png
      ? 'image/png'
      : 'image/jpeg';
}
