import '../composition/export_format.dart';
import '../projects/project.dart';

abstract final class ExportName {
  static String stem(String input) {
    const groups = {
      'a': 'àáâãäåÀÁÂÃÄÅ',
      'e': 'èéêëÈÉÊË',
      'i': 'ìíîïÌÍÎÏ',
      'o': 'òóôõöÒÓÔÕÖ',
      'u': 'ùúûüÙÚÛÜ',
      'c': 'çÇ',
      'n': 'ñÑ',
    };
    final out = StringBuffer();
    for (final rune in input.runes.take(160)) {
      final char = String.fromCharCode(rune);
      String? mapped;
      for (final entry in groups.entries) {
        if (entry.value.contains(char)) {
          mapped = char == char.toUpperCase()
              ? entry.key.toUpperCase()
              : entry.key;
          break;
        }
      }
      out.write(
        mapped ?? (RegExp(r'[A-Za-z0-9_-]').hasMatch(char) ? char : '-'),
      );
    }
    var value = out
        .toString()
        .replaceAll(RegExp('-+'), '-')
        .replaceAll(RegExp(r'^[-_]+|[-_]+$'), '');
    if (value.isEmpty) value = 'projeto';
    if (RegExp(
      r'^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$',
      caseSensitive: false,
    ).hasMatch(value)) {
      value = '_$value';
    }
    return value;
  }

  static String forVariant(
    String projectName,
    AppLocale locale,
    ExportFormat format,
    ImageEncoding encoding,
  ) =>
      '${stem(projectName)}-${locale.code}-${format.width}x${format.height}.${encoding.name}';
  static String forZip(String projectName) =>
      '${stem(projectName)}-imagens.zip';
  static String forProject(String projectName) =>
      '${stem(projectName)}.recruitproj';
}
