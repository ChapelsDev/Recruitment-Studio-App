import 'dart:collection';
import 'dart:convert';
import 'dart:typed_data';

import '../../shared/problem.dart';
import '../../shared/admission_budget.dart';
import '../composition/export_format.dart';
import '../../shared/work_limits.dart';
import '../../shared/work_budget.dart';
import '../storage/package_zip_io.dart' show PackageFailure;
part 'project_manifest.dart';
part 'project_internal.dart';
part '_project_values.dart';
part '_strict_manifest_json.dart';

abstract interface class Project {
  factory Project.blank({required String id}) = ImmutableProject.blank;
  factory Project.fromManifest(Map<String, Object?> manifest) =
      ImmutableProject.fromManifest;
  String get id;
  int get revision;
  String get name;
  String get modelVersion;
  AssetRef? get photo;
  AssetRef? get logo;
  Map<ExportFormat, NormalizedRect> get cropByFormat;
  List<String> get contactIds;
  List<AppLocale> get localeOrder;
  List<Section> get sections;
  ProjectStyle get style;
  Edition edition(AppLocale locale);
  Project withHeadline(AppLocale locale, String text);
  Project withLocation(AppLocale locale, String text);
  Project withName(String name);
  Project withContact(AppLocale locale, String contactId, String text);
  Project withPhoto(AssetRef photo);
  Project withLogo(AssetRef? logo);
  Project withLocale(AppLocale locale);
  Project withStyle(ProjectStyle style);
  Project withSections(List<Section> sections);
  Project withContactIds(List<String> contactIds);
  Project withCrop(ExportFormat format, NormalizedRect crop);
  Project withoutLocale(AppLocale locale);
  Project duplicate({required String newId});
  Map<String, Object?> toManifest();
}

/// Canonical internal JSON without an escaping mutable graph or callback.
/// Internal immutable text keeps the legacy literal UTF-16/JSON semantics.
/// A foreign Project is first captured by the existing strict paid boundary.
/// The bounded returned String transfers to caller custody at immediate return;
/// this API does not account arbitrary caller retention or promise a RSS cap.
extension ProjectJsonSerialization on Project {
  String toManifestJson() => _manifestJson(ImmutableProject.snapshot(this));
}

final class ImmutableProject implements Project {
  factory ImmutableProject.blank({required String id}) =>
      ImmutableProject(id: id);
  factory ImmutableProject.fromManifest(Map<String, Object?> manifest) =>
      _readProject(manifest);
  /// Exact final immutable instances already own validated readonly collections.
  /// A custom Project is untrusted: capture, pay and validate its public graph;
  /// it may keep any nested alias, so that graph never receives private credit.
  factory ImmutableProject.snapshot(Project project) => _snapshotProject(project);

  /// Concrete internal serialization: no raw collection or user callback escapes.
  /// The workspace pays JSON text/scratch; buffer creation is separately prepaid.
  /// As with other raw buffer APIs, caller custody starts at immediate return.
  Uint8List manifestBytes({required AdmissionTicket workspace,
      WorkBudgetController? budget, WorkReservation? prepaidBuffers}) =>
      _manifestBytes(this, workspace, budget, prepaidBuffers);

  factory ImmutableProject({required String id, int revision = 0, String name = '',
    AssetRef? photo, AssetRef? logo, Map<ExportFormat, NormalizedRect> cropByFormat = const {},
    List<String> contactIds = const [], List<AppLocale> localeOrder = const [AppLocale.ptPT],
    List<Section> sections = const [], ProjectStyle? style, Map<AppLocale, Edition>? editions}) =>
      ImmutableProject._owned(id: id, revision: revision, name: name,
        photo: photo, logo: logo, cropByFormat: cropByFormat, contactIds: contactIds,
        localeOrder: localeOrder, sections: sections, style: style, editions: editions);

