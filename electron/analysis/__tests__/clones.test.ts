import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterAll, describe, expect, it } from 'vitest';
import { CloneIndex } from '../clones/CloneIndex';
import { detectClones } from '../clones/detectClones';
import { tokenizeFile } from '../clones/tokenize';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codemaps-clones-'));
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

const write = (name: string, source: string) => {
  const file = path.join(dir, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, source);
  return file;
};

const goHandler = (variable: string, field: string, status: string) =>
  [
    `func (h *Handler) load${variable}(c *gin.Context) {`,
    `  ${variable.toLowerCase()}, err := h.repo.Find(c.Param("id"))`,
    '  if err != nil {',
    '    c.JSON(500, gin.H{"error": err.Error()})',
    '    return',
    '  }',
    `  if ${variable.toLowerCase()}.${field} == "${status}" {`,
    '    c.JSON(403, gin.H{"error": "forbidden"})',
    '    return',
    '  }',
    `  c.JSON(200, ${variable.toLowerCase()})`,
    '}',
  ].join('\n');

describe('tokenizeFile', () => {
  it('normalizes names, numbers and strings and drops imports and comments', async () => {
    const file = write(
      'a.go',
      [
        'package a',
        'import "fmt"',
        '// a comment',
        'func f(x int) int { return x + 42 }',
        'func g() { fmt.Println("hi") }',
      ].join('\n')
    );
    const stream = (await tokenizeFile(file))!;
    expect(stream.tokens).not.toContain('fmt');
    expect(stream.tokens.join(' ')).toContain('return ID + NUM');
    expect(stream.tokens).toContain('STR');
    expect(stream.lines.length).toBe(stream.tokens.length);
  });

  it('handles TypeScript and skips import statements', async () => {
    const file = write(
      'a.ts',
      ["import { a } from './a';", 'export const f = (x: number) => x + 1;'].join('\n')
    );
    const stream = (await tokenizeFile(file))!;
    expect(stream.tokens[0]).toBe('export');
    expect(stream.tokens).not.toContain('from');
  });

  it('returns null for a language it cannot read', async () => {
    expect(await tokenizeFile(write('notes.txt', 'hello'))).toBeNull();
  });
});

