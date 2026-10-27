part of 'project.dart';

/// Lossless bounded JSON reader: duplicates are checked on decoded keys before
/// a map insertion, and UTF-8/UTF-16 must encode Unicode scalar values exactly.
abstract final class StrictManifestJson {
  static const _workspaceBytes = 8 * 1024 * 1024;

  /// Public graph tier: every returned nested collection stays paid, even when
  /// the outer map or caller frame dies. Borrowed workspace is not graph credit.
  static Map<String, Object?> parse(Uint8List bytes, {AdmissionTicket? admission}) {
    _checkBytes(bytes);
    _checkAdmission(admission);
    final ordinary = admission == null
        ? AdmissionBudget.shared.reserve(_workspaceBytes) : null;
    try {
      final reader = _Reader(utf8.decode(bytes, allowMalformed: false));
      final value = _parseOwned(reader);
      final graph = AdmissionBudget.shared.reserve(
          4096 + 256 * reader.nodes + 4 * reader.stringUnits);
      try { graph.retainGraph(value); }
      catch (_) { graph.release(); rethrow; }
      return value;
    } finally { ordinary?.release(); }
  }

  /// Concrete ignored-parse consumer, not a callback that can expose aliases.
  static void validate(Uint8List bytes, {AdmissionTicket? admission}) {
    _checkBytes(bytes);
    _checkAdmission(admission);
    final ordinary = admission == null
        ? AdmissionBudget.shared.reserve(_workspaceBytes) : null;
    try {
      _parseOwned(_Reader(utf8.decode(bytes, allowMalformed: false)));
    } finally { ordinary?.release(); }
  }

  /// Raw JSON and all transient collections stay private to this synchronous
  /// producer. Only independently paid immutable domain values leave the scope.
  static ({ImmutableProject project, AssetRef? thumbnail}) readProject(Uint8List bytes) {
    _checkBytes(bytes);
    final ordinary = AdmissionBudget.shared.reserve(_workspaceBytes);
    try {
      return _domainBirth((birth) {
        final manifest = _parseOwned(_Reader(utf8.decode(bytes, allowMalformed: false)));
        if (manifest['schemaVersion'] != 1 ||
            manifest['modelVersion'] != 'editorial-b-v1') {
          throw const PackageFailure('unsupported schema or model version');
        }
        final thumbnailValue = manifest.remove('thumbnailRef');
        final thumbnail = thumbnailValue == null ? null : birth.own(_thumbnail(thumbnailValue));
        // Only our concrete parser's private graph reaches this route. The
        // still-held 8MiB workspace pays decode, graph, scan and typed capture;
        // every new escaped DTO receives independent domain payment.
        final project = _readProjectCaptured(manifest, birth);
        return (project: project, thumbnail: thumbnail);
      });
    } finally { ordinary.release(); }
  }

  static void _checkAdmission(AdmissionTicket? admission) {
    if (admission != null && (!admission.isActive ||
        !admission.isApplicationCredit || admission.bytes < _workspaceBytes)) {
      throw const CapacityExceeded();
    }
  }

  static void _checkBytes(Uint8List bytes) {
    if (bytes.length > WorkLimits.manifestUtf8Bytes) {
      throw const CapacityExceeded();
    }
    if (bytes.length >= 3 && bytes[0] == 0xef && bytes[1] == 0xbb && bytes[2] == 0xbf) {
      throw const FormatException('Manifest BOM forbidden');
    }
  }

  static Map<String, Object?> _parseOwned(_Reader reader) {
    final value = reader.value(1);
    reader.space();
    if (reader.position != reader.text.length || value is! Map<String, Object?>) {
      throw const FormatException('Invalid manifest JSON');
    }
    return value;
  }

  static AssetRef _thumbnail(Object value) {
    if (value is! Map<String, Object?> ||
        value.length != 6 ||
        !value.keys.toSet().containsAll([
          'id',
          'kind',
          'mediaType',
          'width',
          'height',
          'sha256',
        ]) ||
        value['kind'] != 'thumbnail' ||
        value['mediaType'] != 'png' ||
        value['id'] is! String ||
        value['width'] is! int ||
        value['height'] is! int ||
        value['sha256'] is! String) {
      throw const FormatException('Invalid thumbnail reference');
    }
    return AssetRef(
      id: value['id'] as String,
      kind: AssetKind.thumbnail,
      mediaType: MediaType.png,
      width: value['width'] as int,
      height: value['height'] as int,
      sha256: value['sha256'] as String,
    );
  }
}

final class _Reader {
  _Reader(this.text);
  final String text;
  int position = 0;
  int nodes = 0, stringUnits = 0;
  static final number = RegExp(
    r'-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?',
  );
  Never bad() => throw const FormatException('Invalid manifest JSON');
  void space() {
    while (position < text.length &&
        [32, 9, 10, 13].contains(text.codeUnitAt(position))) {
      position++;
    }
  }

  bool take(String c) {
    space();
    if (position < text.length && text[position] == c) {
      position++;
      return true;
    }
    return false;
  }

  Object? value(int depth) {
    space();
    if (depth > WorkLimits.manifestDepth || ++nodes > WorkLimits.parserNodes) {
      throw const CapacityExceeded();
    }
    if (position == text.length) {
      bad();
    }
    if (take('{')) {
      final map = <String, Object?>{};
      if (take('}')) {
        return map;
      }
      do {
        if (map.length >= WorkLimits.parserMembers) {
          throw const CapacityExceeded();
        }
        space();
        if (++nodes > WorkLimits.parserNodes) { throw const CapacityExceeded(); }
        final key = string();
        if (map.containsKey(key) || !take(':')) {
          bad();
        }
        map[key] = value(depth + 1);
        if (take('}')) {
          return map;
        }
      } while (take(','));
      bad();
    }
    if (take('[')) {
      final list = <Object?>[];
      if (take(']')) {
        return list;
      }
      do {
        if (list.length >= WorkLimits.parserMembers) {
          throw const CapacityExceeded();
        }
        list.add(value(depth + 1));
        if (take(']')) {
          return list;
        }
      } while (take(','));
      bad();
    }
    if (text[position] == '"') {
      return string();
    }
    for (final entry in {'true': true, 'false': false, 'null': null}.entries) {
      if (text.startsWith(entry.key, position)) {
        position += entry.key.length;
        return entry.value;
      }
    }
    final match = number.matchAsPrefix(text, position);
    if (match == null) {
      bad();
    }
    position = match.end;
    final n = jsonDecode(match.group(0)!);
    if (n is! num || !n.isFinite) {
      bad();
    }
    return n;
  }

  String string() {
    if (position >= text.length || text[position++] != '"') {
      bad();
    }
    final start = position - 1;
    var escaped = false;
    while (position < text.length) {
      final c = text.codeUnitAt(position++);
      if (!escaped && c == 34) {
        final value = jsonDecode(text.substring(start, position)) as String;
        if (value.length > WorkLimits.fieldUtf16Units) {
          throw const CapacityExceeded();
        }
        for (var i = 0; i < value.length; i++) {
          final u = value.codeUnitAt(i);
          if (u >= 0xd800 && u <= 0xdbff) {
            if (++i == value.length ||
                value.codeUnitAt(i) < 0xdc00 ||
                value.codeUnitAt(i) > 0xdfff) {
              bad();
            }
          } else if (u >= 0xdc00 && u <= 0xdfff) {
            bad();
          }
        }
        stringUnits += value.length;
        return value;
      }
      if (c < 32) {
        bad();
      }
      escaped = !escaped && c == 92;
    }
    return bad();
  }
}