  factory ImmutableProject._owned({required String id, int revision = 0, String name = '',
    AssetRef? photo, AssetRef? logo, Map<ExportFormat, NormalizedRect> cropByFormat = const {},
    List<String> contactIds = const [], List<AppLocale> localeOrder = const [AppLocale.ptPT],
    List<Section> sections = const [], ProjectStyle? style, Map<AppLocale, Edition>? editions,
    _ProjectHeader? header}) {
    validateId(id); validateText(name);
    validateIds(contactIds, WorkLimits.contacts);
    validateIds(sections.map((s) => s.id), WorkLimits.sections);
    if (localeOrder.isEmpty || localeOrder.length > AppLocale.values.length ||
        cropByFormat.length > ExportFormat.values.length ||
        (editions?.length ?? 0) > AppLocale.values.length) { throw const CapacityExceeded(); }
    var units = id.length + name.length;
    var slots = contactIds.length + localeOrder.length + sections.length + cropByFormat.length;
    void text(String value) {
      if (value.length > WorkLimits.manifestUtf8Bytes - units) { throw const CapacityExceeded(); }
      units += value.length;
      slots++;
    }
    for (final c in contactIds) { text(c); }
    for (final e in editions?.values ?? const <Edition>[]) {
      text(e.headline); text(e.location);
      for (final c in e.contacts.entries) { text(c.key); text(c.value); }
    }
    for (final s in sections) {
      text(s.id);
      for (final title in s.titleByLocale.values) { text(title); }
      for (final i in s.items) {
        text(i.id);
        for (final value in i.textByLocale.values) { text(value); }
      }
    }
    // Shape/UTF16 traversal is not a second text birth. Final children own
    // their backing; a private immutable header separately owns ID/name/IDs.
    // Every new project still pays its copied containers and control metadata.
    if (header != null && (!identical(header.id, id) || !identical(header.name, name) ||
        !_sameHeaderIds(header.contacts, contactIds))) {
      throw StateError('Mismatched private header backing');
    }
    final ticket = AdmissionBudget.shared.reserve(4096 + 256 * slots);
    try {
      return _domainBirth((birth) {
        final actualHeader = header ?? birth.own<_ProjectHeader>(_ProjectHeader(id, name, contactIds));
        final actualStyle = style ?? birth.own<ProjectStyle>(ProjectStyle());
        final actualEditions = editions ?? {
          for (final l in localeOrder)
            l: birth.own(Edition(contacts: {for (final c in contactIds) c: ''})),
        };
        final result = ImmutableProject._(id: id, revision: revision, name: name,
          photo: photo, logo: logo, cropByFormat: cropByFormat, contactIds: actualHeader.contacts,
          localeOrder: localeOrder, sections: sections, style: actualStyle,
          editions: actualEditions);
        final credit = _ProjectDomainCredit(ticket);
        result._domainCredit = credit;
        result._header = actualHeader;
        credit.retainAll([result, result.cropByFormat, result.contactIds,
          result.localeOrder, result.sections, result._editions]);
        return result;
      });
    } catch (_) { ticket.release(); rethrow; }
  }
  ImmutableProject._({
    required this.id,
    this.revision = 0,
    this.name = '',
    this.photo,
    this.logo,
    Map<ExportFormat, NormalizedRect> cropByFormat = const {},
    List<String> contactIds = const [],
    List<AppLocale> localeOrder = const [AppLocale.ptPT],
    List<Section> sections = const [],
    required ProjectStyle style,
    required Map<AppLocale, Edition> editions,
  }) : cropByFormat = Map.unmodifiable(cropByFormat),
       // _owned passes the actual paid header's already-readonly collection.
       contactIds = contactIds,
       localeOrder = List.unmodifiable(localeOrder),
       sections = List.unmodifiable(sections),
       // Preserve the explicit existing project-constructor contract.
       // ignore: prefer_initializing_formals
       style = style,
       _editions = Map.unmodifiable(editions) {
    validateId(id);
    validateText(name);
    if (revision < 0 ||
        localeOrder.isEmpty ||
        localeOrder.toSet().length != localeOrder.length ||
        _editions.length != localeOrder.length ||
        !_editions.keys.toSet().containsAll(localeOrder)) {
      throw ArgumentError('Invalid revision or locale order');
    }
    validateIds(contactIds, WorkLimits.contacts);
    validateIds(sections.map((s) => s.id), WorkLimits.sections);
    if ((photo != null && photo!.kind != AssetKind.photo) ||
        (logo != null && logo!.kind != AssetKind.logo) ||
        (photo != null && logo != null && photo!.id == logo!.id)) {
      throw ArgumentError('Invalid photo or logo reference');
    }
    for (final e in _editions.values) {
      if (e.contacts.length != contactIds.length ||
          !e.contacts.keys.toSet().containsAll(contactIds)) {
        throw ArgumentError('Contact order mismatch');
      }
    }
    for (final section in sections) {
      _checkLocales(section.titleByLocale.keys);
      for (final item in section.items) {
        _checkLocales(item.textByLocale.keys);
      }
    }
    _validateProjectManifest(this);
  }
  // Only this exact final type can use concrete private semantics. A custom
  // Project still crosses the strict paid snapshot/fromManifest boundary.
  late final int _manifestByteLength;
  late final _ProjectDomainCredit _domainCredit;
  late final _ProjectHeader _header;
  bool sameContent(ImmutableProject other) => _sameProjectContent(this, other);
  void checkRevision(int revision) {
    if (revision < 0) { throw ArgumentError('Invalid revision'); }
    final size = _manifestByteLength - this.revision.toString().length +
        revision.toString().length;
    if (size > WorkLimits.manifestUtf8Bytes) { throw const CapacityExceeded(); }
  }
  ImmutableProject withRevision(int revision) {
    checkRevision(revision);
    if (revision == this.revision) { return this; }
    return _copy(revision: revision);
  }
  @override
  Map<String, Object?> toManifest() => _manifest(this);
  void _checkLocales(Iterable<AppLocale> keys) {
    if (keys.any((l) => !localeOrder.contains(l))) {
      throw ArgumentError('Inactive text locale');
    }
  }

