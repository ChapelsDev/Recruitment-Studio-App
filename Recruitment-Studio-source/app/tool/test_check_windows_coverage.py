"""Real filesystem/CLI tests; all operands are small owned temporary files."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

SCRIPT = Path(__file__).with_name('check_windows_coverage.py')


class CoverageTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='windows-lcov-', dir=os.environ['TMPDIR'])
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / 'lib').mkdir()
        (self.root / 'lib' / 'main.dart').write_text('void main() {}\n', encoding='utf-8')

    def run_gate(self, text, minimum='80', extra=()):
        report = self.root / 'lcov.info'
        if text is not None:
            report.write_text(text, encoding='utf-8')
        result = subprocess.run(
            [sys.executable, '-B', str(SCRIPT), str(report), '--app-root', str(self.root),
             '--minimum', minimum, *extra], capture_output=True, text=True, timeout=10)
        return result

    def test_inclusive_eighty_own_lib(self):
        result = self.run_gate('SF:lib/main.dart\n' + ''.join(
            f'DA:{i},{1 if i <= 4 else 0}\n' for i in range(1, 6)) +
            'LF:5\nLH:4\nend_of_record\n')
        self.assertEqual(result.returncode, 0, result.stderr)
        value = json.loads(result.stdout)
        self.assertEqual(value['lines_found'], 5)
        self.assertEqual(value['lines_hit'], 4)
        self.assertEqual(value['percent'], 80.0)
        self.assertTrue(value['passed'])

    def assert_error(self, text, category, minimum='80'):
        result = self.run_gate(text, minimum)
        self.assertEqual(result.returncode, 2, result.stderr)
        self.assertTrue(result.stdout.strip(), 'Expected closed JSON error protocol, not empty stdout')
        value = json.loads(result.stdout)
        self.assertFalse(value['passed'])
        self.assertEqual(value['error'], category)
        self.assertIsNone(value['percent'])

    def test_absent(self):
        self.assert_error(None, 'input_missing')

    def test_empty(self):
        self.assert_error('', 'input_empty')

    def test_found_zero(self):
        self.assert_error('SF:lib/main.dart\nLF:0\nLH:0\nend_of_record\n', 'no_lines')

    def test_malformed_integer(self):
        self.assert_error('SF:lib/main.dart\nDA:1,nope\nend_of_record\n', 'malformed')

    def test_threshold_nonfinite_or_out_of_range(self):
        for value in ['nan', 'inf', '-1', '101', 'oops']:
            with self.subTest(value=value):
                self.assert_error('SF:lib/main.dart\nDA:1,1\nend_of_record\n', 'invalid_threshold', value)

    def record(self, source='lib/main.dart', data='DA:1,1\n', summary=''):
        return f'SF:{source}\n{data}{summary}end_of_record\n'

    def test_below_threshold(self):
        result = self.run_gate(self.record(data='DA:1,1\nDA:2,0\n'))
        self.assertEqual(result.returncode, 1)
        self.assertEqual(json.loads(result.stdout)['percent'], 50)

    def test_float_ninety_is_valid(self):
        result = self.run_gate(self.record(), '90.0')
        self.assertEqual(result.returncode, 0)

    def test_wrong_scope(self):
        (self.root / 'test').mkdir()
        (self.root / 'test' / 'test.dart').write_text('test', encoding='utf-8')
        self.assert_error(self.record('test/test.dart'), 'no_own_lib')

    def test_mixed_generated_and_outside_do_not_narrow_own_lib(self):
        (self.root / 'lib' / 'other.dart').write_text('manual', encoding='utf-8')
        (self.root / 'lib' / 'model.g.dart').write_text('// GENERATED CODE - DO NOT MODIFY BY HAND\n', encoding='utf-8')
        (self.root / 'test').mkdir()
        (self.root / 'test' / 'test.dart').write_text('test', encoding='utf-8')
        result = self.run_gate(self.record() + self.record('lib/other.dart', 'DA:1,0\n') +
                               self.record('lib/model.g.dart') + self.record('test/test.dart'))
        value = json.loads(result.stdout)
        self.assertEqual(result.returncode, 1)
        self.assertEqual(value['lines_found'], 2)
        self.assertEqual(value['percent'], 50)
        self.assertEqual(len(value['files']), 2)
        self.assertEqual(len(value['excluded']), 2)

    def test_generated_suffix_without_marker_is_own(self):
        (self.root / 'lib' / 'hand.g.dart').write_text('manual', encoding='utf-8')
        result = self.run_gate(self.record() + self.record('lib/hand.g.dart', 'DA:1,0\n'))
        self.assertEqual(result.returncode, 1)
        self.assertEqual(json.loads(result.stdout)['lines_found'], 2)

    def test_duplicate_source_identity(self):
        self.assert_error(self.record() + self.record(str(self.root / 'lib' / 'main.dart')), 'duplicate_source')

    def test_duplicate_line_identity(self):
        self.assert_error(self.record(data='DA:1,1\nDA:1,0\n'), 'duplicate_line')

    def test_summary_mismatch(self):
        self.assert_error(self.record(summary='LF:2\nLH:1\n'), 'summary_mismatch')

    def test_optional_summaries_checksum_function_branch_records(self):
        result = self.run_gate('TN:sdk\n' + self.record(
            data='FN:1,main\nFNDA:1,main\nFNF:1\nFNH:1\nBRDA:1,0,0,-\nBRF:1\nBRH:0\nDA:1,4,abc123\n',
            summary='LF:1\nLH:1\n'))
        self.assertEqual(result.returncode, 0, result.stdout)

    def test_malformed_records(self):
        for text in [self.record(data='DA:0,1\n'), self.record(data='DA:1,-1\n'),
                     self.record(data='DA:1,1.5\n'), self.record(summary='LF:nope\n'),
                     self.record(summary='LF:1\nLF:1\n'), 'DA:1,1\nend_of_record\n',
                     'SF:lib/main.dart\nDA:1,1\n', self.record(data='BOGUS:x\n'),
                     'SF:lib/main.dart\nSF:lib/main.dart\nDA:1,1\nend_of_record\n']:
            with self.subTest(text=text):
                self.assert_error(text, 'malformed')

    def test_missing_source_and_traversal(self):
        self.assert_error(self.record('lib/missing.dart'), 'source_missing')
        self.assert_error(self.record('lib/../lib/main.dart'), 'unsafe_source')

    def test_symlink_does_not_alias_own_lib(self):
        other = self.root / 'external.dart'
        other.write_text('manual', encoding='utf-8')
        (self.root / 'lib' / 'link.dart').symlink_to(other)
        self.assert_error(self.record('lib/link.dart'), 'unsafe_source')

    def test_threshold_api_type_validation(self):
        sys.path.insert(0, str(SCRIPT.parent))
        self.addCleanup(lambda: sys.path.remove(str(SCRIPT.parent)))
        from check_windows_coverage import check, CoverageError
        for value in [True, '80', [], None]:
            with self.subTest(value=value):
                with self.assertRaises(CoverageError) as caught:
                    check(self.root / 'unused', self.root, value)
                self.assertEqual(caught.exception.category, 'invalid_threshold')

    def test_large_numeric_operands_fail_closed(self):
        self.assert_error(self.record(data='DA:1,' + '9' * 5000 + '\n'), 'malformed')
        sys.path.insert(0, str(SCRIPT.parent))
        self.addCleanup(lambda: sys.path.remove(str(SCRIPT.parent)))
        from check_windows_coverage import check, CoverageError
        with self.assertRaises(CoverageError) as caught:
            check(self.root / 'unused', self.root, 10 ** 1000)
        self.assertEqual(caught.exception.category, 'invalid_threshold')


if __name__ == '__main__':
    unittest.main(verbosity=2)
