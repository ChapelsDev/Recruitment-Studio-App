import 'dart:async';
import 'dart:collection';
import 'dart:typed_data';

import '../../shared/operation.dart';
import '../../shared/problem.dart';
import '../../shared/work_budget.dart';
import '../../shared/admission_budget.dart';
import '../../shared/work_limits.dart';

import '../composition/export_format.dart';
import '../projects/company_profile.dart';
import '../projects/project.dart';
export '../projects/company_profile.dart';
import '../projects/project_bundle.dart';

enum _RemovalKind { section, item, locale }

/// Field coordinates only: never copies private publishable text.
final class RemovalImpact {
  RemovalImpact._(
    this._owner,
    this._key,
    this.projectId,
    this.revision,
    this.sessionGeneration,
    List<AppLocale> locales,
    List<String> fields, {
    bool alwaysConfirm = false,
  }) : affectedLocales = List.unmodifiable(locales),
       affectedFields = List.unmodifiable(fields),
       requiresConfirmation = alwaysConfirm || fields.isNotEmpty;
  final Object _owner;
  final String _key;
  final String projectId;
  final int revision;
  final int sessionGeneration;
  final bool requiresConfirmation;
  final List<AppLocale> affectedLocales;
  final List<String> affectedFields;
}

/// Immutable content transitions; admission baseline is not a disk-save claim.
final class EditorSession {
  factory EditorSession(
    Project initial, {
    Map<String, Uint8List> resources = const {},
    WorkBudgetController? budget,
    int historyLimit = WorkLimits.undoSnapshots,
    int historyBytes = WorkLimits.undoBytes,
  }) {
    _limits(historyLimit, historyBytes);
    if (resources.values.fold<int>(0, (n, b) => n + b.length) > historyBytes) {
      throw const CapacityExceeded();
    }
    final owner = _ResourceOwnership(
      budget ?? WorkBudget.shared() as WorkBudgetController,
    );
    try {
      final bundle = owner.copy(initial, resources);
      return EditorSession._(bundle, owner, historyLimit, historyBytes);
    } catch (_) {
      owner.close();
      rethrow;
    }
  }

  factory EditorSession.fromBundle(
    ProjectBundle bundle, {
    WorkBudgetController? budget,
    int historyLimit = WorkLimits.undoSnapshots,
    int historyBytes = WorkLimits.undoBytes,
  }) {
    _limits(historyLimit, historyBytes);
    if (_bytes([bundle]) > historyBytes) throw const CapacityExceeded();
    final owner = _ResourceOwnership(
      budget ?? WorkBudget.shared() as WorkBudgetController,
    );
    try {
      owner.reserve(_buffers([bundle]));
      return EditorSession._(bundle, owner, historyLimit, historyBytes);
    } catch (_) {
      owner.close();
      rethrow;
    }
  }
  EditorSession._(
    ProjectBundle bundle,
    this._ownership,
    this._historyLimit,
    this._historyBytes,
  ) : _current = bundle,
      _confirmed = bundle,
      _baseline = ImmutableProject.snapshot(bundle.project),
      _revision = bundle.project.revision,
      _retired = ProjectBundle(Project.blank(id: bundle.project.id), const {}) {
    _control = AdmissionBudget.shared.reserve(2 * 1024 * 1024);
  }
  late final AdmissionTicket _control;
  final ProjectBundle _retired;

  static void _limits(int count, int bytes) {
    if (count < 1 ||
        count > WorkLimits.undoSnapshots ||
        bytes < 0 ||
        bytes > WorkLimits.undoBytes) {
      throw ArgumentError('Invalid history limits');
    }
  }

  static Set<Uint8List> _buffers(Iterable<ProjectBundle> bundles) =>
      HashSet<Uint8List>.identity()
        ..addAll(bundles.expand((b) => b.resources.values));
  static int _bytes(Iterable<ProjectBundle> bundles) =>
      _buffers(bundles).fold(0, (n, b) => n + b.lengthInBytes);
  final _ResourceOwnership _ownership;
  final int _historyLimit;
  final int _historyBytes;
  bool _disposed = false;
  bool get isDisposed => _disposed;
  void _alive() {
    if (_disposed) throw StateError('Session disposed');
  }

