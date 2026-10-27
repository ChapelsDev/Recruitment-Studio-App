part of 'project.dart';

// Concrete schema traversal only. No supplied graph, callback, or getter can
// select this route: ImmutableProject is final and its children are final DTOs.
// A fixed small control workspace covers the shape stack and numeric spelling;
// no manifest graph, full JSON String, domain clone, or UTF8 buffer is born.
int _measureProject(ImmutableProject p, {bool strictUnicode = false}) {
  final scratch = AdmissionBudget.shared.reserve(64 * 1024);
  try {
    final m = _ProjectShape(strictUnicode);
    m.object(13, 1, () {
      m.field('schemaVersion', 1, 1);
      m.field('modelVersion', p.modelVersion, 1);
      m.field('id', p.id, 1);
      m.field('revision', p.revision, 1);
      m.field('name', p.name, 1);
      m.key('photo', 1); _measureRef(m, p.photo, 2);
      m.key('logo', 1); _measureRef(m, p.logo, 2);
      m.key('cropByFormat', 1);
      m.object(p.cropByFormat.length, 2, () {
        for (final f in ExportFormat.values) {
          final r = p.cropByFormat[f];
          if (r == null) { continue; }
          m.key(f.name, 2);
          m.object(4, 3, () {
            m.field('left', r.left, 3); m.field('top', r.top, 3);
            m.field('width', r.width, 3); m.field('height', r.height, 3);
          });
        }
      });
      m.key('contactIds', 1);
      m.array(p.contactIds.length, 2, () {
        for (final id in p.contactIds) { m.scalar(id, 3); }
      });
      m.key('localeOrder', 1);
      m.array(p.localeOrder.length, 2, () {
        for (final l in p.localeOrder) { m.scalar(l.code, 3); }
      });
      m.key('editions', 1);
      m.object(p.localeOrder.length, 2, () {
        for (final l in p.localeOrder) {
          final e = p.edition(l);
          m.key(l.code, 2);
          m.object(3, 3, () {
            m.field('headline', e.headline, 3); m.field('location', e.location, 3);
            m.key('contacts', 3);
            m.object(p.contactIds.length, 4, () {
              for (final id in p.contactIds) { m.field(id, e.contacts[id]!, 4); }
            });
          });
        }
      });
      m.key('sections', 1);
      m.array(p.sections.length, 2, () {
        for (final s in p.sections) {
          m.object(4, 3, () {
            m.field('id', s.id, 3); m.field('visible', s.visible, 3);
            m.key('titles', 3);
            m.object(p.localeOrder.length, 4, () {
              for (final l in p.localeOrder) { m.field(l.code, s.title(l), 4); }
            });
            m.key('items', 3);
            m.array(s.items.length, 4, () {
              for (final i in s.items) {
                m.object(2, 5, () {
                  m.field('id', i.id, 5); m.key('texts', 5);
                  m.object(p.localeOrder.length, 6, () {
                    for (final l in p.localeOrder) { m.field(l.code, i.text(l), 6); }
                  });
                });
              }
            });
          });
        }
      });
      m.key('style', 1);
      m.object(5, 2, () {
        m.field('ink', p.style.ink, 2); m.field('accent', p.style.accent, 2);
        m.field('paper', p.style.paper, 2); m.field('bodyPx', p.style.bodyPx, 2);
        m.field('logoScale', p.style.logoScale, 2);
      });
    });
    return m.bytes;
  } finally { scratch.release(); }
}

void _measureRef(_ProjectShape m, AssetRef? ref, int depth) {
  if (ref == null) { m.scalar(null, depth); return; }
  m.object(6, depth, () {
    m.field('id', ref.id, depth); m.field('kind', ref.kind.name, depth);
    m.field('mediaType', ref.mediaType.name, depth);
    m.field('width', ref.width, depth); m.field('height', ref.height, depth);
    m.field('sha256', ref.sha256, depth);
  });
}

