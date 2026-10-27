part of 'project_bundle.dart';

// Origin is minted only after a real defensive copy into privately allocated
// immutable full backing. A caller's readonly view or matching digest cannot
// manufacture it. Expando values keep no resource bytes/owner/token alive.
final Expando<_BackingOrigin> _backingOrigins = Expando<_BackingOrigin>();
final class _BackingOrigin {
  _BackingOrigin(this.length);
  final int length;
}
Uint8List _copyBacking(Uint8List bytes) {
  final ordinary = AdmissionBudget.shared.reserve(1024);
  try {
    final owned = Uint8List.fromList(bytes).asUnmodifiableView();
    _backingOrigins[owned] = _BackingOrigin(owned.lengthInBytes);
    // The raw byte wrapper can outlive ResourceEntry or the bundle's map.
    // Origin metadata therefore has its own wrapper-retained ordinary credit.
    ordinary.retain(owned);
    return owned;
  } catch (_) { ordinary.release(); rethrow; }
}

bool _knownBacking(Uint8List bytes) {
  final origin = _backingOrigins[bytes];
  return origin != null && origin.length == bytes.lengthInBytes &&
      bytes.offsetInBytes == 0 && bytes.buffer.lengthInBytes == bytes.lengthInBytes;
}
Uint8List _paidBackingView(Uint8List bytes, WorkReservation destination,
    WorkBudgetController budget) {
  final origin = _backingOrigins[bytes];
  if (!_knownBacking(bytes) || origin == null ||
      !destination.coversCopy(budget, bytes.lengthInBytes)) {
    throw StateError('Invalid owned backing adoption');
  }
  // Distinct legacy bundle identity, same private immutable physical backing.
  // The exact destination's active same-domain prepayment is checked BEFORE
  // creating the view. No second buffer is created or falsely charged as a copy.
  final ordinary = AdmissionBudget.shared.reserve(1024);
  try {
    final view = Uint8List.view(bytes.buffer, 0, bytes.lengthInBytes).asUnmodifiableView();
    _backingOrigins[view] = _BackingOrigin(origin.length);
    ordinary.retain(view);
    return view;
  } catch (_) { ordinary.release(); rethrow; }
}