  @override
  final String id;
  @override
  final int revision;
  @override
  final String name;
  @override
  String get modelVersion => 'editorial-b-v1';
  @override
  final AssetRef? photo;
  @override
  final AssetRef? logo;
  @override
  final Map<ExportFormat, NormalizedRect> cropByFormat;
  @override
  final List<String> contactIds;
  @override
  final List<AppLocale> localeOrder;
  @override
  final List<Section> sections;
  @override
  final ProjectStyle style;
  final Map<AppLocale, Edition> _editions;
  @override
  Edition edition(AppLocale locale) =>
      _editions[locale] ?? (throw ArgumentError('Inactive locale'));
  ImmutableProject _copy({
    String? id,
    int? revision,
    String? name,
    AssetRef? photo,
    AssetRef? logo,
    bool replaceLogo = false,
    Map<ExportFormat, NormalizedRect>? crops,
    List<String>? contacts,
    List<AppLocale>? locales,
    List<Section>? sections,
    ProjectStyle? style,
    Map<AppLocale, Edition>? editions,
  }) => ImmutableProject._owned(
    header: id == null && name == null && contacts == null ? _header : null,
    id: id ?? this.id,
    revision: revision ?? this.revision + 1,
    name: name ?? this.name,
    photo: photo ?? this.photo,
    logo: replaceLogo ? logo : this.logo,
    cropByFormat: crops ?? cropByFormat,
    contactIds: contacts ?? contactIds,
    localeOrder: locales ?? localeOrder,
    sections: sections ?? this.sections,
    style: style ?? this.style,
    editions: editions ?? _editions,
  );
  @override
  Project withHeadline(AppLocale locale, String text) {
    final e = edition(locale);
    return _domainBirth((birth) => _copy(
      editions: {
        ..._editions,
        locale: birth.own(Edition(
          headline: text,
          location: e.location,
          contacts: e.contacts,
        )),
      },
    ));
  }

