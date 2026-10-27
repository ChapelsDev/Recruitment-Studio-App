part of 'project.dart';

Map<String, Object?>? _refManifest(AssetRef? ref) => ref == null
    ? null
    : {
        'id': ref.id,
        'kind': ref.kind.name,
        'mediaType': ref.mediaType.name,
        'width': ref.width,
        'height': ref.height,
        'sha256': ref.sha256,
      };
AdmissionTicket _manifestTicket(ImmutableProject p, {bool sharesDomainText = false}) {
  var slots = 128, units = p.id.length + p.name.length;
  void text(String value) {
    validateText(value);
    if (value.length > WorkLimits.manifestUtf8Bytes - units) {
      throw const CapacityExceeded();
    }
    units += value.length; slots++;
  }
  if (p.localeOrder.length > AppLocale.values.length ||
      p.sections.length > WorkLimits.sections || p.contactIds.length > WorkLimits.contacts) {
    throw const CapacityExceeded();
  }
  for (final id in p.contactIds) { text(id); }
  for (final locale in p.localeOrder) {
    final edition = p.edition(locale);
    text(edition.headline); text(edition.location);
    slots += 16 + 2 * edition.contacts.length;
    for (final value in edition.contacts.values) { text(value); }
  }
  for (final section in p.sections) {
    if (section.items.length > WorkLimits.itemsPerSection) { throw const CapacityExceeded(); }
    text(section.id); slots += 16 + 4 * p.localeOrder.length;
    for (final locale in p.localeOrder) { text(section.title(locale)); }
    for (final item in section.items) {
      text(item.id); slots += 8 + 4 * p.localeOrder.length;
      for (final locale in p.localeOrder) { text(item.text(locale)); }
    }
  }
  return AdmissionBudget.shared.reserve(4096 + 512 * slots +
      (sharesDomainText ? 0 : 4 * units));
}

Map<String, Object?> _manifest(ImmutableProject p) {
  // This graph copies containers but borrows the exact immutable Strings whose
  // unchanged domain birth ticket already pays their complete bounded content.
  // Root/header aliases extend the project payment; each text-bearing child
  // collection keeps its specific paid immutable DTO alive via private custody.
  final ticket = _manifestTicket(p, sharesDomainText: true);
  try {
    final graph = _manifestOwned(p, retainBackings: true);
    _manifestNode(graph, p._header, true);
    _manifestNode(graph['contactIds'] as List, p._header, true);
    ticket.retainGraph(graph);
    return graph;
  } catch (_) { ticket.release(); rethrow; }
}

// Only the final captured domain reaches this concrete encoder. Private graph
// containers never escape and no supplied callback can retain them. The 8 MiB
// workspace conservatively pays bounded JSON String/scratch, independently of
// the borrowed domain text and the separately admitted copied containers.
String _manifestJson(ImmutableProject p) {
  final workspace = AdmissionBudget.shared.reserve(8 * 1024 * 1024);
  AdmissionTicket? graphTicket;
  try {
    graphTicket = _manifestTicket(p, sharesDomainText: true);
    // Checked at immutable birth using legacy literal UTF-16 JSON semantics.
    // Do not use strict manifestBytes: external Unicode guards stay unchanged.
    if (p._manifestByteLength > WorkLimits.manifestUtf8Bytes) {
      throw const CapacityExceeded();
    }
    return jsonEncode(_manifestOwned(p));
  } finally {
    // Last private graph use precedes transfer of the raw String to the caller.
    try { graphTicket?.release(); } finally { workspace.release(); }
  }
}

// Concrete consumers only: no callback can stash a supposedly private graph.
void _validateProjectManifest(ImmutableProject p) {
  p._manifestByteLength = _measureProject(p);
}

Uint8List _manifestBytes(ImmutableProject p, AdmissionTicket workspace,
    WorkBudgetController? budget, WorkReservation? prepaidBuffers) {
  if (!workspace.isActive || !workspace.isApplicationCredit ||
      workspace.bytes < 8 * 1024 * 1024) {
    throw const CapacityExceeded();
  }
  final ticket = _manifestTicket(p, sharesDomainText: true);
  WorkCopyReservation? copying;
  try {
    final controller = budget ?? WorkBudget.shared() as WorkBudgetController;
    if (prepaidBuffers == null) {
      copying = controller.reserveCopy(2 * WorkLimits.manifestUtf8Bytes);
    } else if (!prepaidBuffers.coversBufferWorkspace(controller,
        2 * WorkLimits.manifestUtf8Bytes)) {
      throw StateError('Invalid manifest buffer prepayment');
    }
    _measureProject(p, strictUnicode: true);
    final graph = _manifestOwned(p);
    // This final type was fully checked at birth and cannot mutate. Serialization
    // preserves every locale/blank/hidden field; no second domain copy is needed.
    final bytes = Uint8List.fromList(utf8.encode(jsonEncode(graph)));
    if (bytes.length > WorkLimits.manifestUtf8Bytes) {
      throw const CapacityExceeded();
    }
    return bytes;
  } finally {
    try { copying?.release(); } finally { ticket.release(); }
  }
}

