part of 'project.dart';

enum AppLocale {
  ptPT('pt-PT'),
  en('en'),
  fr('fr'),
  it('it'),
  deDE('de-DE'),
  deCH('de-CH'),
  es('es');

  const AppLocale(this.code);
  final String code;
}

enum AssetKind { photo, logo, thumbnail }

enum MediaType { jpeg, png }

enum ImageEncoding { png, jpg }

void validateId(String id) {
  if (!RegExp(r'^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$').hasMatch(id)) {
    throw ArgumentError('Invalid identifier');
  }
}

void validateText(String text) {
  if (text.length > WorkLimits.fieldUtf16Units) {
    throw const CapacityExceeded();
  }
}

void validateIds(Iterable<String> ids, int maximum) {
  if (ids.length > maximum) {
    throw const CapacityExceeded();
  }
  final seen = <String>{};
  for (final id in ids) {
    validateId(id);
    if (!seen.add(id)) {
      throw ArgumentError('Duplicate identifier');
    }
  }
}

int _textCharge(Iterable<String> values) {
  var units = 0;
  for (final text in values) {
    validateText(text);
    if (text.length > WorkLimits.manifestUtf8Bytes - units) {
      throw const CapacityExceeded();
    }
    units += text.length;
  }
  return 4 * units;
}
void _localeCount(Map<AppLocale, String> texts) {
  if (texts.length > AppLocale.values.length) { throw const CapacityExceeded(); }
}
final class Edition {
  factory Edition({String headline = '', String location = '',
      Map<String, String> contacts = const {}}) {
    validateText(headline); validateText(location);
    validateIds(contacts.keys, WorkLimits.contacts);
    final ticket = AdmissionBudget.shared.reserve(1024 +
      512 * contacts.length + _textCharge([headline, location, ...contacts.keys, ...contacts.values]));
    try {
      final result = Edition._(headline, location, Map.unmodifiable(contacts), ticket);
      ticket.retainAll([result, result.contacts]); return result;
    } catch (_) { ticket.release(); rethrow; }
  }
  Edition._(this.headline, this.location, this.contacts, this._credit);
  final AdmissionTicket _credit;
  final String headline, location;
  final Map<String, String> contacts;
}
// A bounded weak index shares actual published immutable DTOs, not merely
// equal-valued charges. Entries never own/retire a DTO or its readonly aliases.
final class _SectionItemCache {
  factory _SectionItemCache() {
    final control = AdmissionBudget.shared.reserve(1024 + 512 * 128);
    try {
      return _SectionItemCache._(control,
          List<WeakReference<SectionItem>?>.filled(128, null));
    } catch (_) { control.release(); rethrow; }
  }
  _SectionItemCache._(this._control, this._entries);
  final AdmissionTicket _control;
  final List<WeakReference<SectionItem>?> _entries;
  int _next = 0;
  SectionItem? find(String id, Map<AppLocale, String> texts) {
    if (!_control.isActive) { throw StateError('Inactive item cache'); }
    for (final reference in _entries) {
      final item = reference?.target;
      if (item == null || !item._credit.isActive || item.id != id ||
          item.textByLocale.length != texts.length) { continue; }
      var equal = true;
      for (final entry in texts.entries) {
        if (!item.textByLocale.containsKey(entry.key) ||
            item.textByLocale[entry.key] != entry.value) {
          equal = false; break;
        }
      }
      if (equal) { return item; }
    }
    return null;
  }
  void publish(SectionItem item) {
    // A private birth may still fail after this factory returns. Never make
    // that unpublished object reachable via a public cache lookup.
    if (_domainBirthDepth != 0) { return; }
    final reference = WeakReference<SectionItem>(item);
    item._pooledPublished = true;
    _entries[_next] = reference;
    _next = (_next + 1) % _entries.length;
  }
}
final _sectionItemCache = _SectionItemCache();

