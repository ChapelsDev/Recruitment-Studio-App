import 'package:flutter_test/flutter_test.dart';
import 'package:recruitment_studio/features/projects/project.dart';
import 'package:recruitment_studio/shared/admission_budget.dart';
import 'package:recruitment_studio/shared/problem.dart';
import 'package:recruitment_studio/shared/work_limits.dart';

void main() {
  test('P01 equal large items reuse the exact paid immutable object and map', () {
    final first = SectionItem(id: 'pool_large', textByLocale: {
      AppLocale.ptPT: 'x' * WorkLimits.fieldUtf16Units,
    });
    final before = AdmissionBudget.shared.reservedBytes;
    final held = <SectionItem>[first];
    for (var i = 0; i < 180; i++) {
      final next = SectionItem(id: 'pool_large', textByLocale: {
        AppLocale.ptPT: 'x' * WorkLimits.fieldUtf16Units,
      });
      expect(next, same(first));
      expect(next.textByLocale, same(first.textByLocale));
      held.add(next);
    }
    expect(held.length, 181);
    expect(AdmissionBudget.shared.reservedBytes, before);
  });
  test('P02 captured input stays literal immutable and structurally distinct', () {
    final source = {AppLocale.ptPT: ' Manual\nœ Straße '};
    final first = SectionItem(id: 'pool_literal', textByLocale: source);
    source[AppLocale.ptPT] = 'changed';
    expect(first.text(AppLocale.ptPT), ' Manual\nœ Straße ');
    final equal = SectionItem(id: 'pool_literal', textByLocale: {
      AppLocale.ptPT: ' Manual\nœ Straße ',
    });
    expect(equal, same(first));
    final structural = SectionItem(id: 'pool_literal', textByLocale: {
      AppLocale.ptPT: ' Manual\nœ Straße ', AppLocale.en: '',
    });
    expect(structural, isNot(same(first)));
    expect(structural.textByLocale.containsKey(AppLocale.en), isTrue);
    expect(() => first.textByLocale[AppLocale.ptPT] = 'write', throwsUnsupportedError);
  });
  test('P03 borrowed published cache hit survives later duplicate item rollback', () {
    final old = SectionItem(id: 'pool_borrowed', textByLocale: {AppLocale.ptPT: 'held'});
    final project = ImmutableProject(id: 'pool_project', sections: [
      Section(id: 's', items: [old]),
    ]);
    final graph = project.toManifest();
    final section = (graph['sections'] as List).first as Map;
    section['items'] = <Object?>[
      <String, Object?>{'id': 'pool_borrowed', 'texts': {'pt-PT': 'held'}},
      <String, Object?>{'id': 'pool_borrowed', 'texts': {'pt-PT': 'held'}},
    ];
    expect(() => Project.fromManifest(graph), throwsArgumentError);
    final again = SectionItem(id: 'pool_borrowed', textByLocale: {AppLocale.ptPT: 'held'});
    expect(again, same(old));
    expect(again.textByLocale, same(old.textByLocale));
    expect(project.toManifestJson(), contains('held'));
  });
  test('P04 bounded cache eviction never retires live paid DTO or readonly alias', () {
    final held = <SectionItem>[];
    final before = AdmissionBudget.shared.reservedBytes;
    for (var i = 0; i < 256; i++) {
      held.add(SectionItem(id: 'pool_evict_$i', textByLocale: {AppLocale.ptPT: 'value_$i'}));
    }
    final firstMap = held.first.textByLocale;
    expect(held.length, 256);
    expect(firstMap[AppLocale.ptPT], 'value_0');
    expect(AdmissionBudget.shared.reservedBytes - before, greaterThanOrEqualTo(256 * 1280));
    expect(() => firstMap[AppLocale.ptPT] = 'write', throwsUnsupportedError);
    expect(held.first.text(AppLocale.ptPT), 'value_0');
  });
  test('P05 public UTF16 literal reuse does not weaken strict supplied graph Unicode', () {
    final text = String.fromCharCode(0xd800);
    final first = SectionItem(id: 'pool_utf16', textByLocale: {AppLocale.ptPT: text});
    final next = SectionItem(id: 'pool_utf16', textByLocale: {AppLocale.ptPT: text});
    expect(next, same(first));
    final project = ImmutableProject(id: 'pool_unicode', sections: [Section(id: 's', items: [first])]);
    expect(project.toManifestJson(), contains(r'\ud800'));
    expect(() => Project.fromManifest(project.toManifest()), throwsFormatException);
    expect(SectionItem(id: 'pool_utf16', textByLocale: {AppLocale.ptPT: text}), same(first));
  });
  test('P06 unequal values and overbound text never borrow equal item payment', () {
    final first = SectionItem(id: 'pool_changed', textByLocale: {AppLocale.ptPT: 'a'});
    final second = SectionItem(id: 'pool_changed', textByLocale: {AppLocale.ptPT: 'b'});
    expect(second, isNot(same(first)));
    expect(first.text(AppLocale.ptPT), 'a');
    expect(second.text(AppLocale.ptPT), 'b');
    expect(() => SectionItem(id: 'pool_changed', textByLocale: {
      AppLocale.ptPT: 'x' * (WorkLimits.fieldUtf16Units + 1),
    }), throwsA(isA<CapacityExceeded>()));
    expect(SectionItem(id: 'pool_changed', textByLocale: {AppLocale.ptPT: 'a'}), same(first));
  });
}