ImmutableProject _snapshotProject(Project project) {
  if (project is ImmutableProject) { return project; }
  // Covers capture/scan before the separately paid graph transfer. This ticket
  // never attaches a finalizer and does not revoke the custom producer's aliases.
  final capture = AdmissionBudget.shared.reserve(8 * 1024 * 1024);
  try {
    final graph = project.toManifest();
    final size = _boundGraph(graph);
    final retained = AdmissionBudget.shared.reserve(
        4096 + 256 * size.nodes + 4 * size.stringUnits);
    try { retained.retainGraph(graph); }
    catch (_) { retained.release(); rethrow; }
    return _readProject(graph);
  } finally { capture.release(); }
}

Map<String, Object?> _manifestOwned(ImmutableProject p, {bool retainBackings = false}) => {
  'schemaVersion': 1, 'modelVersion': p.modelVersion,
  'id': p.id, 'revision': p.revision, 'name': p.name,
  'photo': _ownedRefManifest(p.photo, retainBackings),
  'logo': _ownedRefManifest(p.logo, retainBackings),
  'cropByFormat': {
    for (final f in ExportFormat.values)
      if (p.cropByFormat.containsKey(f))
        f.name: {
          'left': p.cropByFormat[f]!.left, 'top': p.cropByFormat[f]!.top,
          'width': p.cropByFormat[f]!.width, 'height': p.cropByFormat[f]!.height,
        },
  },
  'contactIds': [...p.contactIds],
  'localeOrder': [for (final l in p.localeOrder) l.code],
  'editions': {
    for (final l in p.localeOrder)
      l.code: _editionManifest(p.edition(l), p.contactIds, retainBackings),
  },
  'sections': [for (final s in p.sections) _sectionManifest(s, p.localeOrder, retainBackings)],
  'style': {
    'ink': p.style.ink, 'accent': p.style.accent, 'paper': p.style.paper,
    'bodyPx': p.style.bodyPx, 'logoScale': p.style.logoScale,
  },
};
Map<String, Object?>? _ownedRefManifest(AssetRef? ref, bool retain) {
  if (ref == null) { return null; }
  return _manifestNode(_refManifest(ref)!, ref, retain);
}
Map<String, Object?> _editionManifest(Edition e, List<String> contacts, bool retain) {
  // Contact keys come from the paid Edition. Value-equal lookup preserves the
  // required project order; identity sharing is only of that actual owned key.
  final c = <String, Object?>{};
  for (final id in contacts) {
    final key = e.contacts.keys.firstWhere((key) => key == id);
    c[key] = e.contacts[key];
  }
  _manifestNode(c, e, retain);
  return _manifestNode(<String, Object?>{
    'headline': e.headline, 'location': e.location, 'contacts': c,
  }, e, retain);
}
Map<String, Object?> _sectionManifest(Section s, List<AppLocale> locales, bool retain) {
  final titles = _manifestNode(<String, Object?>{
    for (final l in locales) l.code: s.title(l),
  }, s, retain);
  return _manifestNode(<String, Object?>{
    'id': s.id, 'visible': s.visible, 'titles': titles,
    'items': [for (final i in s.items) _itemManifest(i, locales, retain)],
  }, s, retain);
}
Map<String, Object?> _itemManifest(SectionItem i, List<AppLocale> locales, bool retain) {
  final texts = _manifestNode(<String, Object?>{
    for (final l in locales) l.code: i.text(l),
  }, i, retain);
  return _manifestNode(<String, Object?>{'id': i.id, 'texts': texts}, i, retain);
}

Never _invalidManifest() =>
    throw const FormatException('Invalid project manifest');

