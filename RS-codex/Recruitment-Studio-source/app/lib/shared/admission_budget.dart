import 'problem.dart';
import 'work_limits.dart';

/// Conservative own-data/control admission, NOT physical heap/RSS accounting.
/// A ticket has no reference to the object it pays. No callback-body protocol.
final class AdmissionBudget {
  AdmissionBudget({this.capacityBytes = WorkLimits.ordinaryAdmissionBytes}) {
    if (capacityBytes < 0 || capacityBytes > WorkLimits.ordinaryAdmissionBytes) {
      throw ArgumentError('Invalid ordinary admission capacity');
    }
  }
  static final AdmissionBudget shared = AdmissionBudget();
  final int capacityBytes;
  int _bytes = 0, _tickets = 0;
  int get reservedBytes => _bytes;
  int get ticketCount => _tickets;
  AdmissionTicket reserve(int bytes) {
    if (bytes < 0) { throw ArgumentError('Negative admission'); }
    if (_tickets >= WorkLimits.admissionTickets || bytes > capacityBytes - _bytes) {
      throw const CapacityExceeded();
    }
    _bytes += bytes;
    _tickets++;
    return AdmissionTicket._(this, bytes);
  }
}

final class AdmissionTicket {
  AdmissionTicket._(this._budget, this.bytes);
  final AdmissionBudget _budget;
  final int bytes;
  bool _released = false;
  bool get isActive => !_released;
  bool get isApplicationCredit => identical(_budget, AdmissionBudget.shared);
  static final Finalizer<AdmissionTicket> _finalizer = Finalizer((ticket) {
    ticket.release();
  });
  /// For immutable caller-retained ordinary graphs. Collection timing is not
  /// assumed; a delayed finalizer can only retain credit and refuse new work.
  void retain(Object owner) { _finalizer.attach(owner, this); }
  static final Finalizer<_RetentionGroup> _graphFinalizer = Finalizer((group) {
    if (--group.remaining == 0) { group.ticket.release(); }
  });
  /// Every independent copied collection can escape through an existing getter.
  /// A group token keeps no target references; payment lasts through all aliases.
  void retainAll(Iterable<Object> owners) {
    final group = _RetentionGroup(this);
    var count = 0;
    try {
      for (final owner in owners) {
        if (++count > WorkLimits.parserNodes) { throw const CapacityExceeded(); }
        group.remaining++;
        _graphFinalizer.attach(owner, group);
      }
    } catch (_) { release(); rethrow; }
    finally { if (--group.remaining == 0) { release(); } }
  }
  void retainGraph(Object graph) {
    final group = _RetentionGroup(this);
    var count = 0;
    void visit(Object? value, int depth) {
      if (value is! Map && value is! List) { return; }
      if (depth > WorkLimits.manifestDepth || ++count > WorkLimits.parserNodes) {
        throw const CapacityExceeded();
      }
      group.remaining++;
      _graphFinalizer.attach(value!, group);
      if (value is Map) {
        for (final child in value.values) { visit(child, depth + 1); }
      } else {
        for (final child in value as List) { visit(child, depth + 1); }
      }
    }
    try { visit(graph, 1); }
    catch (_) { release(); rethrow; }
    finally { if (--group.remaining == 0) { release(); } }
  }
  void release() {
    if (_released) { return; }
    _released = true;
    _budget._bytes -= bytes;
    _budget._tickets--;
  }
}

/// Same application worker slot across media/package/render registries. This
/// token pays bounded ports, listeners, messages and codec control tables.
final class WorkerAdmission {
  WorkerAdmission._(this._ticket);
  static int _live = 0;
  final AdmissionTicket _ticket;
  bool _released = false;
  static WorkerAdmission acquire() {
    if (_live >= WorkLimits.workers) { throw const CapacityExceeded(); }
    final ticket = AdmissionBudget.shared.reserve(256 * 1024);
    _live++;
    return WorkerAdmission._(ticket);
  }
  void release() {
    if (_released) { return; }
    _released = true;
    _live--;
    _ticket.release();
  }
}

final class _RetentionGroup {
  _RetentionGroup(this.ticket);
  final AdmissionTicket ticket;
  int remaining = 1;
}
