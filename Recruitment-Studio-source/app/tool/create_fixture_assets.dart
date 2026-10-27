import 'dart:io';

import 'package:image/image.dart' as image;
import 'package:recruitment_studio/shared/work_limits.dart';

/// Deterministic geometric test assets only. Never production/company imagery.
Future<void> createFixtureAssets() async {
  final photo = image.Image(width: 640, height: 480);
  for (var y = 0; y < photo.height; y++) {
    for (var x = 0; x < photo.width; x++) {
      photo.setPixelRgb(
        x,
        y,
        (x ~/ 40) * 12,
        (y ~/ 40) * 16,
        ((x + y) ~/ 40) * 8,
      );
    }
  }
  final logo = image.Image(width: 128, height: 128, numChannels: 4);
  for (var y = 32; y < 96; y++) {
    for (var x = 32; x < 96; x++) {
      logo.setPixelRgba(x, y, 32, 91, 80, 255);
    }
  }
  final directory = Directory('test/fixtures/assets');
  await directory.create(recursive: true);
  await File('${directory.path}/photo.jpg')
      .writeAsBytes(image.encodeJpg(photo, quality: WorkLimits.jpgQuality));
  await File('${directory.path}/logo.png').writeAsBytes(image.encodePng(logo));
}

Future<void> main() => createFixtureAssets();