final class _ProjectShape {
  _ProjectShape(this.strictUnicode);
  final bool strictUnicode;
  int bytes = 0, nodes = 0;
  void _node(int depth) {
    if (depth > WorkLimits.manifestDepth || ++nodes > WorkLimits.parserNodes) {
      throw const CapacityExceeded();
    }
  }
  void _charge(int amount) {
    if (amount > WorkLimits.manifestUtf8Bytes - bytes) { throw const CapacityExceeded(); }
    bytes += amount;
  }
  void object(int count, int depth, void Function() body) {
    _node(depth);
    if (count > WorkLimits.parserMembers) { throw const CapacityExceeded(); }
    _charge(2 + (count == 0 ? 0 : count - 1) + count);
    body();
  }
  void array(int count, int depth, void Function() body) {
    _node(depth);
    if (count > WorkLimits.parserMembers) { throw const CapacityExceeded(); }
    _charge(2 + (count == 0 ? 0 : count - 1));
    body();
  }
  void key(String key, int objectDepth) { scalar(key, objectDepth + 1); }
  void field(String key, Object? value, int objectDepth) {
    this.key(key, objectDepth); scalar(value, objectDepth + 1);
  }
  void scalar(Object? value, int depth) {
    _node(depth);
    if (value is! String) {
      if (value is num && !value.isFinite) { _invalidManifest(); }
      // All callers are the fixed schema above; these are bounded numeric,
      // boolean or null spellings, never arbitrary object.toJson callbacks.
      _charge(jsonEncode(value).length);
      return;
    }
    validateText(value);
    _charge(2);
    for (var i = 0; i < value.length; i++) {
      final unit = value.codeUnitAt(i);
      if (unit == 0x22 || unit == 0x5c || unit == 8 || unit == 9 ||
          unit == 10 || unit == 12 || unit == 13) {
        _charge(2);
      } else if (unit < 0x20) {
        _charge(6);
      } else if (unit < 0x80) {
        _charge(1);
      } else if (unit < 0x800) {
        _charge(2);
      } else if (unit >= 0xd800 && unit <= 0xdbff) {
        if (i + 1 < value.length && value.codeUnitAt(i + 1) >= 0xdc00 &&
            value.codeUnitAt(i + 1) <= 0xdfff) {
          i++; _charge(4);
        } else {
          if (strictUnicode) { _invalidManifest(); }
          _charge(6); // Literal internal UTF16 is serialized as a JSON escape.
        }
      } else if (unit >= 0xdc00 && unit <= 0xdfff) {
        if (strictUnicode) { _invalidManifest(); }
        _charge(6);
      } else {
        _charge(3);
      }
    }
  }
}

bool _sameProjectContent(ImmutableProject a, ImmutableProject b) {
  if (identical(a, b)) { return true; }
  if (a.id != b.id || a.modelVersion != b.modelVersion || a.name != b.name ||
      !_sameAsset(a.photo, b.photo) || !_sameAsset(a.logo, b.logo) ||
      a.cropByFormat.length != b.cropByFormat.length ||
      a.contactIds.length != b.contactIds.length ||
      a.localeOrder.length != b.localeOrder.length || a.sections.length != b.sections.length ||
      a.style.ink != b.style.ink || a.style.accent != b.style.accent ||
      a.style.paper != b.style.paper || a.style.bodyPx != b.style.bodyPx ||
      a.style.logoScale != b.style.logoScale) { return false; }
  for (final f in ExportFormat.values) {
    final x = a.cropByFormat[f], y = b.cropByFormat[f];
    if (x == null || y == null) {
      if (!identical(x, y)) { return false; }
    } else if (x.left != y.left || x.top != y.top || x.width != y.width ||
        x.height != y.height) { return false; }
  }
  for (var i = 0; i < a.contactIds.length; i++) {
    if (a.contactIds[i] != b.contactIds[i]) { return false; }
  }
  for (var i = 0; i < a.localeOrder.length; i++) {
    final l = a.localeOrder[i];
    if (l != b.localeOrder[i]) { return false; }
    final x = a.edition(l), y = b.edition(l);
    if (x.headline != y.headline || x.location != y.location) { return false; }
    for (final id in a.contactIds) {
      if (x.contacts[id] != y.contacts[id]) { return false; }
    }
  }
  for (var s = 0; s < a.sections.length; s++) {
    final x = a.sections[s], y = b.sections[s];
    if (x.id != y.id || x.visible != y.visible || x.items.length != y.items.length) { return false; }
    for (final l in a.localeOrder) {
      if (x.title(l) != y.title(l)) { return false; }
    }
    for (var i = 0; i < x.items.length; i++) {
      if (x.items[i].id != y.items[i].id) { return false; }
      for (final l in a.localeOrder) {
        if (x.items[i].text(l) != y.items[i].text(l)) { return false; }
      }
    }
  }
  return true;
}
bool _sameAsset(AssetRef? a, AssetRef? b) {
  if (a == null || b == null) { return identical(a, b); }
  return a.id == b.id && a.kind == b.kind && a.mediaType == b.mediaType &&
      a.width == b.width && a.height == b.height && a.sha256 == b.sha256;
}

// Extendable own project-header/container payment. It holds no target and
// has no public retain/refund API. Root/header aliases extend this payment;
// each child graph node instead keeps its actual paid final DTO backing alive.
// Delayed finalizers only retain credit; no timely collection is assumed.
final class _ProjectDomainCredit {
  _ProjectDomainCredit(this.ticket);
  final AdmissionTicket ticket;
  int _targets = 0;
  static final Finalizer<_ProjectDomainCredit> _finalizer = Finalizer((credit) {
    if (--credit._targets == 0) { credit.ticket.release(); }
  });
  void _retain(Object target) {
    if (!ticket.isActive) { throw StateError('Inactive domain credit'); }
    _targets++;
    _finalizer.attach(target, this);
  }
  void retainAll(Iterable<Object> targets) {
    for (final target in targets) { _retain(target); }
  }
}