  ProjectBundle _confirmed;
  int _epoch = 0;
  int _confirmedGeneration = -1;
  bool _hasConfirmed = false;
  bool get hasConfirmedProjectSave => _hasConfirmed;
  bool _validSnapshot(CapturedSnapshot h) =>
      !_disposed &&
      !h.isReleased &&
      identical(h._session, this) &&
      _captured.contains(h) &&
      h._epoch == _epoch &&
      h.projectId == project.id;
  bool isSnapshotCurrent(CapturedSnapshot h) =>
      _validSnapshot(h) &&
      h.sessionGeneration == generation &&
      h.revision == project.revision;
  bool _claims(
    CapturedSnapshot h,
    String id,
    int revision,
    int generation,
    bool succeeded,
  ) =>
      succeeded &&
      _validSnapshot(h) &&
      id == h.projectId &&
      revision == h.revision &&
      generation == h.sessionGeneration;

  /// Trusted future IO adapter acknowledgement ONLY; this method performs no IO.
  /// The adapter must call only after the exact captured project-file is verified.
  bool acknowledgeProjectSave(
    CapturedSnapshot snapshot, {
    required String projectId,
    required int revision,
    required int sessionGeneration,
    required bool succeeded,
  }) {
    if (!_claims(snapshot, projectId, revision, sessionGeneration, succeeded) ||
        snapshot.sessionGeneration < _confirmedGeneration) {
      return false;
    }
    if (snapshot._deferSave) {
      if (!isSnapshotCurrent(snapshot) ||
          _activeLeave == null ||
          _activeLeave!._cancelled ||
          !identical(_activeLeave!.snapshot, snapshot)) {
        return false;
      }
      snapshot._pendingSave = true;
      return true;
    }
    return _confirmSaved(snapshot);
  }

  bool _confirmSaved(CapturedSnapshot h) {
    _confirmed = h._bundle;
    _baseline = ImmutableProject.snapshot(h._bundle.project);
    _confirmedGeneration = h.sessionGeneration;
    _hasConfirmed = true;
    h._projectSaveAcknowledged = true;
    _reconcile();
    return true;
  }

  /// Draft confirmation validates identity, but never replaces project-file baseline.
  bool acknowledgeDraft(
    CapturedSnapshot snapshot, {
    required String projectId,
    required int revision,
    required int sessionGeneration,
    required bool succeeded,
  }) => _claims(snapshot, projectId, revision, sessionGeneration, succeeded);

  LeaveAttempt? _activeLeave;
  bool _allowIdentityReplacement = false;

  /// Session-wide ownership lock, shared even by separate guard instances.
  LeaveAttempt? beginLeaveAttempt() {
    if (_disposed || _activeLeave != null) return null;
    final h = captureSnapshot();
    h._deferSave = true;
    return _activeLeave = LeaveAttempt._(this, h, hasUnsavedChanges);
  }

  void replaceProject(Project next) {
    _alive();
    final source = _current;
    // Retained orphan storage may have no digest until its first reference.
    // withProject carries the entire source map, not only published references.
    _prepareResources(
      source.resources.values,
      () => source.withProject(next),
      replaceBundle,
    );
  }

  void replaceBundle(ProjectBundle next) {
    _alive();
    if (next.project.id != project.id) {
      if (!_allowIdentityReplacement) {
        throw StateError('Identity replacement requires composed leave guard');
      }
      final revision = (_revision > next.project.revision ? _revision : next.project.revision) + 1;
      final candidate = _prune(next).withProject(
        ImmutableProject.snapshot(next.project).withRevision(revision),
      );
      if (_bytes([candidate]) > _historyBytes) throw const CapacityExceeded();
      _ownership.reserve(
        _buffers([candidate, ..._captured.map((h) => h._bundle)]),
      );
      _current = candidate;
      _confirmed = candidate;
      _baseline = ImmutableProject.snapshot(candidate.project);
      _history.clear();
      _revision = candidate.project.revision;
      _hasConfirmed = false;
      _epoch++;
      _confirmedGeneration = -1;
      _changed();
      _reconcile();
      return;
    }
    final before = generation;
    _publish(_prune(next));
    if (before == generation) return;
    _epoch++;
    _confirmedGeneration = -1;
  }