describe('detectClones', () => {
  it('finds a block copied with other names, across files, in every language', async () => {
    const files = [
      write('x/users.go', `package x\n${goHandler('User', 'Blocked', 'yes')}`),
      write('x/orders.go', `package x\n${goHandler('Order', 'State', 'closed')}`),
      write('x/other.go', 'package x\nfunc unrelated() int { return 1 }'),
    ];
    const streams = (await Promise.all(files.map((file) => tokenizeFile(file)))).filter(
      (stream) => stream !== null
    );
    const groups = detectClones(streams);
    expect(groups).toHaveLength(1);
    expect(groups[0].instances.map((instance) => path.basename(instance.file))).toEqual([
      'orders.go',
      'users.go',
    ]);
    expect(groups[0].lineCount).toBeGreaterThanOrEqual(10);
  });

  it('works on Python, Java and Rust too', async () => {
    const python = (name: string) =>
      [
        `def check_${name}(items, limit):`,
        '    result = []',
        '    for item in items:',
        '        if item.value > limit:',
        '            result.append(item.name)',
        '        elif item.value < 0:',
        '            raise ValueError(item.name)',
        '    return result',
      ].join('\n');
    const rust = (name: string) =>
      [
        `fn check_${name}(items: &[Item], limit: i32) -> Vec<String> {`,
        '    let mut result = Vec::new();',
        '    for item in items {',
        '        if item.value > limit {',
        '            result.push(item.name.clone());',
        '        } else if item.value < 0 {',
        '            panic!("bad {}", item.name);',
        '        }',
        '    }',
        '    result',
        '}',
      ].join('\n');
    const java = (name: string) =>
      [
        `class C${name} {`,
        `  List<String> check${name}(List<Item> items, int limit) {`,
        '    List<String> result = new ArrayList<>();',
        '    for (Item item : items) {',
        '      if (item.value > limit) { result.add(item.name); }',
        '      else if (item.value < 0) { throw new IllegalStateException(item.name); }',
        '    }',
        '    return result;',
        '  }',
        '}',
      ].join('\n');
    for (const [ext, make] of [
      ['py', python],
      ['rs', rust],
      ['java', java],
    ] as const) {
      const files = [write(`m/a.${ext}`, make('a')), write(`m/b.${ext}`, make('b'))];
      const streams = (await Promise.all(files.map((file) => tokenizeFile(file)))).filter(
        (stream) => stream !== null
      );
      expect(detectClones(streams, { minTokens: 40 }), ext).toHaveLength(1);
    }
  });

  it('ignores small snippets and unrelated code', async () => {
    const a = write('s/a.go', 'package s\nfunc A() int {\n  return 1\n}');
    const b = write('s/b.go', 'package s\nfunc B() int {\n  return 2\n}');
    const streams = (await Promise.all([a, b].map((file) => tokenizeFile(file)))).filter(
      (stream) => stream !== null
    );
    expect(detectClones(streams)).toEqual([]);
  });

  it('finds a copy inside one file but not a repetition of the same block', async () => {
    const file = write(
      'one/dup.go',
      `package one\n${goHandler('User', 'Blocked', 'yes')}\n${goHandler('Order', 'State', 'closed')}`
    );
    const stream = (await tokenizeFile(file))!;
    const groups = detectClones([stream]);
    expect(groups).toHaveLength(1);
    expect(groups[0].instances.map((instance) => instance.file)).toEqual([file, file]);
  });

  it('finds a copy that was edited after pasting (an extra statement in the middle)', async () => {
    const block = (extra: string[]) =>
      [
        'func (h *Handler) one(c *gin.Context) {',
        '  user, err := h.repo.Find(c.Param("id"))',
        '  if err != nil {',
        '    c.JSON(500, gin.H{"error": err.Error()})',
        '    return',
        '  }',
        '  if user.Blocked == "yes" {',
        '    c.JSON(403, gin.H{"error": "forbidden"})',
        '    return',
        '  }',
        ...extra,
        '  h.audit.Record(c, user.ID, "viewed")',
        '  limit := h.config.Limit(user.Role)',
        '  if limit < 1 {',
        '    c.JSON(429, gin.H{"error": "too many"})',
        '    return',
        '  }',
        '  c.JSON(200, user)',
        '}',
      ].join('\n');
    const files = [
      write('gap/a.go', `package g\n${block([])}`),
      write('gap/b.go', `package g\n${block(['  h.metrics.Inc("viewed", user.ID)'])}`),
    ];
    const streams = (await Promise.all(files.map((file) => tokenizeFile(file)))).filter(
      (stream) => stream !== null
    );
    const groups = detectClones(streams);
    expect(groups).toHaveLength(1);
    // One group covering the whole function, not two halves.
    expect(groups[0].lineCount).toBeGreaterThanOrEqual(18);
  });

  it('reports every copy of a block that exists three times', async () => {
    const files = ['A', 'B', 'C'].map((name, index) =>
      write(`three/${name}.go`, `package t\n${goHandler(`Thing${name}`, 'F' + index, 'x')}`)
    );
    const streams = (await Promise.all(files.map((file) => tokenizeFile(file)))).filter(
      (stream) => stream !== null
    );
    const groups = detectClones(streams);
    expect(groups).toHaveLength(1);
    expect(groups[0].instances).toHaveLength(3);
  });
});

describe('detectClones on repetitive data', () => {
  it('does not report a table of similar entries as copies of itself', async () => {
    const entry = (index: number) =>
      [
        `    Spec(name="item${index}", pattern=re.compile("a${index}"),`,
        `         weight=${index}, tags=("x", "y"), check=lambda v: v > ${index}),`,
      ].join('\n');
    const file = write(
      'data/table.py',
      `SPECS = [\n${Array.from({ length: 30 }, (_, index) => entry(index)).join('\n')}\n]\n`
    );
    const stream = (await tokenizeFile(file))!;
    const groups = detectClones([stream], { minTokens: 40 });
    for (const group of groups) {
      const spans = group.instances.map((instance) => [instance.tokenStart, instance.tokenEnd]);
      spans.sort((a, b) => a[0] - b[0]);
      spans
        .slice(1)
        .forEach((span, index) => expect(span[0]).toBeGreaterThanOrEqual(spans[index][1]));
    }
  });
});

describe('CloneIndex', () => {
  it('skips generated code and test files', async () => {
    const index = new CloneIndex();
    const files = [
      write('gen/migrations/0001.go', `package i\n${goHandler('User', 'Blocked', 'yes')}`),
      write('gen/migrations/0002.go', `package i\n${goHandler('Order', 'State', 'closed')}`),
    ];
    expect(await index.refresh('/gen-root', files)).toEqual([]);
  });

  it('computes once per change set and answers peek', async () => {
    const index = new CloneIndex();
    const files = [
      write('idx/a.go', `package i\n${goHandler('User', 'Blocked', 'yes')}`),
      write('idx/b.go', `package i\n${goHandler('Order', 'State', 'closed')}`),
    ];
    expect(index.peek(dir)).toBeNull();
    const first = await index.refresh(dir, files);
    expect(first).toHaveLength(1);
    expect(index.peek(dir)).toBe(first);
    expect(await index.refresh(dir, files)).toBe(first);

    fs.writeFileSync(files[1], 'package i\nfunc other() {}');
    expect(await index.refresh(dir, files)).toEqual([]);
  });
});
