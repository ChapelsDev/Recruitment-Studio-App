import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:flutter/services.dart';

import '../../app_bootstrap.dart';

/// Authenticated cmap and face identities of this application's local fonts.
/// The manifest pin binds the deterministic FontTools cmap, name and OS/2
/// weight extraction to the canonical font bytes. No substitute is admitted.
final class FontFace {
  FontFace._(this.asset, this.family, this.weight, Iterable<int> codepoints)
    : codepoints = Set.unmodifiable(codepoints);

  final String asset;
  final String family;
  final int weight;
  final Set<int> codepoints;

  List<int> unsupported(String text) => List.unmodifiable(
    text.runes
        .where((r) => r != 10 && r != 13 && !codepoints.contains(r))
        .toSet(),
  );
}

final class FontCatalog {
  FontCatalog._(Iterable<FontFace> faces) : faces = List.unmodifiable(faces);

  static FontCatalog? _bundled;
  static FontCatalog get bundled =>
      _bundled ??
      (throw StateError('Load bundled FontCatalog before composing'));

  static const _coverageDigest =
      'ea08f79cfe6cbdfa4e3e26f507fe95c8940e07bc160ad46741bff1c79706e589';
  final List<FontFace> faces;

  FontFace face(String family, int weight) => faces.firstWhere(
    (face) => face.family == family && face.weight == weight,
    orElse: () => throw StateError('No bundled face for $family/$weight'),
  );

  /// Verifies every input before registering any face. Errors propagate;
  /// a failed custom bundle cannot replace an already loaded catalog.
  static Future<FontCatalog> load({AssetBundle? bundle}) async {
    final source = bundle ?? rootBundle;
    final data = await source.load('assets/fonts/font-coverage.json');
    final bytes = data.buffer.asUint8List(
      data.offsetInBytes,
      data.lengthInBytes,
    );
    if (sha256.convert(bytes).toString() != _coverageDigest) {
      throw StateError('Bundled font cmap identity mismatch');
    }
    final manifest = jsonDecode(utf8.decode(bytes)) as Map<String, dynamic>;
    final faces = <FontFace>[];
    final verifiedBytes = <String, ByteData>{};
    for (final record in manifest['faces'] as List<dynamic>) {
      final map = record as Map<String, dynamic>;
      final asset = map['asset'] as String;
      final font = await source.load(asset);
      final raw = Uint8List.fromList(
        font.buffer.asUint8List(font.offsetInBytes, font.lengthInBytes),
      );
      if (sha256.convert(raw).toString() != map['sha256']) {
        throw StateError('Bundled font byte identity mismatch: $asset');
      }
      verifiedBytes[asset] = ByteData.sublistView(raw);
      faces.add(
        FontFace._(
          asset,
          map['family'] as String,
          map['weight'] as int,
          (map['codepoints'] as List<dynamic>).cast<int>(),
        ),
      );
    }
    await loadBundledFonts(bundle: _VerifiedFonts(verifiedBytes));
    final catalog = FontCatalog._(faces);
    if (bundle == null) {
      _bundled = catalog;
    }
    return catalog;
  }
}

final class _VerifiedFonts extends CachingAssetBundle {
  _VerifiedFonts(this.bytes);
  final Map<String, ByteData> bytes;
  @override
  Future<ByteData> load(String key) async => bytes[key]!;
}