  final Set<CapturedSnapshot> _captured = HashSet.identity();
  // Synchronous digest callbacks can nest publication or disposal. Preparation
  // Each frame owns its fixed dependencies until its own finally. Distinct
  // claims may share a charged buffer; even an empty frame has a lifetime.
  final List<Set<Uint8List>> _preparing = [];
  int get undoCount => _history.length;
  int get historyResourceBytes => _bytes([_current, ..._history]);
  ProjectBundle _current;
  ImmutableProject _baseline;
  int _revision;
  int _generation = 0;
  final List<ProjectBundle> _history = [];
  final Map<String, RemovalImpact> _issued = {};
  void _changed() {
    _generation++;
    _issued.clear();
  }

  Project get project {
    _alive();
    return _current.project;
  }

  ProjectBundle get bundle {
    _alive();
    return _current;
  }

  bool get hasUnsavedChanges => !ImmutableProject.snapshot(project).sameContent(_baseline);
  bool get canUndo => _history.isNotEmpty;
  int get generation => _generation;

  Project _fresh(Project p) => ImmutableProject.snapshot(p).withRevision(_revision + 1);
  Set<Uint8List> _owned({
    ProjectBundle? current,
    List<ProjectBundle>? history,
  }) => _buffers([
    if (!_disposed) ...[
      current ?? _current,
      ...history ?? _history,
      _confirmed,
    ],
    ..._captured.map((h) => h._bundle),
  ])..addAll(_preparing.expand((frame) => frame));
  void _reconcile() {
    _ownership.retain(_owned());
    if (_disposed && _captured.isEmpty && _preparing.isEmpty) {
      _ownership.close();
      _control.release();
    }
  }

  List<ProjectBundle> _bounded(ProjectBundle next) {
    final history = [..._history, _current];
    while (history.length > _historyLimit) {
      history.removeAt(0);
    }
    while (_bytes([next, ...history]) > _historyBytes && history.length > 1) {
      history.removeAt(0);
    }
    if (_bytes([next, ...history]) > _historyBytes) {
      throw const CapacityExceeded();
    }
    // Each retained position is restored after the entries newer than it.
    // Canonical revision bytes grow even when all restored content is unchanged.
    // Refuse the forward action, never retain an unusable promised reversal.
    for (var i = 0; i < history.length; i++) {
      ImmutableProject.snapshot(history[i].project).checkRevision(
        next.project.revision + history.length - i,
      );
    }
    return history;
  }

  void _publish(ProjectBundle candidate) {
    _alive();
    if (ImmutableProject.snapshot(candidate.project).sameContent(
        ImmutableProject.snapshot(project))) { return; }
    final fresh = _fresh(candidate.project);
    final next = identical(fresh, candidate.project) ? candidate : candidate.withProject(fresh);
    final history = _bounded(next);
    _ownership.reserve(_owned(current: next, history: history));
    _history
      ..clear()
      ..addAll(history);
    _current = next;
    _revision = next.project.revision;
    _changed();
    _reconcile();
  }

  void _edit(Project next) {
    _alive();
    _publish(_current.withProject(next));
  }

  static ProjectBundle _prune(ProjectBundle b) => b.retainResources([
    for (final r in [b.project.photo, b.project.logo])
      if (r != null) r.id,
  ]);
  static bool _sameRef(AssetRef? a, AssetRef b) =>
      a != null &&
      a.id == b.id &&
      a.kind == b.kind &&
      a.mediaType == b.mediaType &&
      a.width == b.width &&
      a.height == b.height &&
      a.sha256 == b.sha256;