final class SectionItem {
  factory SectionItem({required String id, Map<AppLocale, String> textByLocale = const {}}) {
    validateId(id); _localeCount(textByLocale);
    // Full finite capture precedes reuse; even hits cannot bypass validation
    // or revoke payment for a newly supplied/structurally different value.
    final scratch = AdmissionBudget.shared.reserve(64 * 1024);
    try {
      final captured = <AppLocale, String>{};
      var count = 0;
      for (final key in textByLocale.keys) {
        if (++count > AppLocale.values.length) { throw const CapacityExceeded(); }
        final text = textByLocale[key];
        if (text == null) { throw ArgumentError('Missing item text'); }
        validateText(text); captured[key] = text;
      }
      final charge = 1024 + 256 * captured.length +
          _textCharge([id, ...captured.values]);
      final cached = _sectionItemCache.find(id, captured);
      if (cached != null) { return cached; }
      final ticket = AdmissionBudget.shared.reserve(charge);
      try {
        final result = SectionItem._(id, Map.unmodifiable(captured), ticket);
        ticket.retainAll([result, result.textByLocale]);
        _sectionItemCache.publish(result);
        return result;
      } catch (_) { ticket.release(); rethrow; }
    } finally { scratch.release(); }
  }
  SectionItem._(this.id, this.textByLocale, this._credit);
  final AdmissionTicket _credit;
  // Written once before a public result is made cache-visible. This private
  // provenance bit never substitutes for active payment or captured equality.
  bool _pooledPublished = false;
  final String id;
  final Map<AppLocale, String> textByLocale;
  String text(AppLocale locale) => textByLocale[locale] ?? '';
}

final class Section {
  factory Section({required String id, bool visible = true,
    Map<AppLocale, String> titleByLocale = const {}, List<SectionItem> items = const []}) {
    validateId(id); _localeCount(titleByLocale);
    validateIds(items.map((i) => i.id), WorkLimits.itemsPerSection);
    final ticket = AdmissionBudget.shared.reserve(1024 + 256 * titleByLocale.length +
      512 * items.length + _textCharge([id, ...titleByLocale.values]));
    try {
      final result = Section._(id, visible, Map.unmodifiable(titleByLocale), List.unmodifiable(items), ticket);
      ticket.retainAll([result, result.titleByLocale, result.items]); return result;
    } catch (_) { ticket.release(); rethrow; }
  }
  Section._(this.id, this.visible, this.titleByLocale, this.items, this._credit);
  final AdmissionTicket _credit;
  final String id;
  final bool visible;
  final Map<AppLocale, String> titleByLocale;
  final List<SectionItem> items;
  String title(AppLocale locale) => titleByLocale[locale] ?? '';
}

final class AssetRef {
  AssetRef({
    required this.id,
    required this.kind,
    required this.mediaType,
    required this.width,
    required this.height,
    required this.sha256,
  }) {
    validateId(id);
    if (width <= 0 ||
        height <= 0 ||
        !RegExp(r'^[0-9a-f]{64}$').hasMatch(sha256)) {
      throw ArgumentError('Invalid resource metadata');
    }
    final pixels = kind == AssetKind.photo
        ? WorkLimits.photoPixels
        : WorkLimits.logoPixels;
    if (kind == AssetKind.thumbnail) {
      if (mediaType != MediaType.png) {
        throw ArgumentError('Thumbnail must be PNG');
      }
      if (width > WorkLimits.thumbnailSide ||
          height > WorkLimits.thumbnailSide) {
        throw const CapacityExceeded();
      }
    } else if (width > pixels || height > pixels || width > pixels ~/ height) {
      throw const CapacityExceeded();
    }
    _credit = AdmissionBudget.shared.reserve(1024);
    _credit.retain(this);
  }
  late final AdmissionTicket _credit;
  final String id;
  final AssetKind kind;
  final MediaType mediaType;
  final int width;
  final int height;
  final String sha256;
}

final class NormalizedRect {
  NormalizedRect({
    required this.left,
    required this.top,
    required this.width,
    required this.height,
  }) {
    if (![left, top, width, height].every((v) => v.isFinite) ||
        left < 0 ||
        top < 0 ||
        width <= 0 ||
        height <= 0 ||
        left + width > 1 ||
        top + height > 1) {
      throw ArgumentError('Invalid normalized rectangle');
    }
    _credit = AdmissionBudget.shared.reserve(1024);
    _credit.retain(this);
  }
  late final AdmissionTicket _credit;
  final double left;
  final double top;
  final double width;
  final double height;
}

final class ProjectStyle {
  ProjectStyle({
    this.ink = 0xff173e38,
    this.accent = 0xff205b50,
    this.paper = 0xfff4f1e9,
    this.bodyPx = 30,
    this.logoScale = 1,
  }) {
    if (![ink, accent, paper].every((v) => v >= 0 && v <= 0xffffffff) ||
        !WorkLimits.bodyPxChoices.contains(bodyPx) ||
        !logoScale.isFinite ||
        logoScale < WorkLimits.minimumLogoScale ||
        logoScale > WorkLimits.maximumLogoScale) {
      throw ArgumentError('Invalid project style');
    }
    _credit = AdmissionBudget.shared.reserve(1024);
    _credit.retain(this);
  }
  late final AdmissionTicket _credit;
  final int ink;
  final int accent;
  final int paper;
  final int bodyPx;
  final double logoScale;
}