  @override
  Project withLocation(AppLocale locale, String text) {
    final e = edition(locale);
    return _domainBirth((birth) => _copy(
      editions: {
        ..._editions,
        locale: birth.own(Edition(
          headline: e.headline,
          location: text,
          contacts: e.contacts,
        )),
      },
    ));
  }

  @override
  Project withName(String name) => _copy(name: name);
  @override
  Project withContact(AppLocale locale, String contactId, String text) {
    edition(locale);
    validateId(contactId);
    final newSlot = !contactIds.contains(contactId);
    final ids = newSlot ? [...contactIds, contactId] : contactIds;
    validateIds(ids, WorkLimits.contacts);
    return _domainBirth((birth) => _copy(
      contacts: ids,
      editions: {
        for (final l in localeOrder)
          l: l != locale && !newSlot ? edition(l) : birth.own(Edition(
            headline: edition(l).headline,
            location: edition(l).location,
            contacts: {
              for (final id in ids)
                id: l == locale && id == contactId ? text : edition(l).contacts[id] ?? '',
            },
          )),
      },
    ));
  }

  @override
  Project withContactIds(List<String> contactIds) {
    validateIds(contactIds, WorkLimits.contacts);
    return _domainBirth((birth) => _copy(
    contacts: contactIds,
    editions: {
      for (final l in localeOrder)
        l: birth.own(Edition(
          headline: edition(l).headline,
          location: edition(l).location,
          contacts: {
            for (final c in contactIds) c: edition(l).contacts[c] ?? '',
          },
        )),
    },
  ));
  }
  @override
  Project withPhoto(AssetRef photo) => _copy(photo: photo);
  @override
  Project withLogo(AssetRef? logo) => _copy(logo: logo, replaceLogo: true);
  @override
  Project withStyle(ProjectStyle style) => _copy(style: style);
  @override
  Project withSections(List<Section> sections) => _copy(sections: sections);
  @override
  Project withCrop(ExportFormat format, NormalizedRect crop) =>
      _copy(crops: {...cropByFormat, format: crop});
  List<Section> _sectionsFor(List<AppLocale> locales, _DomainBirth birth) => [
    for (final s in sections)
      birth.own(Section(
        id: s.id,
        visible: s.visible,
        titleByLocale: {for (final l in locales) l: s.title(l)},
        items: [
          for (final i in s.items)
            birth.own(SectionItem(
              id: i.id,
              textByLocale: {for (final l in locales) l: i.text(l)},
            )),
        ],
      )),
  ];
  @override
  Project withLocale(AppLocale locale) {
    if (_editions.containsKey(locale)) {
      return this;
    }
    final locales = [...localeOrder, locale];
    return _domainBirth((birth) => _copy(
      locales: locales,
      sections: _sectionsFor(locales, birth),
      editions: {
        ..._editions,
        locale: birth.own(Edition(contacts: {for (final c in contactIds) c: ''})),
      },
    ));
  }

  @override
  Project withoutLocale(AppLocale locale) {
    edition(locale);
    if (localeOrder.length == 1) {
      throw ArgumentError('Cannot remove last locale');
    }
    final locales = localeOrder.where((l) => l != locale).toList();
    return _domainBirth((birth) => _copy(
      locales: locales,
      sections: _sectionsFor(locales, birth),
      editions: {for (final l in locales) l: edition(l)},
    ));
  }

  @override
  Project duplicate({required String newId}) {
    if (newId == id) {
      throw ArgumentError('Duplicate requires distinct identity');
    }
    return _copy(id: newId, revision: 0);
  }
}
