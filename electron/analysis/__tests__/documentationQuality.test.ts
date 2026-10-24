import { describe, expect, it } from 'vitest';
import { assessDocQuality, nameWords } from '../documentation/docQuality';
import { analyze, source, symbolNamed } from './documentationTestKit';

describe('doc comment quality', () => {
  it.each([
    ['getUser', 'Gets the user.', 'echo'],
    ['getUser', 'Returns the user.', 'echo'],
    ['getUser', 'Fetches user', 'too_short'],
    ['save_user', 'Saves the user.', 'echo'],
    ['UserService', 'Service for users.', 'echo'],
    ['parseHTTPResponse', 'Parses the HTTP response.', 'echo'],
    ['getUser', 'Gets the user from the remote database cache.', 'ok'],
    ['loadConfig', 'Reads and validates the configuration file from disk.', 'ok'],
    ['run', '@param value', 'too_short'],
    ['run', 'Starts it.', 'too_short'],
    ['compute', 'Computes the checksum of every block in the archive.', 'ok'],
  ])('%s with "%s" is %s', (name, text, expected) => {
    expect(assessDocQuality(name, text)).toBe(expected);
  });

  it('judges only the summary paragraph, not the tags that follow', () => {
    const text = 'Gets the user.\n\n@param id The identifier of the account to look up.';
    expect(assessDocQuality('getUser', text)).toBe('echo');
  });

  it('splits identifiers into words', () => {
    expect(nameWords('getUserByID')).toEqual(['get', 'User', 'By', 'ID']);
    expect(nameWords('parse_http_response')).toEqual(['parse', 'http', 'response']);
  });

  it('reports the quality on documented symbols', async () => {
    const result = await analyze(
      '/p/api.ts',
      source(
        '/** Gets the user. */',
        'export function getUser() {}',
        '',
        '/** Short doc. */',
        'export function load() {}',
        '',
        '/** Loads every plugin that the project configuration lists. */',
        'export function loadPlugins() {}',
        '',
        'export function bare() {}'
      )
    );
    expect(symbolNamed(result, 'getUser').quality).toBe('echo');
    expect(symbolNamed(result, 'load').quality).toBe('too_short');
    expect(symbolNamed(result, 'loadPlugins').quality).toBe('ok');
    expect(symbolNamed(result, 'bare')).toMatchObject({ documented: false, quality: 'ok' });
  });

  it('applies the same rules to docstrings and Javadoc', async () => {
    const python = await analyze(
      '/p/a.py',
      source('def get_user():', '    """Gets the user."""', '    return 1')
    );
    const java = await analyze(
      '/p/A.java',
      source(
        'public class A {',
        '  /** Gets the user. */',
        '  public int getUser() { return 1; }',
        '}'
      )
    );
    expect(symbolNamed(python, 'get_user').quality).toBe('echo');
    expect(symbolNamed(java, 'getUser').quality).toBe('echo');
  });
});

interface CodeCase {
  language: string;
  file: string;
  prefix: string;
  code: string[];
}

const C_LIKE = ['const x = compute(1);', 'if (x > 2) {', '  run(x);', '}'];

const CASES: CodeCase[] = [
  { language: 'typescript', file: '/p/a.ts', prefix: '//', code: C_LIKE },
  { language: 'java', file: '/p/A.java', prefix: '//', code: C_LIKE },
  { language: 'c_sharp', file: '/p/A.cs', prefix: '//', code: C_LIKE },
  { language: 'cpp', file: '/p/a.cpp', prefix: '//', code: C_LIKE },
  { language: 'zig', file: '/p/a.zig', prefix: '//', code: C_LIKE },
  { language: 'swift', file: '/p/a.swift', prefix: '//', code: C_LIKE },
  {
    language: 'kotlin',
    file: '/p/A.kt',
    prefix: '//',
    code: ['val x = compute(1)', ...C_LIKE.slice(1)],
  },
  {
    language: 'php',
    file: '/p/a.php',
    prefix: '//',
    code: ['$x = compute(1);', ...C_LIKE.slice(1)],
  },
  {
    language: 'go',
    file: '/p/a.go',
    prefix: '//',
    code: ['x := compute(1)', 'if x > 2 {', '  run(x)', '}'],
  },
  {
    language: 'rust',
    file: '/p/a.rs',
    prefix: '//',
    code: ['let x = compute(1);', ...C_LIKE.slice(1)],
  },
  {
    language: 'python',
    file: '/p/a.py',
    prefix: '#',
    code: ['x = compute(1)', 'if x > 2:', '    run(x)', 'y = x + 1'],
  },
  {
    language: 'ruby',
    file: '/p/a.rb',
    prefix: '#',
    code: ['x = compute(1)', 'if x > 2', '  run(x)', 'end'],
  },
  {
    language: 'bash',
    file: '/p/a.sh',
    prefix: '#',
    code: ['x=$(compute 1)', 'if [ "$x" -gt 2 ]; then', '  run "$x"', 'fi'],
  },
];

const PROSE = [
  'This helper exists because the legacy importer still',
  'calls it from a few places (see the migration notes),',
  'so we keep it until the old pipeline is switched off.',
];

// PHP reads everything before `<?php` as inline HTML, where `//` starts nothing.
const opener = (c: CodeCase): string => (c.language === 'php' ? '<?php' : 'x');

describe('commented-out code detection', () => {
  it.each(CASES)('$language: flags a run of commented code lines', async (c) => {
    const lines = ['', ...c.code.map((line) => `${c.prefix} ${line}`), ''];
    const result = await analyze(c.file, source(opener(c), ...lines));
    expect(result.commentedOutCode).toEqual([{ startLine: 3, endLine: 2 + c.code.length }]);
  });

  it.each(CASES)('$language: does not flag prose comments', async (c) => {
    const prose = PROSE.map((line) => `${c.prefix} ${line}`);
    const result = await analyze(c.file, source(opener(c), '', ...prose));
    expect(result.commentedOutCode).toEqual([]);
  });

  it('flags code inside a multi-line block comment', async () => {
    const result = await analyze(
      '/p/b.ts',
      source(
        'export const a = 1;',
        '/*',
        ' * const x = compute(1);',
        ' * run(x);',
        ' * done(x);',
        ' */'
      )
    );
    expect(result.commentedOutCode).toHaveLength(1);
  });

  it('ignores doc comments, trailing comments and short runs', async () => {
    const result = await analyze(
      '/p/c.ts',
      source(
        '/**',
        ' * const a = 1;',
        ' * run(a);',
        ' * stop(a);',
        ' */',
        'export function f() {}',
        'const b = 2; // const x = 1;',
        '// run(a);',
        '// stop(a);'
      )
    );
    expect(result.commentedOutCode).toEqual([]);
  });
});

describe('TODO markers', () => {
  it('reports only markers without an owner or an issue', async () => {
    const result = await analyze(
      '/p/todo.ts',
      source(
        '// TODO: handle the empty case',
        '// TODO(alice): handle the empty case',
        '// FIXME #123 wrong rounding',
        '// FIXME PROJ-42 wrong rounding',
        '// HACK works around a race',
        '/* TODO @bob refactor */',
        '// TODO https://example.com/issue/1'
      )
    );
    expect(result.unownedTodos).toEqual([
      { line: 1, tag: 'TODO' },
      { line: 5, tag: 'HACK' },
    ]);
  });
});