  ProjectBundle _withEntry(ProjectBundle base, ResourceEntry entry) {
    if (entry.ref.kind == AssetKind.thumbnail) {
      throw ArgumentError('Thumbnail is not a published resource');
    }
    if (_sameRef(
      entry.ref.kind == AssetKind.photo
          ? base.project.photo
          : base.project.logo,
      entry.ref,
    )) {
      return base;
    }
    final next = entry.ref.kind == AssetKind.photo
        ? base.project.withPhoto(entry.ref)
        : base.project.withLogo(entry.ref);
    // Assemble only final referenced storage. No invalid null-reference project,
    // public manifest, intermediate bundle, or extra domain model is constructed.
    return base.withReferencedResource(entry, project: next);
  }

  void attachResource(ResourceEntry entry) {
    _alive();
    if (_sameRef(
      entry.ref.kind == AssetKind.photo ? project.photo : project.logo,
      entry.ref,
    )) {
      return;
    }
    final source = _current;
    _prepareEntry(source, entry, () => _withEntry(source, entry));
  }

  void _prepareEntry(
    ProjectBundle source,
    ResourceEntry entry,
    ProjectBundle Function() build,
  ) {
    // The pruned candidate uses incoming storage and the unchanged referenced
    // sibling, even when its authenticated digest needs no new crypto work.
    final sibling = entry.ref.kind == AssetKind.photo
        ? source.project.logo
        : source.project.photo;
    _prepareResources(
      [entry.bytes, if (sibling != null) source.resources[sibling.id]!],
      build,
      _publish,
    );
  }

  void _prepareResources(
    Iterable<Uint8List> dependencies,
    ProjectBundle Function() build,
    void Function(ProjectBundle) publish,
  ) {
    final before = generation;
    if (_preparing.length >= WorkLimits.preparationFrames) { throw const CapacityExceeded(); }
    final frame = HashSet<Uint8List>.identity();
    for (final bytes in dependencies) {
      if (frame.length >= WorkLimits.packageEntries && !frame.contains(bytes)) {
        throw const CapacityExceeded();
      }
      frame.add(bytes);
    }
    _preparing.add(frame);
    try {
      _ownership.reserve(_owned()); // Exact identity union; no buffer copy.
      final candidate = build();
      _alive();
      if (generation != before) {
        throw StateError('Session changed during resource preparation');
      }
      publish(candidate);
    } finally {
      // Synchronous nested frames have already unwound their own finally.
      _preparing.removeLast();
      _reconcile();
    }
  }

  CapturedSnapshot captureSnapshot() {
    _alive();
    if (_captured.length >= WorkLimits.capturedSnapshots) { throw const CapacityExceeded(); }
    final ticket = AdmissionBudget.shared.reserve(1024);
    final result = CapturedSnapshot._(this, _current, generation, _epoch, ticket);
    _captured.add(result);
    return result;
  }

  void dispose() {
    if (_disposed) return;
    _disposed = true;
    _history.clear();
    _issued.clear();
    _changed();
    // Drop internal encoded-storage references, not merely their charge. Only
    // explicitly live captures remain managed after disposal.
    _current = _retired;
    _confirmed = _retired;
    _baseline = ImmutableProject.snapshot(_retired.project);
    _hasConfirmed = false;
    _reconcile();
  }

  void setLogoScale(double value) {
    final old = project.style;
    final style = ProjectStyle(
      ink: old.ink,
      accent: old.accent,
      paper: old.paper,
      bodyPx: old.bodyPx,
      logoScale: value,
    );
    if (old.logoScale == value) return;
    _edit(project.withStyle(style));
  }

  void setCrop(ExportFormat format, NormalizedRect rect) {
    final old = project.cropByFormat[format];
    if (old != null &&
        old.left == rect.left &&
        old.top == rect.top &&
        old.width == rect.width &&
        old.height == rect.height) {
      return;
    }
    _edit(project.withCrop(format, rect));
  }