// Each property is reachable only while its concrete copied collection key is
// accessible. Values are actual final DTOs, never the key or a String identity.
// Entries/graph finalizer metadata are paid by _manifestTicket's finite slots.
final Expando<Object> _manifestSources = Expando<Object>('paid domain backing');
T _manifestNode<T extends Object>(T node, Object backing, bool retainBacking) {
  if (retainBacking) { _manifestSources[node] = backing; }
  return node;
}

bool _sameTextMap<K>(Map<K, String> a, Map<K, String> b) {
  if (a.length != b.length) { return false; }
  for (final entry in a.entries) {
    if (!b.containsKey(entry.key) || !identical(entry.value, b[entry.key])) {
      return false;
    }
    // Equal strings alone do not establish the captured key's paid identity.
    if (!b.keys.any((key) => identical(key, entry.key))) { return false; }
  }
  return true;
}
bool _sameItemBacking(List<SectionItem> a, List<SectionItem> b) {
  if (a.length != b.length) { return false; }
  for (var i = 0; i < a.length; i++) {
    if (!identical(a[i], b[i])) { return false; }
  }
  return true;
}

// Immediate rollback is legitimate only for new values which have never been
// published. Held old DTOs do not enter this journal. Delayed finalizers remain
// idempotent and never revoke a still-visible borrowed value's payment.
final class _DomainBirth {
  static final int maximum = WorkLimits.sections * (WorkLimits.itemsPerSection + 1) +
      AppLocale.values.length + ExportFormat.values.length + 6;
  _DomainBirth() : control = AdmissionBudget.shared.reserve(1024 + 256 * maximum);
  final AdmissionTicket control;
  final List<AdmissionTicket> _new = [];
  T own<T>(T value) {
    if (value == null) { return value; }
    // A cache hit is an existing published, paid immutable owner, never a
    // fresh private birth whose credit this transaction may roll back.
    if (value is SectionItem && value._pooledPublished) {
      if (!value._credit.isActive) { throw StateError('Inactive cached item'); }
      return value;
    }
    final ticket = _newDomainTicket(value as Object);
    if (_new.length >= maximum) {
      ticket.release();
      throw const CapacityExceeded();
    }
    _new.add(ticket);
    return value;
  }
  void commit() { _new.clear(); }
  void rollback() {
    for (final ticket in _new.reversed) { ticket.release(); }
    _new.clear();
  }
}
AdmissionTicket _newDomainTicket(Object value) {
  if (value is Edition) { return value._credit; }
  if (value is SectionItem) { return value._credit; }
  if (value is Section) { return value._credit; }
  if (value is AssetRef) { return value._credit; }
  if (value is NormalizedRect) { return value._credit; }
  if (value is ProjectStyle) { return value._credit; }
  if (value is ImmutableProject) { return value._domainCredit.ticket; }
  if (value is _ProjectHeader) { return value._credit; }
  throw StateError('Unsupported new domain birth');
}
int _domainBirthDepth = 0;
T _domainBirth<T>(T Function(_DomainBirth) create) {
  final birth = _DomainBirth();
  _domainBirthDepth++;
  try {
    final result = create(birth);
    birth.commit();
    return result;
  } catch (_) { birth.rollback(); rethrow; }
  finally {
    _domainBirthDepth--;
    birth.control.release();
  }
}

// One actual immutable backing for the project's own manual header. Private
// revision/capture routes can share this object, never deduplicate equal text.
final class _ProjectHeader {
  factory _ProjectHeader(String id, String name, List<String> contacts) {
    final units = id.length + name.length +
        contacts.fold<int>(0, (sum, value) => sum + value.length);
    final ticket = AdmissionBudget.shared.reserve(1024 + 4 * units + 256 * contacts.length);
    try {
      final result = _ProjectHeader._(id, name, List.unmodifiable(contacts), ticket);
      ticket.retainAll([result, result.contacts]);
      return result;
    } catch (_) { ticket.release(); rethrow; }
  }
  _ProjectHeader._(this.id, this.name, this.contacts, this._credit);
  final String id, name;
  final List<String> contacts;
  final AdmissionTicket _credit;
}
bool _sameHeaderIds(List<String> a, List<String> b) {
  if (a.length != b.length) { return false; }
  for (var i = 0; i < a.length; i++) {
    if (!identical(a[i], b[i])) { return false; }
  }
  return true;
}