/// Bounds already-supplied model graphs before recursive codec serialization.
/// This is not the raw JSON/ZIP preflight that T06 must implement.
({int nodes, int stringUnits}) _boundGraph(Object? root) {
  final active = HashSet<Object>.identity();
  var bytes = 0, nodes = 0, stringUnits = 0;
  void charge(int amount) {
    bytes += amount;
    if (bytes > WorkLimits.manifestUtf8Bytes) {
      throw const CapacityExceeded();
    }
  }

  void visit(Object? value, int depth) {
    if (depth > WorkLimits.manifestDepth || ++nodes > WorkLimits.parserNodes) {
      throw const CapacityExceeded();
    }
    if (value is Map || value is List) {
      if ((value is Map ? value.length : (value as List).length) > WorkLimits.parserMembers) {
        throw const CapacityExceeded();
      }
      if (!active.add(value!)) {
        _invalidManifest();
      }
      charge(2);
      var first = true;
      if (value is Map) {
        for (final entry in value.entries) {
          if (entry.key is! String) {
            _invalidManifest();
          }
          if (!first) {
            charge(1);
          }
          first = false;
          visit(entry.key, depth + 1);
          charge(1);
          visit(entry.value, depth + 1);
        }
      } else {
        for (final item in value as List) {
          if (!first) {
            charge(1);
          }
          first = false;
          visit(item, depth + 1);
        }
      }
      active.remove(value);
    } else if (value == null ||
        value is bool ||
        value is String ||
        value is num) {
      if (value is num && !value.isFinite) {
        _invalidManifest();
      }
      if (value is String) {
        if (value.length > WorkLimits.fieldUtf16Units) {
          throw const CapacityExceeded();
        }
        for (var i = 0; i < value.length; i++) {
          final unit = value.codeUnitAt(i);
          if (unit >= 0xd800 && unit <= 0xdbff) {
            if (++i == value.length || value.codeUnitAt(i) < 0xdc00 ||
                value.codeUnitAt(i) > 0xdfff) { _invalidManifest(); }
          } else if (unit >= 0xdc00 && unit <= 0xdfff) { _invalidManifest(); }
        }
        stringUnits += value.length;
      }
      charge(utf8.encode(jsonEncode(value)).length);
    } else {
      _invalidManifest();
    }
  }

  final scratch = AdmissionBudget.shared.reserve(2 * 1024 * 1024);
  try {
    visit(root, 1);
    return (nodes: nodes, stringUnits: stringUnits);
  } finally { scratch.release(); }
}

Map<String, Object?> _map(Object? value, [Set<String>? keys]) {
  if (value is! Map || value.keys.any((k) => k is! String)) {
    _invalidManifest();
  }
  final map = Map<String, Object?>.from(value);
  if (keys != null &&
      (map.length != keys.length || !map.keys.toSet().containsAll(keys))) {
    _invalidManifest();
  }
  return map;
}

List<Object?> _list(Object? value) {
  if (value is! List) {
    _invalidManifest();
  }
  return List<Object?>.from(value);
}

String _string(Object? value) {
  if (value is! String) {
    _invalidManifest();
  }
  return value;
}

int _int(Object? value) {
  if (value is! int) {
    _invalidManifest();
  }
  return value;
}

double _double(Object? value) {
  if (value is! num || !value.isFinite) {
    _invalidManifest();
  }
  return value.toDouble();
}

T _enum<T>(Object? value, Iterable<T> values, String Function(T) key) {
  for (final item in values) {
    if (key(item) == value) {
      return item;
    }
  }
  return _invalidManifest();
}

AppLocale _locale(Object? value) =>
    _enum(value, AppLocale.values, (l) => l.code);
Map<AppLocale, String> _localeTexts(Object? value, List<AppLocale> locales) {
  final m = _map(value, locales.map((l) => l.code).toSet());
  return {for (final l in locales) l: _string(m[l.code])};
}

AssetRef? _readRef(Object? value, _DomainBirth birth) {
  if (value == null) {
    return null;
  }
  final m = _map(value, {
    'id',
    'kind',
    'mediaType',
    'width',
    'height',
    'sha256',
  });
  return birth.own(AssetRef(
    id: _string(m['id']),
    kind: _enum(m['kind'], AssetKind.values, (v) => v.name),
    mediaType: _enum(m['mediaType'], MediaType.values, (v) => v.name),
    width: _int(m['width']),
    height: _int(m['height']),
    sha256: _string(m['sha256']),
  ));
}

ImmutableProject _readProject(Map<String, Object?> manifest) {
  final workspace = AdmissionBudget.shared.reserve(4 * 1024 * 1024);
  try { return _readProjectOwned(manifest); }
  finally { workspace.release(); }
}

ImmutableProject _readProjectOwned(Map<String, Object?> manifest) =>
    _domainBirth((birth) => _readProjectCaptured(manifest, birth));