  void applyProfile(
    CompanyProfile profile,
    Iterable<AppLocale> selectedLocales,
  ) {
    _alive();
    final selected = <AppLocale>[];
    for (final locale in selectedLocales) {
      if (selected.length >= AppLocale.values.length) { throw const CapacityExceeded(); }
      selected.add(locale);
    }
    if (selected.toSet().length != selected.length ||
        selected.any((l) => !project.localeOrder.contains(l))) {
      throw ArgumentError('Invalid profile locale selection');
    }
    final ids = [
      ...project.contactIds,
      ...profile.contacts.keys.where((c) => !project.contactIds.contains(c)),
    ];
    validateIds(ids, WorkLimits.contacts);
    final old = project.style;
    final c = profile.colours;
    // CompanyProfile is final and copies/validates logo, colours and contacts at
    // birth. Selection and the ordered contact union were fully checked above.
    // Compare the actual publication result before any new domain/revision birth.
    // An unselected new empty contact is still a structural change.
    var unchanged = ids.length == project.contactIds.length &&
        (c['ink'] ?? old.ink) == old.ink &&
        (c['accent'] ?? old.accent) == old.accent &&
        (c['paper'] ?? old.paper) == old.paper &&
        (profile.logo == null || _sameRef(project.logo, profile.logo!.ref));
    if (unchanged) {
      for (final locale in selected) {
        final contacts = project.edition(locale).contacts;
        for (final entry in profile.contacts.entries) {
          if (contacts[entry.key] != entry.value) {
            unchanged = false;
            break;
          }
        }
        if (!unchanged) { break; }
      }
    }
    if (unchanged) { return; }
    final style = ProjectStyle(
      ink: c['ink'] ?? old.ink,
      accent: c['accent'] ?? old.accent,
      paper: c['paper'] ?? old.paper,
      bodyPx: old.bodyPx,
      logoScale: old.logoScale,
    );
    final next = ImmutableProject(
      id: project.id,
      revision: _revision + 1,
      name: project.name,
      photo: project.photo,
      logo: profile.logo?.ref ?? project.logo,
      cropByFormat: project.cropByFormat,
      contactIds: ids,
      localeOrder: project.localeOrder,
      sections: project.sections,
      style: style,
      editions: {
        for (final l in project.localeOrder)
          l: Edition(
            headline: project.edition(l).headline,
            location: project.edition(l).location,
            contacts: {
              for (final id in ids)
                id: selected.contains(l) && profile.contacts.containsKey(id)
                    ? profile.contacts[id]!
                    : project.edition(l).contacts[id] ?? '',
            },
          ),
      },
    );
    // The fully validated manual candidate still applies when an equal logo's
    // independently owned input bytes are unused. Reuse current authenticated
    // storage before provisional reservation, not inside _withEntry afterward.
    if (profile.logo == null || _sameRef(project.logo, profile.logo!.ref)) {
      _publish(_current.withProject(next));
    } else {
      final source = _current;
      _prepareEntry(
        source,
        profile.logo!,
        () => source.withReferencedResource(profile.logo!, project: next),
      );
    }
  }

  void setHeadline(AppLocale locale, String text) {
    final old = project.edition(locale);
    validateText(text);
    if (old.headline == text) return;
    _edit(project.withHeadline(locale, text));
  }

  void setLocation(AppLocale locale, String text) {
    final old = project.edition(locale);
    validateText(text);
    if (old.location == text) return;
    _edit(project.withLocation(locale, text));
  }

  void setName(String name) {
    final old = project.name;
    validateText(name);
    if (old == name) return;
    _edit(project.withName(name));
  }

  void setContact(AppLocale locale, String id, String text) {
    final old = project.edition(locale);
    validateId(id);
    validateText(text);
    // Absent ID + empty text still creates a shared structural contact slot.
    if (old.contacts.containsKey(id) && old.contacts[id] == text) return;
    _edit(project.withContact(locale, id, text));
  }

  Section _section(String id) {
    validateId(id);
    return project.sections.firstWhere(
      (s) => s.id == id,
      orElse: () => throw ArgumentError('Unknown section'),
    );
  }

