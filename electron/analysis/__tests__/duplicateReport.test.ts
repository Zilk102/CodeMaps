import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterAll, describe, expect, it } from 'vitest';
import { detectClones, type CloneGroup } from '../clones/detectClones';
import { buildDuplicateReport } from '../clones/duplicateReport';
import { tokenizeFile, tokenizeFileWithText } from '../clones/tokenize';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codemaps-duplicates-'));
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));
const graph = { projectRoot: dir.replace(/\\/g, '/') };

const write = (name: string, source: string) => {
  const file = path.join(dir, name).replace(/\\/g, '/');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, source);
  return file;
};

const loader = (kind: string, field: string, status: string) =>
  [
    `export function load${kind}(repo: Repo, id: string) {`,
    `  const ${kind.toLowerCase()} = repo.find(id);`,
    `  if (!${kind.toLowerCase()}) {`,
    '    throw new Error(`missing ${id}`);',
    '  }',
    `  if (${kind.toLowerCase()}.${field} === '${status}') {`,
    "    throw new Error('forbidden');",
    '  }',
    '  const out: string[] = [];',
    '  for (const tag of repo.tags(id)) {',
    '    if (tag.length > 3) {',
    '      out.push(tag);',
    "    } else if (tag === '') {",
    '      out.push(String(id));',
    '    }',
    '  }',
    '  if (out.length === 0) {',
    '    return null;',
    '  }',
    `  return { ${kind.toLowerCase()}, out };`,
    '}',
  ].join('\n');

const groupsOf = async (files: string[]): Promise<CloneGroup[]> => {
  const streams = (await Promise.all(files.map((file) => tokenizeFile(file)))).filter(
    (stream) => stream !== null
  );
  return detectClones(streams);
};

describe('tokenizeFileWithText', () => {
  it('keeps tokenizing after a template literal with a substitution', async () => {
    const file = write('tpl/a.ts', 'const a = `x ${b + `${c}`} y`;\nconst d = 1;\n');
    const stream = (await tokenizeFileWithText(file))!;
    expect(stream.texts).toContain('d');
    expect(stream.texts.at(-1)).toBe(';');
    expect(stream.texts).toHaveLength(stream.tokens.length);
  });
});

