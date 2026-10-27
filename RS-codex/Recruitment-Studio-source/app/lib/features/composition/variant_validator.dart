import 'package:flutter/painting.dart';

import '../../shared/problem.dart';
import '../projects/project.dart';
import 'editorial_layout.dart';
import 'export_format.dart';
import 'layout_scene.dart';

/// Publication validation uses the exact resolved layout; it neither mutates
/// drafts nor retains temporary pictures. Warnings alone never imply refusal.
final class VariantValidator {
  VariantValidator({LayoutEngine? layout})
    : layout = layout ?? EditorialLayout();
  final LayoutEngine layout;

  List<Problem> validate(
    Project project,
    AppLocale locale,
    ExportFormat format,
  ) {
    final scene = layout.compose(project, locale, format);
    try {
      return List.unmodifiable(scene.problems);
    } finally {
      scene.dispose();
    }
  }

  /// Shared structural/color rules. Fit/glyph/resolution come from composition,
  /// so validate cannot drift away from the publishable scene's geometry.
  static List<Problem> contentProblems(
    Project project,
    AppLocale locale,
    ExportFormat format,
  ) {
    final problems = <Problem>[];
    void add(
      ProblemCode code,
      String field,
      String action, {
      String? sectionId,
      ProblemSeverity severity = ProblemSeverity.error,
    }) {
      problems.add(
        Problem(
          code: code,
          severity: severity,
          locale: locale,
          format: format,
          sectionId: sectionId,
          field: field,
          actionLabel: action,
        ),
      );
    }

    final edition = project.edition(locale);
    if (project.photo == null) {
      add(ProblemCode.missingPhoto, 'photo', 'Escolher uma fotografia local');
    }
    if (edition.headline.trim().isEmpty) {
      add(
        ProblemCode.missingHeadline,
        'headline',
        'Preencher o título manual desta língua',
      );
    }
    if (!project.contactIds.any(
      (id) => edition.contacts[id]!.trim().isNotEmpty,
    )) {
      add(
        ProblemCode.missingContact,
        'contacts',
        'Preencher pelo menos um contacto manual desta língua',
      );
    }
    for (final section in project.sections.where((s) => s.visible)) {
      if (section.title(locale).trim().isNotEmpty &&
          !section.items.any((item) => item.text(locale).trim().isNotEmpty)) {
        add(
          ProblemCode.incompleteSection,
          'title',
          'Adicionar um item, ocultar a secção ou remover o título',
          sectionId: section.id,
        );
      }
    }
    final paper = Color.alphaBlend(
      Color(project.style.paper),
      const Color(0xffffffff),
    );
    final footer = Color.alphaBlend(Color(project.style.accent), paper);
    final ink = Color.alphaBlend(Color(project.style.ink), paper);
    double contrast(Color a, Color b) {
      final x = a.computeLuminance();
      final y = b.computeLuminance();
      return ((x > y ? x : y) + 0.05) / ((x < y ? x : y) + 0.05);
    }

    final inkRatio = contrast(ink, paper);
    final footerRatio = contrast(const Color(0xffffffff), footer);
    if (inkRatio < 4.5) {
      add(
        ProblemCode.lowContrast,
        'ink',
        'Corrigir/repor cores: contraste efetivo texto/papel ${inkRatio.toStringAsFixed(2)}:1',
        severity: ProblemSeverity.warning,
      );
    }
    if (footerRatio < 4.5) {
      add(
        ProblemCode.lowContrast,
        'accent',
        'Corrigir/repor cores: contraste efetivo contacto/rodapé ${footerRatio.toStringAsFixed(2)}:1',
        severity: ProblemSeverity.warning,
      );
    }
    return List.unmodifiable(problems);
  }
}