  SectionItem _item(Section s, String id) {
    validateId(id);
    return s.items.firstWhere(
      (i) => i.id == id,
      orElse: () => throw ArgumentError('Unknown item'),
    );
  }

  Section _sectionCopy(
    Section s, {
    bool? visible,
    Map<AppLocale, String>? titles,
    List<SectionItem>? items,
  }) => Section(
    id: s.id,
    visible: visible ?? s.visible,
    titleByLocale: titles ?? s.titleByLocale,
    items: items ?? s.items,
  );
  void _updateSection(Section next) => _edit(
    project.withSections([
      for (final s in project.sections)
        if (s.id == next.id) next else s,
    ]),
  );
  void addSection(String id) =>
      _edit(project.withSections([...project.sections, Section(id: id)]));
  void addItem(String sectionId, String itemId) {
    final s = _section(sectionId);
    _updateSection(
      _sectionCopy(
        s,
        items: [
          ...s.items,
          SectionItem(id: itemId),
        ],
      ),
    );
  }

  void setSectionTitle(AppLocale locale, String sectionId, String text) {
    project.edition(locale);
    final s = _section(sectionId);
    validateText(text);
    if (s.title(locale) == text) return;
    _updateSection(_sectionCopy(s, titles: {...s.titleByLocale, locale: text}));
  }

  void setItemText(
    AppLocale locale,
    String sectionId,
    String itemId,
    String text,
  ) {
    project.edition(locale);
    final s = _section(sectionId);
    final item = _item(s, itemId);
    validateText(text);
    if (item.text(locale) == text) return;
    _updateSection(
      _sectionCopy(
        s,
        items: [
          for (final i in s.items)
            if (i.id == itemId)
              SectionItem(
                id: i.id,
                textByLocale: {...item.textByLocale, locale: text},
              )
            else
              i,
        ],
      ),
    );
  }

  List<T> _move<T>(List<T> values, int source, int target) {
    if (target < 0 || target >= values.length) {
      throw ArgumentError('Invalid final index');
    }
    final result = [...values];
    final item = result.removeAt(source);
    result.insert(target, item);
    return result;
  }

  void moveSection(String id, int targetIndex) {
    final s = _section(id);
    final source = project.sections.indexOf(s);
    final next = _move(project.sections, source, targetIndex);
    if (source == targetIndex) return;
    _edit(project.withSections(next));
  }

  void moveItem(String sectionId, String itemId, int targetIndex) {
    final s = _section(sectionId);
    final i = _item(s, itemId);
    final source = s.items.indexOf(i);
    final next = _move(s.items, source, targetIndex);
    if (source == targetIndex) return;
    _updateSection(_sectionCopy(s, items: next));
  }

  void setSectionVisible(String id, bool visible) {
    final s = _section(id);
    if (s.visible == visible) return;
    _updateSection(_sectionCopy(s, visible: visible));
  }

  void addLocale(AppLocale locale) => _edit(project.withLocale(locale));

  String _key(_RemovalKind kind, String id, [String? itemId]) =>
      '${kind.name}/$id/${itemId ?? ''}';
  RemovalImpact _issue(
    _RemovalKind kind,
    String id,
    List<String> fields,
    List<AppLocale> locales, [
    String? itemId,
  ]) {
    final key = _key(kind, id, itemId);
    if (!_issued.containsKey(key) && _issued.length >= WorkLimits.removalImpacts) {
      throw const CapacityExceeded();
    }
    if (fields.length > 118 || locales.length > AppLocale.values.length) { throw const CapacityExceeded(); }
    var units = key.length + project.id.length;
    for (final field in fields) { units += field.length; }
    final ticket = AdmissionBudget.shared.reserve(2048 + 4 * units + 256 * fields.length);
    try {
    final result = RemovalImpact._(
      this,
      key,
      project.id,
      project.revision,
      generation,
      locales,
      fields,
      alwaysConfirm: kind == _RemovalKind.locale,
    );
    // Either readonly copied list can escape independently of this DTO.
    // Returning the parent's credit must wait until every such target is dead.
    ticket.retainAll([
      result,
      result.affectedLocales,
      result.affectedFields,
    ]);
    _issued[key] = result;
    return result;
    } catch (_) { ticket.release(); rethrow; }
  }