describe('buildDuplicateReport', () => {
  it('counts the differing values as parameters and samples the differences', async () => {
    const files = [
      write('pkg/users.ts', loader('User', 'blocked', 'yes')),
      write('pkg/orders.ts', loader('Order', 'state', 'closed')),
    ];
    const report = await buildDuplicateReport(graph, await groupsOf(files));

    expect(report.totalGroups).toBe(1);
    const [group] = report.groups;
    expect(group.copies.map((copy) => copy.file)).toEqual(['pkg/orders.ts', 'pkg/users.ts']);
    expect(group.copies.every((copy) => !copy.test)).toBe(true);
    // load<Kind>, <kind> (renamed in several places, still one value), the field and the status.
    expect(group.suggestion.parameters).toBe(4);
    expect(group.differences.length).toBeGreaterThan(0);
    expect(group.differences.length).toBeLessThanOrEqual(5);
    expect(group.differences.join('\n')).toContain('`user`');
    expect(group.differences.join('\n')).toMatch(/orders\.ts:\d+ `order` vs users\.ts:\d+ `user`/);
    expect(report.duplicatedLines).toBe(group.lineCount);
  });

  it('suggests a function in the same package when the copies sit in one directory', async () => {
    const files = [
      write('same/users.ts', loader('User', 'blocked', 'yes')),
      write('same/orders.ts', loader('Order', 'state', 'closed')),
    ];
    const [group] = (await buildDuplicateReport(graph, await groupsOf(files))).groups;
    expect(group.suggestion).toMatchObject({
      action: 'extract_function',
      samePackage: true,
      sameFile: false,
      targetFile: 'same/orders.ts',
    });
    expect(group.suggestion.reason).toContain('4 differing values');
  });

  it('suggests a function in the file when both copies are in one file', async () => {
    const body = `${loader('User', 'blocked', 'yes')}\n\n${loader('Order', 'state', 'closed')}\n`;
    const file = write('solo/both.ts', body);
    const [group] = (await buildDuplicateReport(graph, await groupsOf([file]))).groups;
    expect(group.suggestion).toMatchObject({
      action: 'extract_function',
      sameFile: true,
      samePackage: true,
      targetFile: 'solo/both.ts',
    });
  });

  it('suggests merging identical copies that live in one package', async () => {
    const files = [
      write('twin/a.ts', loader('User', 'blocked', 'yes')),
      write('twin/b.ts', loader('User', 'blocked', 'yes')),
    ];
    const [group] = (await buildDuplicateReport(graph, await groupsOf(files))).groups;
    expect(group.suggestion.parameters).toBe(0);
    expect(group.differences).toEqual([]);
    expect(group.suggestion.action).toBe('merge_into_one');
  });

  it('suggests a shared module under the common directory across packages', async () => {
    const files = [
      write('svc/users/load.ts', loader('User', 'blocked', 'yes')),
      write('svc/orders/load.ts', loader('Order', 'state', 'closed')),
    ];
    const [group] = (await buildDuplicateReport(graph, await groupsOf(files))).groups;
    expect(group.suggestion).toMatchObject({
      action: 'extract_shared_module',
      samePackage: false,
      sameFile: false,
      targetFile: 'svc/shared.ts',
    });
  });

  it('flags copies in test files and leaves them out unless asked', async () => {
    const files = [
      write('t/a.test.ts', loader('User', 'blocked', 'yes')),
      write('t/b.test.ts', loader('Order', 'state', 'closed')),
    ];
    const groups = await groupsOf(files);
    expect((await buildDuplicateReport(graph, groups)).totalGroups).toBe(0);

    const report = await buildDuplicateReport(graph, groups, { includeTests: true });
    expect(report.groups[0].copies.every((copy) => copy.test)).toBe(true);
  });

  it('says the copies could not be aligned when their tokens no longer match', async () => {
    const files = [
      write('edit/a.ts', loader('User', 'blocked', 'yes')),
      write('edit/b.ts', loader('Order', 'state', 'closed')),
    ];
    const groups = await groupsOf(files);
    const shifted = groups.map((group) => ({
      ...group,
      instances: group.instances.map((instance, index) =>
        index === 0
          ? { ...instance, tokenStart: instance.tokenStart + 1, tokenEnd: instance.tokenEnd + 1 }
          : instance
      ),
    }));
    const [group] = (await buildDuplicateReport(graph, shifted)).groups;
    expect(group.suggestion.parameters).toBe(-1);
    expect(group.differences).toEqual([]);
    expect(group.suggestion.reason).toContain('could not be aligned');
  });

  describe('ranking and filters', () => {
    const fake = (name: string, lines: number, copies: number): CloneGroup => ({
      tokenCount: lines * 10,
      lineCount: lines,
      instances: Array.from({ length: copies }, (_, index) => ({
        file: `${graph.projectRoot}/${name}/c${index}.ts`,
        startLine: 1,
        endLine: lines,
        tokenStart: 0,
        tokenEnd: lines * 10,
      })),
    });
    const groups = [fake('small', 8, 2), fake('wide', 10, 4), fake('long', 40, 2)];

    it('orders by lines saved, caps by limit and counts what was left out', async () => {
      const report = await buildDuplicateReport(graph, groups, { limit: 2 });
      expect(report.groups.map((group) => group.lineCount)).toEqual([40, 10]);
      expect(report.totalGroups).toBe(3);
      expect(report.omittedGroups).toBe(1);
      expect(report.duplicatedLines).toBe(8 + 30 + 40);
    });

    it('keeps ids stable between calls', async () => {
      const first = await buildDuplicateReport(graph, groups);
      const second = await buildDuplicateReport(graph, [...groups].reverse());
      expect(second.groups.map((group) => group.id)).toEqual(first.groups.map((g) => g.id));
      expect(new Set(first.groups.map((group) => group.id)).size).toBe(3);
    });

    it('filters by minimum lines and by file, absolute or relative', async () => {
      expect((await buildDuplicateReport(graph, groups, { minLines: 9 })).totalGroups).toBe(2);
      const relative = await buildDuplicateReport(graph, groups, { filePath: 'wide/c3.ts' });
      expect(relative.groups.map((group) => group.lineCount)).toEqual([10]);
      const absolute = await buildDuplicateReport(graph, groups, {
        filePath: `${graph.projectRoot}/long/c0.ts`,
      });
      expect(absolute.groups.map((group) => group.lineCount)).toEqual([40]);
    });
  });
});