ImmutableProject _readProjectCaptured(Map<String, Object?> manifest, _DomainBirth birth) {
  _boundGraph(manifest);
  final m = _map(manifest, {
    'schemaVersion',
    'modelVersion',
    'id',
    'revision',
    'name',
    'photo',
    'logo',
    'cropByFormat',
    'contactIds',
    'localeOrder',
    'editions',
    'sections',
    'style',
  });
  if (_int(m['schemaVersion']) != 1 || m['modelVersion'] != 'editorial-b-v1') {
    _invalidManifest();
  }
  // Shape is a schema refusal; only a well-typed list can reach its cap.
  // m is the captured map, not a second read of supplied mutable getters.
  if (m['localeOrder'] is! List || m['contactIds'] is! List ||
      m['sections'] is! List) {
    _invalidManifest();
  }
  if ((m['localeOrder'] as List).length > AppLocale.values.length ||
      (m['contactIds'] as List).length > WorkLimits.contacts ||
      (m['sections'] as List).length > WorkLimits.sections) {
    throw const CapacityExceeded();
  }
  final locales = _list(m['localeOrder']).map(_locale).toList();
  final contacts = _list(m['contactIds']).map(_string).toList();
  final editions = _map(m['editions'], locales.map((l) => l.code).toSet());
  final style = _map(m['style'], {
    'ink',
    'accent',
    'paper',
    'bodyPx',
    'logoScale',
  });
  final crops = _map(m['cropByFormat']);
  final id = _string(m['id']), name = _string(m['name']);
  final source = _manifestSources[manifest];
  // A new header belongs to the outer unpublished capture, not a nested
  // constructor which commits before the final strict guard. Borrowed headers
  // already own their payment and must never enter this fresh-only journal.
  final header = source is _ProjectHeader && identical(source.id, id) &&
      identical(source.name, name) && _sameHeaderIds(source.contacts, contacts)
      ? source : birth.own(_ProjectHeader(id, name, contacts));
  final result = ImmutableProject._owned(
    header: header, id: id, revision: _int(m['revision']), name: name,
    photo: _readRef(m['photo'], birth),
    logo: _readRef(m['logo'], birth),
    contactIds: contacts,
    localeOrder: locales,
    editions: {
      for (final l in locales) l: _readEdition(editions[l.code], contacts, birth),
    },
    style: birth.own(ProjectStyle(
      ink: _int(style['ink']),
      accent: _int(style['accent']),
      paper: _int(style['paper']),
      bodyPx: _int(style['bodyPx']),
      logoScale: _double(style['logoScale']),
    )),
    cropByFormat: {
      for (final entry in crops.entries)
        _enum(entry.key, ExportFormat.values, (f) => f.name): _readRect(
          entry.value, birth,
        ),
    },
    sections: [
      for (final value in _list(m['sections'])) _readSection(value, locales, birth),
    ],
  );
  birth.own(result);
  // All foreign reads have ended. Identity reuse did not authorize earlier
  // mutable values: this final captured domain still passes strict validation.
  _measureProject(result, strictUnicode: true);
  return result;
}

Edition _readEdition(Object? value, List<String> contacts, _DomainBirth birth) {
  final m = _map(value, {'headline', 'location', 'contacts'});
  final c = _map(m['contacts'], contacts.toSet());
  final headline = _string(m['headline']), location = _string(m['location']);
  final actual = {for (final id in c.keys) id: _string(c[id])};
  final backing = value is Map ? _manifestSources[value] : null;
  if (backing is Edition && identical(headline, backing.headline) &&
      identical(location, backing.location) && _sameTextMap(actual, backing.contacts)) {
    return backing;
  }
  return birth.own(Edition(headline: headline, location: location, contacts: actual));
}

NormalizedRect _readRect(Object? value, _DomainBirth birth) {
  final m = _map(value, {'left', 'top', 'width', 'height'});
  return birth.own(NormalizedRect(
    left: _double(m['left']), top: _double(m['top']),
    width: _double(m['width']), height: _double(m['height']),
  ));
}

Section _readSection(Object? value, List<AppLocale> locales, _DomainBirth birth) {
  final m = _map(value, {'id', 'visible', 'titles', 'items'});
  if (m['visible'] is! bool) { _invalidManifest(); }
  if (m['items'] is! List) { _invalidManifest(); }
  if ((m['items'] as List).length > WorkLimits.itemsPerSection) {
    throw const CapacityExceeded();
  }
  final id = _string(m['id']);
  final titles = _localeTexts(m['titles'], locales);
  final items = [for (final v in _list(m['items'])) _readItem(v, locales, birth)];
  final backing = value is Map ? _manifestSources[value] : null;
  if (backing is Section && identical(id, backing.id) &&
      m['visible'] == backing.visible && _sameTextMap(titles, backing.titleByLocale) &&
      _sameItemBacking(items, backing.items)) { return backing; }
  return birth.own(Section(id: id, visible: m['visible'] as bool,
      titleByLocale: titles, items: items));
}

SectionItem _readItem(Object? value, List<AppLocale> locales, _DomainBirth birth) {
  final m = _map(value, {'id', 'texts'});
  final id = _string(m['id']);
  final texts = _localeTexts(m['texts'], locales);
  final backing = value is Map ? _manifestSources[value] : null;
  if (backing is SectionItem && identical(id, backing.id) &&
      _sameTextMap(texts, backing.textByLocale)) { return backing; }
  return birth.own(SectionItem(id: id, textByLocale: texts));
}