  void _checkImpact(
    _RemovalKind kind,
    String id,
    RemovalImpact? explicit, [
    String? itemId,
  ]) {
    final key = _key(kind, id, itemId);
    final impact = explicit ?? _issued[key];
    if (impact == null ||
        !identical(impact._owner, this) ||
        impact._key != key ||
        !identical(_issued[key], impact) ||
        impact.projectId != project.id ||
        impact.revision != project.revision ||
        impact.sessionGeneration != generation) {
      throw StateError('Missing or stale removal confirmation');
    }
  }

  RemovalImpact requestRemoveItem(String sectionId, String itemId) {
    final i = _item(_section(sectionId), itemId);
    final locales = [
      for (final l in project.localeOrder)
        if (i.text(l).isNotEmpty) l,
    ];
    return _issue(
      _RemovalKind.item,
      sectionId,
      [
        for (final l in locales)
          '${l.code}/sections/$sectionId/items/$itemId/text',
      ],
      locales,
      itemId,
    );
  }

  void confirmRemoveItem(
    String sectionId,
    String itemId, {
    RemovalImpact? impact,
  }) {
    final s = _section(sectionId);
    _item(s, itemId);
    _checkImpact(_RemovalKind.item, sectionId, impact, itemId);
    _updateSection(
      _sectionCopy(s, items: s.items.where((i) => i.id != itemId).toList()),
    );
  }

  void _sectionFields(Section s, AppLocale locale, List<String> fields) {
    if (s.title(locale).isNotEmpty) {
      fields.add('${locale.code}/sections/${s.id}/title');
    }
    for (final i in s.items) {
      if (i.text(locale).isNotEmpty) {
        fields.add('${locale.code}/sections/${s.id}/items/${i.id}/text');
      }
    }
  }

  RemovalImpact requestRemoveSection(String id) {
    final s = _section(id);
    final fields = <String>[];
    final locales = <AppLocale>[];
    for (final l in project.localeOrder) {
      final count = fields.length;
      _sectionFields(s, l, fields);
      if (fields.length != count) locales.add(l);
    }
    return _issue(_RemovalKind.section, id, fields, locales);
  }

  void confirmRemoveSection(String id, {RemovalImpact? impact}) {
    _section(id);
    _checkImpact(_RemovalKind.section, id, impact);
    _edit(
      project.withSections(project.sections.where((s) => s.id != id).toList()),
    );
  }

  void _removableLocale(AppLocale locale) {
    project.edition(locale);
    if (project.localeOrder.length == 1) {
      throw ArgumentError('Cannot remove last locale');
    }
  }

  RemovalImpact requestRemoveLocale(AppLocale locale) {
    _removableLocale(locale);
    final fields = <String>[];
    final e = project.edition(locale);
    if (e.headline.isNotEmpty) fields.add('${locale.code}/headline');
    if (e.location.isNotEmpty) fields.add('${locale.code}/location');
    for (final c in project.contactIds) {
      if (e.contacts[c]!.isNotEmpty) fields.add('${locale.code}/contacts/$c');
    }
    for (final s in project.sections) {
      _sectionFields(s, locale, fields);
    }
    return _issue(
      _RemovalKind.locale,
      locale.code,
      fields,
      fields.isEmpty ? [] : [locale],
    );
  }

  void confirmRemoveLocale(AppLocale locale, {RemovalImpact? impact}) {
    _removableLocale(locale);
    _checkImpact(_RemovalKind.locale, locale.code, impact);
    _edit(project.withoutLocale(locale));
  }

  void undo() {
    _alive();
    if (!canUndo) throw StateError('No undo');
    final next = _history.last.withProject(_fresh(_history.last.project));
    _history.removeLast();
    _current = next;
    _revision = next.project.revision;
    _changed();
    _reconcile();
  }
}

