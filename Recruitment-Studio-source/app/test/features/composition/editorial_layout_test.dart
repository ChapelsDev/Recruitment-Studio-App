import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/painting.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/features/composition/editorial_layout.dart';
import 'package:recruitment_studio/features/composition/export_format.dart';
import 'package:recruitment_studio/features/composition/font_catalog.dart';
import 'package:recruitment_studio/features/composition/layout_scene.dart';
import 'package:recruitment_studio/features/composition/variant_validator.dart';
import 'package:recruitment_studio/features/projects/project.dart';
import 'package:recruitment_studio/shared/problem.dart';
import 'package:recruitment_studio/shared/work_limits.dart';

import 'composition_test_fixtures.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late FontCatalog fonts;
  setUpAll(() async {
    fonts = await FontCatalog.load();
  });

  for (final format in ExportFormat.values) {
    for (final trigger in [
      'positive distorted aspect',
      'positive rounded crop escape',
    ]) {
      test('T04 represented-cover-01 ${format.name} $trigger', () {
        final crop = trigger == 'positive distorted aspect'
            ? NormalizedRect(left: 0.1, top: 0.1, width: 1e-16, height: 0.8)
            : NormalizedRect(left: 0.1, top: 0, width: 5e-17, height: 0.8);
        final project = compositionFixture().withCrop(format, crop);
        final before = project.toManifestJson();
        final layout = EditorialLayout(fonts: fonts);
        for (final locale in AppLocale.values) {
          final scene = layout.compose(project, locale, format);
          try {
            final errors = scene.problems
                .where((p) => p.severity == ProblemSeverity.error)
                .toList();
            expect(
              errors,
              hasLength(1),
              reason: 'missing scoped invalidResource ERROR for $trigger',
            );
            final problem = errors.single;
            expect(problem.code, ProblemCode.invalidResource);
            expect(problem.field, 'photo');
            expect(problem.sectionId, isNull);
            expect(problem.locale, locale);
            expect(problem.format, format);
            expect(problem.actionLabel.trim(), isNotEmpty);
            expect(problem.actionLabel.toLowerCase(), contains('recorte'));
            expect(
              problem.actionLabel.toLowerCase(),
              anyOf(contains('alargar'), contains('repor')),
            );
            expect(scene.ops.whereType<PhotoOp>(), isEmpty);
            expect(
              scene.problems.where(
                (p) => p.code == ProblemCode.insufficientResolution,
              ),
              isEmpty,
            );
            expect(scene.textRuns, [
              manualHeadlines[locale],
              'São João – Zürich',
              'Prática œuvre',
              'Müller-São João',
              'Ética e precisão',
              '${locale.code}@invalid.test',
            ]);
            expect(scene.ops.whereType<TextOp>(), hasLength(6));
            expect(scene.ops.whereType<LogoOp>(), hasLength(1));
            final validated = VariantValidator(layout: layout)
                .validate(project, locale, format);
            expect(validated, hasLength(1));
            final validatedProblem = validated.single;
            expect(validatedProblem.code, ProblemCode.invalidResource);
            expect(validatedProblem.severity, ProblemSeverity.error);
            expect(validatedProblem.field, 'photo');
            expect(validatedProblem.sectionId, isNull);
            expect(validatedProblem.locale, locale);
            expect(validatedProblem.format, format);
            expect(validatedProblem.actionLabel, problem.actionLabel);
            expect(project.toManifestJson(), before);
          } finally {
            scene.dispose();
            scene.dispose();
            expect(scene.isDisposed, isTrue);
            expect(
              scene.ops.whereType<TextOp>().every((op) => op.isDisposed),
              isTrue,
            );
            expect(project.toManifestJson(), before);
          }
        }
      });
    }
    for (final control in [
      'same tiny extent drawable at zero origin',
      'ordinary fractional drawable crop',
    ]) {
      test('T04 represented-cover-01 ${format.name} $control', () {
        final tiny = control == 'same tiny extent drawable at zero origin';
        final fixture = compositionFixture();
        final crop = tiny
            ? NormalizedRect(left: 0, top: 0, width: 1e-16, height: 1e-16)
            : NormalizedRect(
                left: 0.173,
                top: 0.211,
                width: 0.137,
                height: 0.223,
              );
        final project = fixture.withCrop(format, crop);
        final before = project.toManifestJson();
        final layout = EditorialLayout(fonts: fonts);
        for (final locale in AppLocale.values) {
          final scene = layout.compose(project, locale, format);
          try {
            expect(
              scene.problems.where((p) => p.severity == ProblemSeverity.error),
              isEmpty,
            );
            expect(scene.ops.whereType<PhotoOp>(), hasLength(1));
            final photo = scene.ops.whereType<PhotoOp>().single;
            final source = photo.sourceRect;
            expect(source.isFinite, isTrue);
            expect(source.isEmpty, isFalse);
            expect(source.width, greaterThan(0));
            expect(source.height, greaterThan(0));
            expect(photo.asset.id, fixture.photo!.id);
            expect(photo.asset.kind, fixture.photo!.kind);
            expect(photo.asset.mediaType, fixture.photo!.mediaType);
            expect(photo.asset.sha256, fixture.photo!.sha256);
            expect(photo.asset.width, fixture.photo!.width);
            expect(photo.asset.height, fixture.photo!.height);
            expect(photo.bounds, EditorialRegions.forFormat(format).photo);
            expect(
              source.width / source.height,
              closeTo(photo.bounds.width / photo.bounds.height, 1e-9),
            );
            final raw = Rect.fromLTWH(
              crop.left * fixture.photo!.width,
              crop.top * fixture.photo!.height,
              crop.width * fixture.photo!.width,
              crop.height * fixture.photo!.height,
            );
            expect(source.center.dx, closeTo(raw.center.dx, 1e-9));
            expect(source.center.dy, closeTo(raw.center.dy, 1e-9));
            expect(source.left, greaterThanOrEqualTo(raw.left - 1e-9));
            expect(source.top, greaterThanOrEqualTo(raw.top - 1e-9));
            expect(source.right, lessThanOrEqualTo(raw.right + 1e-9));
            expect(source.bottom, lessThanOrEqualTo(raw.bottom + 1e-9));
            final warnings = scene.problems
                .where((p) => p.code == ProblemCode.insufficientResolution)
                .toList();
            expect(warnings, hasLength(1));
            {
              final warning = warnings.single;
              expect(warning.severity, ProblemSeverity.warning);
              expect(warning.field, 'photo');
              expect(warning.locale, locale);
              expect(warning.format, format);
              expect(warning.actionLabel, isNotEmpty);
            }
            expect(scene.problems, hasLength(1));
            expect(scene.textRuns, [
              manualHeadlines[locale],
              'São João – Zürich',
              'Prática œuvre',
              'Müller-São João',
              'Ética e precisão',
              '${locale.code}@invalid.test',
            ]);
            expect(scene.ops.whereType<LogoOp>(), hasLength(1));
            expect(scene.ops.whereType<TextOp>(), hasLength(6));
            final validated = VariantValidator(layout: layout)
                .validate(project, locale, format);
            expect(validated, hasLength(1));
            expect(validated.single.severity, ProblemSeverity.warning);
            expect(validated.single.field, 'photo');
            expect(validated.single.sectionId, isNull);
            expect(validated.single.locale, locale);
            expect(validated.single.format, format);
            expect(validated.single.actionLabel, warnings.single.actionLabel);
            expect(
              validated.where((p) => p.severity == ProblemSeverity.error),
              isEmpty,
            );
            expect(
              validated.where(
                (p) => p.code == ProblemCode.insufficientResolution,
              ),
              hasLength(1),
            );
            expect(project.toManifestJson(), before);
          } finally {
            scene.dispose();
            scene.dispose();
            expect(scene.isDisposed, isTrue);
            expect(
              scene.ops.whereType<TextOp>().every((op) => op.isDisposed),
              isTrue,
            );
            expect(project.toManifestJson(), before);
          }
        }
      });
    }
  }

  for (final format in ExportFormat.values) {
    for (final trigger in ['cancelled raw crop', 'subnormal cover overflow']) {
      test('T04 crop-geometry-01 ${format.name} $trigger', () {
        final crop = trigger == 'cancelled raw crop'
            ? NormalizedRect(left: 0.1, top: 0.1, width: 1e-20, height: 0.8)
            : NormalizedRect(left: 0, top: 0, width: 1e-320, height: 0.8);
        final project = compositionFixture().withCrop(format, crop);
        final before = project.toManifestJson();
        final layout = EditorialLayout(fonts: fonts);
        for (final locale in AppLocale.values) {
          final scene = layout.compose(project, locale, format);
          try {
            final errors = scene.problems
                .where((p) => p.severity == ProblemSeverity.error)
                .toList();
            expect(
              errors,
              hasLength(1),
              reason: 'missing scoped invalidResource ERROR for $trigger',
            );
            final problem = errors.single;
            expect(problem.code, ProblemCode.invalidResource);
            expect(problem.field, 'photo');
            expect(problem.sectionId, isNull);
            expect(problem.locale, locale);
            expect(problem.format, format);
            expect(problem.actionLabel.trim(), isNotEmpty);
            expect(problem.actionLabel.toLowerCase(), contains('recorte'));
            expect(
              problem.actionLabel.toLowerCase(),
              anyOf(contains('alargar'), contains('repor')),
            );
            expect(scene.ops.whereType<PhotoOp>(), isEmpty);
            expect(
              scene.problems.where(
                (p) => p.code == ProblemCode.insufficientResolution,
              ),
              isEmpty,
            );
            expect(scene.textRuns, [
              manualHeadlines[locale],
              'São João – Zürich',
              'Prática œuvre',
              'Müller-São João',
              'Ética e precisão',
              '${locale.code}@invalid.test',
            ]);
            expect(scene.ops.whereType<TextOp>(), hasLength(6));
            expect(scene.ops.whereType<LogoOp>(), hasLength(1));
            final validated = VariantValidator(layout: layout)
                .validate(project, locale, format);
            expect(validated, hasLength(1));
            final validatedProblem = validated.single;
            expect(validatedProblem.code, ProblemCode.invalidResource);
            expect(validatedProblem.severity, ProblemSeverity.error);
            expect(validatedProblem.field, 'photo');
            expect(validatedProblem.sectionId, isNull);
            expect(validatedProblem.locale, locale);
            expect(validatedProblem.format, format);
            expect(validatedProblem.actionLabel, problem.actionLabel);
            expect(project.toManifestJson(), before);
          } finally {
            scene.dispose();
            scene.dispose();
            expect(scene.isDisposed, isTrue);
            expect(
              scene.ops.whereType<TextOp>().every((op) => op.isDisposed),
              isTrue,
            );
            expect(project.toManifestJson(), before);
          }
        }
      });
    }
    for (final control in [
      'drawable low-resolution control',
      'uncropped photo control',
    ]) {
      test('T04 crop-geometry-01 ${format.name} $control', () {
        final lowResolution = control == 'drawable low-resolution control';
        final fixture = compositionFixture();
        final project = lowResolution
            ? fixture.withCrop(
                format,
                NormalizedRect(left: 0.1, top: 0.1, width: 0.05, height: 0.05),
              )
            : Project.fromManifest({
                ...fixture.toManifest(),
                'cropByFormat': <String, Object?>{},
              });
        final before = project.toManifestJson();
        final layout = EditorialLayout(fonts: fonts);
        for (final locale in AppLocale.values) {
          final scene = layout.compose(project, locale, format);
          try {
            expect(
              scene.problems.where((p) => p.severity == ProblemSeverity.error),
              isEmpty,
            );
            final photo = scene.ops.whereType<PhotoOp>().single;
            final source = photo.sourceRect;
            expect(source.isFinite, isTrue);
            expect(source.isEmpty, isFalse);
            expect(source.width, greaterThan(0));
            expect(source.height, greaterThan(0));
            expect(photo.asset.id, fixture.photo!.id);
            expect(photo.bounds, EditorialRegions.forFormat(format).photo);
            expect(
              source.width / source.height,
              closeTo(photo.bounds.width / photo.bounds.height, 1e-9),
            );
            final raw = lowResolution
                ? const Rect.fromLTWH(180, 240, 90, 120)
                : const Rect.fromLTWH(0, 0, 1800, 2400);
            expect(source.center.dx, closeTo(raw.center.dx, 1e-9));
            expect(source.center.dy, closeTo(raw.center.dy, 1e-9));
            expect(source.left, greaterThanOrEqualTo(raw.left - 1e-9));
            expect(source.top, greaterThanOrEqualTo(raw.top - 1e-9));
            expect(source.right, lessThanOrEqualTo(raw.right + 1e-9));
            expect(source.bottom, lessThanOrEqualTo(raw.bottom + 1e-9));
            final warnings = scene.problems
                .where((p) => p.code == ProblemCode.insufficientResolution)
                .toList();
            expect(warnings, hasLength(lowResolution ? 1 : 0));
            if (lowResolution) {
              final warning = warnings.single;
              expect(warning.severity, ProblemSeverity.warning);
              expect(warning.field, 'photo');
              expect(warning.locale, locale);
              expect(warning.format, format);
              expect(warning.actionLabel, isNotEmpty);
            }
            expect(scene.textRuns.first, manualHeadlines[locale]);
            expect(scene.ops.whereType<TextOp>(), hasLength(6));
            final validated = VariantValidator(layout: layout)
                .validate(project, locale, format);
            expect(
              validated.where((p) => p.severity == ProblemSeverity.error),
              isEmpty,
            );
            expect(
              validated.where(
                (p) => p.code == ProblemCode.insufficientResolution,
              ),
              hasLength(lowResolution ? 1 : 0),
            );
            expect(project.toManifestJson(), before);
          } finally {
            scene.dispose();
            scene.dispose();
            expect(scene.isDisposed, isTrue);
            expect(
              scene.ops.whereType<TextOp>().every((op) => op.isDisposed),
              isTrue,
            );
            expect(project.toManifestJson(), before);
          }
        }
      });
    }
    for (final body in WorkLimits.bodyPxChoices) {
      for (final scale in [
        WorkLimits.minimumLogoScale,
        1.0,
        WorkLimits.maximumLogoScale,
      ]) {
        test(
          'T04 ${format.name} body$body logo$scale obeys finite choices across seven manual locales',
          () {
            final project = compositionFixture(
              style: ProjectStyle(
                bodyPx: body,
                logoScale: scale,
                ink: 0xff142f58,
                paper: 0xfffafafa,
                accent: 0xff151f42,
              ),
            );
            final before = project.toManifestJson();
            for (final locale in AppLocale.values) {
              final scene = EditorialLayout(fonts: fonts)
                  .compose(project, locale, format);
              expect(scene.problems, isEmpty);
              expect(scene.textRuns.first, manualHeadlines[locale]);
              final item = scene.ops.whereType<TextOp>().firstWhere(
                (op) => op.field == 'item:item-a',
              );
              expect(item.fontSize, body.toDouble());
              expect(item.color, const Color(0xff142f58));
              final logo = scene.ops.whereType<LogoOp>().single;
              final region = EditorialRegions.forFormat(format).logo;
              expect(logo.bounds.width / logo.bounds.height, closeTo(3, 1e-9));
              expect(logo.bounds.width, lessThanOrEqualTo(region.width));
              expect(logo.bounds.height, lessThanOrEqualTo(region.height));
              expect(logo.bounds.width, greaterThan(0));
              scene.dispose();
            }
            expect(project.toManifestJson(), before);
          },
        );
      }
    }
    for (final field in ['location', 'contact:mail', 'title', 'item:real']) {
      for (final failure in ['overflow', 'glyph']) {
        test(
          'T04 ${format.name} $field $failure retains full legal manual field and scoped diagnostics',
          () {
            final text = failure == 'overflow'
                ? 'W' * WorkLimits.fieldUtf16Units
                : 'Unchanged 😀\nœ Straße';
            Project project = compositionFixture();
            if (field == 'location') {
              project = project.withLocation(AppLocale.ptPT, text);
            } else if (field == 'contact:mail') {
              project = project.withContact(AppLocale.ptPT, 'mail', text);
            } else {
              project = project.withSections([
                Section(
                  id: 'scope',
                  titleByLocale: {
                    AppLocale.ptPT: field == 'title' ? text : 'Manual',
                  },
                  items: [
                    SectionItem(
                      id: 'real',
                      textByLocale: {
                        AppLocale.ptPT: field == 'title' ? 'Manual' : text,
                      },
                    ),
                  ],
                ),
              ]);
            }
            final before = project.toManifestJson();
            final scene = EditorialLayout(fonts: fonts)
                .compose(project, AppLocale.ptPT, format);
            final code = failure == 'overflow'
                ? ProblemCode.textOverflow
                : ProblemCode.unsupportedGlyph;
            final matching = scene.problems
                .where((p) => p.code == code && p.field == field)
                .toList();
            expect(matching, hasLength(1));
            expect(
              matching.single.sectionId,
              field == 'title' || field == 'item:real' ? 'scope' : isNull,
            );
            expect(scene.textRuns, contains(text));
            expect(
              scene.ops.whereType<TextOp>().any((op) => op.field == field),
              isFalse,
            );
            expect(project.toManifestJson(), before);
            scene.dispose();
          },
        );
      }
    }
    test(
      'T04 ${format.name} maximum finite sections items and contacts overflow without overlapping fitted ops',
      () {
        final project = compositionFixture()
            .withSections([
              for (var s = 0; s < WorkLimits.sections; s++)
                Section(
                  id: 's$s',
                  titleByLocale: {AppLocale.ptPT: 'Manual $s'},
                  items: [
                    for (var i = 0; i < WorkLimits.itemsPerSection; i++)
                      SectionItem(
                        id: 'i$i',
                        textByLocale: {AppLocale.ptPT: 'œ Straße $s $i'},
                      ),
                  ],
                ),
            ])
            .withContactIds([
              for (var i = 0; i < WorkLimits.contacts; i++) 'c$i',
            ]);
        Project filled = project;
        for (final id in project.contactIds) {
          filled = filled.withContact(AppLocale.ptPT, id, '$id@invalid.test');
        }
        final scene = EditorialLayout(fonts: fonts)
            .compose(filled, AppLocale.ptPT, format);
        expect(
          scene.problems.any(
            (p) => p.code == ProblemCode.textOverflow && p.sectionId != null,
          ),
          isTrue,
        );
        expect(
          scene.problems.any(
            (p) =>
                p.code == ProblemCode.textOverflow &&
                p.field!.startsWith('contact:'),
          ),
          isTrue,
        );
        expect(
          scene.textRuns.length,
          2 +
              WorkLimits.sections * (1 + WorkLimits.itemsPerSection) +
              WorkLimits.contacts,
        );
        final textOps = scene.ops.whereType<TextOp>().toList();
        for (var i = 0; i < textOps.length; i++) {
          expect(textOps[i].bounds.bottom, lessThanOrEqualTo(format.height));
          for (var j = i + 1; j < textOps.length; j++) {
            expect(textOps[i].bounds.overlaps(textOps[j].bounds), isFalse);
          }
        }
        scene.dispose();
      },
    );
    test(
      'T04 ${format.name} real narrow-wide metrics newlines crop independence and empty omission controls',
      () {
        final original = compositionFixture();
        final narrow = EditorialLayout(fonts: fonts).compose(
          original.withHeadline(AppLocale.ptPT, 'iiii'),
          AppLocale.ptPT,
          format,
        );
        final wide = EditorialLayout(fonts: fonts).compose(
          original.withHeadline(AppLocale.ptPT, 'WWWW'),
          AppLocale.ptPT,
          format,
        );
        expect(
          narrow.ops.whereType<TextOp>().first.bounds.width,
          lessThan(wide.ops.whereType<TextOp>().first.bounds.width),
        );
        final multiline = EditorialLayout(fonts: fonts).compose(
          original.withHeadline(AppLocale.ptPT, '  São João\nœ Straße  '),
          AppLocale.ptPT,
          format,
        );
        final mainText = multiline.ops.whereType<TextOp>().first;
        expect(mainText.text, '  São João\nœ Straße  ');
        expect(mainText.lineMetrics, hasLength(2));
        final empty = original.withSections([
          Section(
            id: 'empty',
            items: [SectionItem(id: 'empty-i')],
          ),
          ...original.sections,
        ]);
        final a = EditorialLayout(fonts: fonts)
            .compose(original, AppLocale.ptPT, format);
        final b = EditorialLayout(fonts: fonts)
            .compose(empty, AppLocale.ptPT, format);
        expect(b.textRuns, a.textRuns);
        expect(b.textBounds, a.textBounds);
        final cropped = original.withCrop(
          format,
          NormalizedRect(left: 0.4, top: 0.2, width: 0.5, height: 0.6),
        );
        final cropScenes = [
          for (final locale in AppLocale.values)
            EditorialLayout(fonts: fonts).compose(cropped, locale, format),
        ];
        expect(
          cropScenes
              .map((s) => s.ops.whereType<PhotoOp>().single.sourceRect)
              .toSet(),
          hasLength(1),
        );
        expect(
          cropScenes.first.ops.whereType<PhotoOp>().single.sourceRect,
          isNot(a.ops.whereType<PhotoOp>().single.sourceRect),
        );
        final defaultPhotoProject = Project.blank(id: 'no-crop')
            .withPhoto(original.photo!)
            .withHeadline(AppLocale.ptPT, 'Manual')
            .withContact(AppLocale.ptPT, 'mail', 'test@invalid.test');
        final noCrop = EditorialLayout().compose(
          defaultPhotoProject,
          AppLocale.ptPT,
          format,
        );
        expect(noCrop.ops.whereType<LogoOp>(), isEmpty);
        expect(
          noCrop.ops.whereType<PhotoOp>().single.sourceRect.center,
          const Offset(900, 1200),
        );
        expect(
          VariantValidator().validate(original, AppLocale.ptPT, format),
          isEmpty,
        );
        for (final scene in [
          narrow,
          wide,
          multiline,
          a,
          b,
          noCrop,
          ...cropScenes,
        ]) {
          scene.dispose();
        }
      },
    );
    test(
      'T04 ${format.name} development-only preview draws retained resolved scene and verifies picture lifetime',
      () async {
        final scene = EditorialLayout(fonts: fonts)
            .compose(compositionFixture(), AppLocale.ptPT, format);
        final bytes = await developmentPreview(scene);
        expect(bytes.length, greaterThan(1000));
        final codec = await ui.instantiateImageCodec(bytes);
        final frame = await codec.getNextFrame();
        expect(frame.image.width, format.width);
        expect(frame.image.height, format.height);
        frame.image.dispose();
        codec.dispose();
        final output = Platform.environment['T04_EVIDENCE_DIR'];
        if (output != null) {
          final directory = Directory(output)..createSync(recursive: true);
          File('${directory.path}/${format.name}-pt-PT.development.png')
              .writeAsBytesSync(bytes);
          for (final locale in AppLocale.values) {
            final variant = EditorialLayout(fonts: fonts)
                .compose(compositionFixture(), locale, format);
            File('${directory.path}/${format.name}-${locale.code}.scene.json')
                .writeAsStringSync(jsonEncode(sceneEvidence(variant)));
            variant.dispose();
          }
        }
        final recorder = ui.PictureRecorder();
        final canvas = ui.Canvas(recorder);
        final first = scene.ops.whereType<TextOp>().first;
        first.paintTo(canvas);
        scene.dispose();
        expect(() => first.paintTo(canvas), throwsStateError);
        first.dispose();
        scene.dispose();
        recorder.endRecording().dispose();
      },
    );
    for (final missing in ['photo', 'headline', 'contact']) {
      test(
        'T04 validator ${format.name} requires $missing without filling manual fields',
        () {
          Project project = compositionFixture();
          if (missing == 'photo') {
            project = Project.blank(id: 'missing-photo')
                .withHeadline(AppLocale.ptPT, 'Manual')
                .withContact(AppLocale.ptPT, 'mail', 'manual@invalid.test');
          } else if (missing == 'headline') {
            project = project.withHeadline(AppLocale.ptPT, '  \n');
          } else {
            project = project.withContact(AppLocale.ptPT, 'mail', ' \n');
          }
          final before = project.toManifestJson();
          final problems = VariantValidator(
            layout: EditorialLayout(fonts: fonts),
          ).validate(project, AppLocale.ptPT, format);
          final code = {
            'photo': ProblemCode.missingPhoto,
            'headline': ProblemCode.missingHeadline,
            'contact': ProblemCode.missingContact,
          }[missing];
          final problem = problems.singleWhere((p) => p.code == code);
          expect(problem.locale, AppLocale.ptPT);
          expect(problem.format, format);
          expect(problem.field, missing == 'contact' ? 'contacts' : missing);
          expect(problem.severity, ProblemSeverity.error);
          expect(problem.actionLabel, isNotEmpty);
          expect(project.toManifestJson(), before);
          expect(() => problems.clear(), throwsUnsupportedError);
          final scene = EditorialLayout(fonts: fonts)
              .compose(project, AppLocale.ptPT, format);
          expect(scene.problems.any((p) => p.code == code), isTrue);
          scene.dispose();
        },
      );
    }
    test(
      'T04 validator ${format.name} omits hidden and empty sections and flags only orphan title',
      () {
        final project = compositionFixture().withSections([
          Section(
            id: 'hidden',
            visible: false,
            titleByLocale: {AppLocale.ptPT: '😀 hidden orphan'},
          ),
          Section(
            id: 'empty',
            titleByLocale: {AppLocale.ptPT: '  '},
            items: [
              SectionItem(id: 'blank', textByLocale: {AppLocale.ptPT: '\n'}),
            ],
          ),
          Section(
            id: 'orphan',
            titleByLocale: {AppLocale.ptPT: 'Manual orphan'},
          ),
          Section(
            id: 'untitled',
            items: [
              SectionItem(id: 'blank-2'),
              SectionItem(
                id: 'real',
                textByLocale: {AppLocale.ptPT: '  Manual Case\nœ Straße  '},
              ),
            ],
          ),
        ]);
        final before = project.toManifestJson();
        final scene = EditorialLayout(fonts: fonts)
            .compose(project, AppLocale.ptPT, format);
        expect(scene.textRuns, contains('  Manual Case\nœ Straße  '));
        expect(scene.textRuns, isNot(contains('😀 hidden orphan')));
        expect(scene.textRuns.where((t) => t.trim().isEmpty), isEmpty);
        final errors = scene.problems
            .where((p) => p.severity == ProblemSeverity.error)
            .toList();
        expect(errors, hasLength(1));
        expect(errors.single.code, ProblemCode.incompleteSection);
        expect(errors.single.sectionId, 'orphan');
        expect(errors.single.field, 'title');
        expect(
          scene.ops.whereType<TextOp>().where(
            (op) => op.sectionId == 'untitled',
          ),
          hasLength(1),
        );
        final unhidden = project.withSections([
          Section(
            id: 'hidden',
            titleByLocale: {AppLocale.ptPT: '😀 hidden orphan'},
          ),
        ]);
        final problems = VariantValidator(layout: EditorialLayout(fonts: fonts))
            .validate(unhidden, AppLocale.ptPT, format);
        expect(
          problems.any(
            (p) =>
                p.code == ProblemCode.unsupportedGlyph &&
                p.sectionId == 'hidden',
          ),
          isTrue,
        );
        expect(project.toManifestJson(), before);
        scene.dispose();
      },
    );
    test(
      'T04 validator ${format.name} gives nonblocking effective-alpha contrast and cropped-resolution warnings',
      () {
        final project =
            compositionFixture(
              style: ProjectStyle(
                ink: 0x00173e38,
                paper: 0x00f4f1e9,
                accent: 0x00205b50,
              ),
            ).withCrop(
              format,
              NormalizedRect(left: 0.1, top: 0.1, width: 0.05, height: 0.05),
            );
        final scene = EditorialLayout(fonts: fonts)
            .compose(project, AppLocale.ptPT, format);
        final warnings = scene.problems
            .where((p) => p.severity == ProblemSeverity.warning)
            .toList();
        expect(
          warnings.any(
            (p) =>
                p.code == ProblemCode.insufficientResolution &&
                p.field == 'photo',
          ),
          isTrue,
        );
        expect(
          warnings.any(
            (p) => p.code == ProblemCode.lowContrast && p.field == 'ink',
          ),
          isTrue,
        );
        expect(
          warnings.any(
            (p) => p.code == ProblemCode.lowContrast && p.field == 'accent',
          ),
          isTrue,
        );
        expect(
          warnings.every(
            (p) =>
                p.locale == AppLocale.ptPT &&
                p.format == format &&
                p.actionLabel.isNotEmpty,
          ),
          isTrue,
        );
        expect(
          scene.problems.where((p) => p.severity == ProblemSeverity.error),
          isEmpty,
        );
        expect(
          scene.ops.whereType<RectOp>().every((op) => op.color.a == 1),
          isTrue,
        );
        scene.dispose();
      },
    );
    for (final locale in AppLocale.values) {
      for (final failure in ['overflow', 'glyph']) {
        test(
          'T04 ${format.name} ${locale.code} headline $failure is scoped and preserves text',
          () {
            final text = failure == 'overflow'
                ? 'Prézision œuvre Müller-São João\n' * 40
                : 'Original 😀\nÉ Straße œ';
            final project = compositionFixture().withHeadline(locale, text);
            final before = project.toManifestJson();
            final scene = EditorialLayout(fonts: fonts)
                .compose(project, locale, format);
            final code = failure == 'overflow'
                ? ProblemCode.textOverflow
                : ProblemCode.unsupportedGlyph;
            final matching = scene.problems
                .where((p) => p.code == code)
                .toList();
            expect(
              matching,
              hasLength(1),
              reason: 'missing scoped $code diagnostic',
            );
            final problem = matching.single;
            expect(problem.locale, locale);
            expect(problem.format, format);
            expect(problem.field, 'headline');
            expect(problem.sectionId, isNull);
            expect(problem.severity, ProblemSeverity.error);
            expect(problem.actionLabel, isNotEmpty);
            expect(scene.textRuns.first, text);
            expect(
              scene.ops.whereType<TextOp>().where(
                (op) => op.field == 'headline',
              ),
              isEmpty,
            );
            expect(project.toManifestJson(), before);
            scene.dispose();
          },
        );
      }
      test(
        'T04 resolved B ${format.name} ${locale.code} preserves manual content and independent geometry',
        () {
          final project = compositionFixture();
          final before = project.toManifestJson();
          final LayoutEngine engine = EditorialLayout(fonts: fonts);
          final scene = engine.compose(project, locale, format);
          expect(scene.width, 1080);
          expect(scene.height, format.height);
          expect(scene.locale, locale);
          expect(scene.format, format);
          expect(scene.project, same(project));
          expect(scene.textRuns, [
            manualHeadlines[locale],
            'São João – Zürich',
            'Prática œuvre',
            'Müller-São João',
            'Ética e precisão',
            '${locale.code}@invalid.test',
          ]);
          expect(scene.textRuns.join(), isNot(contains(project.name)));
          expect(
            scene.problems.where((p) => p.severity == ProblemSeverity.error),
            isEmpty,
          );
          expect(scene.ops.whereType<TextOp>().length, scene.textRuns.length);
          final independent = scene.ops.where((op) => op is! RectOp).toList();
          final canvas = Rect.fromLTWH(0, 0, 1080, format.height.toDouble());
          for (var i = 0; i < independent.length; i++) {
            expect(canvas.contains(independent[i].bounds.topLeft), isTrue);
            expect(
              independent[i].bounds.right,
              lessThanOrEqualTo(canvas.right),
            );
            expect(
              independent[i].bounds.bottom,
              lessThanOrEqualTo(canvas.bottom),
            );
            for (var j = i + 1; j < independent.length; j++) {
              expect(
                independent[i].bounds.overlaps(independent[j].bounds),
                isFalse,
                reason:
                    '${independent[i].runtimeType} / ${independent[j].runtimeType}',
              );
            }
          }
          for (final text in scene.ops.whereType<TextOp>()) {
            expect(text.lineMetrics, isNotEmpty);
            expect(text.boxes, isNotEmpty);
            expect(
              text.lineMetrics.every(
                (line) => line.height > 0 && line.width > 0,
              ),
              isTrue,
            );
          }
          final photo = scene.ops.whereType<PhotoOp>().single;
          expect(photo.asset.id, project.photo!.id);
          expect(photo.sourceRect.left, greaterThanOrEqualTo(180));
          expect(photo.sourceRect.top, greaterThanOrEqualTo(240));
          expect(photo.sourceRect.right, lessThanOrEqualTo(1620));
          expect(photo.sourceRect.bottom, lessThanOrEqualTo(2160));
          expect(
            photo.sourceRect.width / photo.sourceRect.height,
            closeTo(photo.bounds.width / photo.bounds.height, 1e-9),
          );
          final logo = scene.ops.whereType<LogoOp>().single;
          expect(logo.bounds.width / logo.bounds.height, closeTo(3, 1e-9));
          if (format == ExportFormat.portrait) {
            expect(photo.bounds, const Rect.fromLTWH(604, 0, 476, 862));
            expect(
              scene.ops.whereType<RectOp>().last.bounds,
              const Rect.fromLTWH(0, 1142, 1080, 208),
            );
          }
          expect(project.toManifestJson(), before);
          expect(() => scene.ops.clear(), throwsUnsupportedError);
          expect(() => scene.textRuns.clear(), throwsUnsupportedError);
          expect(() => scene.textBounds.clear(), throwsUnsupportedError);
          expect(() => scene.problems.clear(), throwsUnsupportedError);
          expect(
            () => scene.ops.whereType<TextOp>().first.boxes.clear(),
            throwsUnsupportedError,
          );
          scene.dispose();
          expect(scene.isDisposed, isTrue);
          expect(
            scene.ops.whereType<TextOp>().every((op) => op.isDisposed),
            isTrue,
          );
          scene.dispose();
        },
      );
    }
  }
}
