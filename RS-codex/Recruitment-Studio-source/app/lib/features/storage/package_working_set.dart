import '../../shared/problem.dart';
import '../../shared/work_limits.dart';
import 'package_zip_io.dart';

/// Reservas lógicas conservadoras, não medições de RSS nem máximos atingidos.
/// O envelope ordinário é pago no domínio16MiB separado dos buffers pesados.
abstract final class PackageWorkingSet {
  static const int metadataEnvelope = 8 * 1024 * 1024;
  static final RegExp _asset = RegExp(r'assets/[0-9a-f]{64}\.(?:jpg|png)');

  static int _entryCap(String name) {
    if (name == 'manifest.json') return WorkLimits.manifestUtf8Bytes;
    if (name == 'thumbnail.png') return WorkLimits.thumbnailBytes;
    final match = _asset.matchAsPrefix(name);
    if (match == null || match.end != name.length) {
      throw const PackageFailure('unsafe entry name');
    }
    // O índice ainda não conhece a função photo/logo. O gate de AssetRef
    // posterior conserva o limite mais pequeno do logótipo.
    return WorkLimits.photoBytes;
  }

  static void _checkEntry(PackageZipEntry entry) {
    final cap = _entryCap(entry.name);
    if (entry.expandedSize < 0 || entry.expandedSize > cap ||
        entry.compressedSize < 0 ||
        entry.compressedSize > WorkLimits.projectCompressedBytes) {
      throw const CapacityExceeded();
    }
    if ((entry.method != 0 && entry.method != 8) ||
        (entry.method == 0 && entry.compressedSize != entry.expandedSize)) {
      throw const PackageFailure('unsupported entry dimensions');
    }
  }

  /// Quatro creators: compressed-parent, compressed-transfer,
  /// expanded-worker e expanded-transfer. materialize/view é alias, não cópia.
  /// STORE pode partilhar compressed/expanded e fica conservadoramente pago.
  static int workerBackingUpperBound(PackageZipEntry entry) {
    _checkEntry(entry);
    return 2 * entry.compressedSize + 2 * entry.expandedSize;
  }

  /// Mantém a admissão histórica 3E+2C. O E adicional é slack/futura cópia,
  /// não uma terceira backing simultânea supostamente criada por materialize.
  static int entryReservation(PackageZipEntry entry) {
    _checkEntry(entry);
    return 3 * entry.expandedSize + 2 * entry.compressedSize;
  }

  /// Payload anterior <=E; worker corrente <=2e+2c. A cópia posterior do
  /// bundle pode duplicar dois IDs que partilhem um payload: <=2E de cópias.
  /// Cada fase fica coberta por 3E+2C, sem afirmar que todas coexistem.
  /// Envelope ordinário index8MiB e reservas media/consumidor são adicionais.
  static int inspectionReservation(ZipContainer container) {
    if (container.entries.isEmpty ||
        container.entries.length > WorkLimits.packageEntries ||
        !container.entries.containsKey('manifest.json')) {
      throw const PackageFailure('invalid container accounting');
    }
    var expanded = 0, compressed = 0, maxCompressed = 0;
    for (final pair in container.entries.entries) {
      if (pair.key != pair.value.name) {
        throw const PackageFailure('invalid container accounting');
      }
      _checkEntry(pair.value);
      expanded += pair.value.expandedSize;
      compressed += pair.value.compressedSize;
      if (expanded > WorkLimits.projectExpandedBytes ||
          compressed > WorkLimits.projectCompressedBytes) {
        throw const CapacityExceeded();
      }
      if (pair.value.compressedSize > maxCompressed) {
        maxCompressed = pair.value.compressedSize;
      }
    }
    if (expanded != container.expandedBytes ||
        maxCompressed != container.maxCompressedEntry) {
      throw const PackageFailure('invalid container accounting');
    }
    return 3 * expanded + 2 * maxCompressed;
  }
}