/// A real-session, synchronous transition permit, not a persistence receipt.
/// Only a single active attempt may complete. Save acknowledgement stays deferred
/// until callback success AND the captured state is still exactly current.
final class LeaveAttempt {
  LeaveAttempt._(this._session, this.snapshot, this.wasDirty);
  final EditorSession _session;
  final CapturedSnapshot snapshot;
  final bool wasDirty;
  bool _cancelled = false;
  bool _ended = false;
  bool _completed = false;
  void cancel() {
    _cancelled = true;
  }

  bool complete({
    required bool discard,
    required bool saved,
    void Function()? transition,
  }) {
    if (_ended ||
        _completed ||
        _cancelled ||
        !identical(_session._activeLeave, this) ||
        !_session.isSnapshotCurrent(snapshot)) {
      return false;
    }
    if (wasDirty && !discard && (!saved || !snapshot._pendingSave)) {
      return false;
    }
    _completed = true;
    if (saved && snapshot._pendingSave) _session._confirmSaved(snapshot);
    _session._allowIdentityReplacement = true;
    try {
      transition?.call();
      return true;
    } finally {
      _session._allowIdentityReplacement = false;
    }
  }

  void end() {
    if (_ended) return;
    _ended = true;
    _cancelled = true;
    if (identical(_session._activeLeave, this)) _session._activeLeave = null;
    snapshot.release();
  }
}

/// Explicit retention protocol for export/save consumers. Bare old bundles are
/// immutable but outside session lifetime accounting. Release is idempotent.
final class CapturedSnapshot {
  CapturedSnapshot._(
    this._session,
    ProjectBundle bundle,
    this.sessionGeneration,
    this._epoch,
    this._control,
  ) : _retainedBundle = bundle,
      projectId = bundle.project.id,
      revision = bundle.project.revision;
  final EditorSession _session;
  final AdmissionTicket _control;
  ProjectBundle? _retainedBundle;
  ProjectBundle get _bundle =>
      _retainedBundle ?? (throw StateError('Snapshot released'));
  final String projectId;
  final int revision;
  final int sessionGeneration;
  final int _epoch;
  bool _projectSaveAcknowledged = false;
  bool _deferSave = false;
  bool _pendingSave = false;
  bool get projectSaveAcknowledged => _projectSaveAcknowledged;
  bool _released = false;
  bool get isReleased => _released;
  ProjectBundle get bundle {
    if (_released) throw StateError('Snapshot released');
    return _bundle;
  }

  void release() {
    if (_released) return;
    _released = true;
    _session._captured.remove(this);
    _retainedBundle = null;
    try { _session._reconcile(); } finally { _control.release(); }
  }
}

/// Each sealed bundle owns whole Uint8List buffers. Map transitions reuse that
/// exact object, not ByteBuffer getter wrappers or equal digest allocations.
final class _ResourceOwnership {
  _ResourceOwnership(this.budget);
  final WorkBudgetController budget;
  final Operation _operation = Operation.create();
  final Map<Uint8List, WorkReservation> _reservations = HashMap.identity();
  bool _closed = false;
  ProjectBundle copy(Project project, Map<String, Uint8List> input) {
    final paid = ProjectBundle.copyForOwner(project, input,
      budget: budget, operation: _operation);
    _reservations.addAll(paid.reservations);
    return paid.bundle;
  }

  void reserve(Iterable<Uint8List> buffers) {
    final added = <Uint8List>[];
    try {
      for (final b in buffers) {
        if (!_reservations.containsKey(b)) {
          _reservations[b] = budget.reserve(_operation, b.lengthInBytes);
          added.add(b);
        }
      }
    } catch (_) {
      for (final b in added) {
        _reservations.remove(b)!.release();
      }
      rethrow;
    }
  }

  void retain(Set<Uint8List> buffers) {
    for (final b
        in _reservations.keys.where((b) => !buffers.contains(b)).toList()) {
      _reservations.remove(b)!.release();
    }
  }

  void close() {
    if (_closed) return;
    _closed = true;
    retain(HashSet.identity());
    unawaited(_operation.finish());
  }
}
