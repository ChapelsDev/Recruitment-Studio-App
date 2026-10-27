import '../../shared/work_limits.dart';
import '../../shared/admission_budget.dart';
import 'project.dart';
import 'project_bundle.dart';

/// Explicit partial company data; no persistence or automatic application.
/// Absent elements mean unchanged, not removal. All supplied values are copied.
final class CompanyProfile {
  factory CompanyProfile({ResourceEntry? logo, Map<String, int> colours = const {},
    Map<String, String> contacts = const {}}) {
    if (logo != null && logo.ref.kind != AssetKind.logo) {
      throw ArgumentError('Profile resource must be a logo');
    }
    if (colours.length > 3 || colours.keys.any((k) => !const {'ink', 'accent', 'paper'}.contains(k)) ||
        colours.values.any((v) => v < 0 || v > 0xffffffff)) {
      throw ArgumentError('Invalid partial profile colours');
    }
    validateIds(contacts.keys, WorkLimits.contacts);
    var units = 0;
    for (final entry in contacts.entries) {
      validateText(entry.value); units += entry.key.length + entry.value.length;
    }
    final ticket = AdmissionBudget.shared.reserve(2048 + 512 * (colours.length + contacts.length) + 4 * units);
    try {
      final result = CompanyProfile._(logo, Map.unmodifiable(colours), Map.unmodifiable(contacts));
      ticket.retainAll([result, result.colours, result.contacts]); return result;
    } catch (_) { ticket.release(); rethrow; }
  }
  CompanyProfile._(this.logo, this.colours, this.contacts);
  final ResourceEntry? logo;
  final Map<String, int> colours;
  final Map<String, String> contacts;
}
