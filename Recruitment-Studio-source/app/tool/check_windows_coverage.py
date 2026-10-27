"""Read-only own-lib LCOV gate. JSON stdout; exits 0 pass, 1 below, 2 invalid.

No default LCOV path and no report writes. LF/LH are optional LCOV summaries;
when present they must agree with unique DA identities, not their hit counts.
"""
import argparse
import json
import math
from pathlib import Path
import re


class CoverageError(Exception):
    def __init__(self, category):
        self.category = category


def integer(value):
    if not re.fullmatch(r'[0-9]+', value):
        raise CoverageError('malformed')
    try:
        return int(value)
    except ValueError:
        raise CoverageError('malformed') from None


def check(path, app_root, minimum: int | float = 80):
    if isinstance(minimum, bool) or not isinstance(minimum, (int, float)) or not 0 <= minimum <= 100 or not math.isfinite(minimum):
        raise CoverageError('invalid_threshold')
    try:
        text = Path(path).read_text(encoding='utf-8')
    except FileNotFoundError:
        raise CoverageError('input_missing') from None
    except (OSError, UnicodeError):
        raise CoverageError('input_unreadable') from None
    if not text.strip():
        raise CoverageError('input_empty')
    root = Path(app_root).resolve()
    lib = root / 'lib'
    if not lib.is_dir() or lib.is_symlink():
        raise CoverageError('invalid_root')
    files, excluded, seen = [], [], set()
    current = None
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        if line.startswith('TN:') and current is None:
            continue
        if line.startswith('SF:'):
            if current is not None or not line[3:]:
                raise CoverageError('malformed')
            source = Path(line[3:])
            if '..' in source.parts or '\x00' in str(source):
                raise CoverageError('unsafe_source')
            source = source if source.is_absolute() else root / source
            # Lexical scope BEFORE any read/stat; outside sources are not opened.
            own = source.is_relative_to(lib) and source.suffix == '.dart'
            identity = str(source)
            if identity in seen:
                raise CoverageError('duplicate_source')
            seen.add(identity)
            reason = None
            if own:
                relative = source.relative_to(root)
                cursor = root
                for part in relative.parts:
                    cursor = cursor / part
                    if cursor.is_symlink():
                        raise CoverageError('unsafe_source')
                if not source.is_file():
                    raise CoverageError('source_missing')
                # Only documented generator suffix AND exact generator header.
                try:
                    with source.open(encoding='utf-8') as handle:
                        header = handle.readline(256).strip()
                except (OSError, UnicodeError):
                    raise CoverageError('source_unreadable') from None
                if source.name.endswith(('.g.dart', '.freezed.dart')) and header == '// GENERATED CODE - DO NOT MODIFY BY HAND':
                    reason = 'documented_generated'
            else:
                reason = 'outside_own_lib'
            current = {'path': identity, 'reason': reason, 'lines': {}, 'summaries': {}}
            continue
        if current is None:
            raise CoverageError('malformed')
        if line == 'end_of_record':
            found = len(current['lines'])
            hit = sum(count > 0 for count in current['lines'].values())
            for tag, actual in [('LF', found), ('LH', hit)]:
                if tag in current['summaries'] and current['summaries'][tag] != actual:
                    raise CoverageError('summary_mismatch')
            row = {'path': current['path'], 'lines_found': found, 'lines_hit': hit}
            if current['reason'] is None:
                files.append(row)
            else:
                excluded.append({**row, 'reason': current['reason']})
            current = None
            continue
        tag, separator, payload = line.partition(':')
        if not separator:
            raise CoverageError('malformed')
        if tag == 'DA':
            fields = payload.split(',')
            if len(fields) not in (2, 3) or integer(fields[0]) == 0:
                raise CoverageError('malformed')
            number, count = integer(fields[0]), integer(fields[1])
            if number in current['lines']:
                # Reject duplicate identities even if equal; merge LCOV upstream.
                raise CoverageError('duplicate_line')
            current['lines'][number] = count
        elif tag in ('LF', 'LH', 'FNF', 'FNH', 'BRF', 'BRH'):
            if tag in current['summaries']:
                raise CoverageError('malformed')
            current['summaries'][tag] = integer(payload)
        elif tag in ('FN', 'FNDA'):
            number, comma, name = payload.partition(',')
            if not comma or not name:
                raise CoverageError('malformed')
            integer(number)
        elif tag == 'BRDA':
            fields = payload.split(',')
            if len(fields) != 4:
                raise CoverageError('malformed')
            for field in fields[:3]:
                integer(field)
            if fields[3] != '-':
                integer(fields[3])
        else:
            raise CoverageError('malformed')
    if current is not None:
        raise CoverageError('malformed')
    if not files:
        raise CoverageError('no_own_lib')
    found = sum(row['lines_found'] for row in files)
    hit = sum(row['lines_hit'] for row in files)
    if found == 0:
        raise CoverageError('no_lines')
    percent = 100 * hit / found
    return {'schema': 'windows-own-lib-lcov-v1', 'passed': percent >= minimum,
            'error': None, 'minimum': minimum, 'lines_found': found,
            'lines_hit': hit, 'percent': percent, 'files': sorted(files, key=lambda row: row['path']),
            'excluded': sorted(excluded, key=lambda row: row['path']),
            'scope': 'all reported own-lib Dart lines; no touched-file filter; not native coverage'}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('lcov', type=Path, help='explicit input; never modified')
    parser.add_argument('--app-root', type=Path, required=True)
    parser.add_argument('--minimum', default='80')
    args = parser.parse_args(argv)
    minimum = None
    try:
        try:
            minimum = float(args.minimum)
        except ValueError:
            raise CoverageError('invalid_threshold') from None
        value = check(args.lcov, args.app_root, minimum)
        code = 0 if value['passed'] else 1
    except CoverageError as error:
        value = {'schema': 'windows-own-lib-lcov-v1', 'passed': False,
                 'error': error.category, 'minimum': minimum if minimum is not None and math.isfinite(minimum) else None,
                 'lines_found': 0, 'lines_hit': 0, 'percent': None}
        code = 2
    print(json.dumps(value, sort_keys=True, allow_nan=False))
    return code


if __name__ == '__main__':
    raise SystemExit(main())
