import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { analyzeSourceFileStructure } from '../sourceFileStructure';

const tempDirs: string[] = [];

const writeTemp = (name: string, content: string) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'structure-'));
  tempDirs.push(dir);
  const filePath = path.join(dir, name);
  fs.writeFileSync(filePath, content);
  return filePath;
};

afterEach(() => {
  while (tempDirs.length) fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

describe('analyzeSourceFileStructure', () => {
  it('measures classes, methods and top-level functions with the compiler API', () => {
    const file = writeTemp(
      'sample.ts',
      [
        'export class Box {',
        '  public open(a: number) {',
        '    if (a > 1 && a < 5) { return 1; }',
        '    return a ? 2 : 3;',
        '  }',
        '  private close() { return "}"; }',
        '}',
        'export function helper() { return 1; }',
        'export const arrow = () => { return 2; };',
      ].join('\n')
    );

    const metrics = analyzeSourceFileStructure(file);

    expect(metrics.classCount).toBe(1);
    expect(metrics.topLevelFunctionCount).toBe(2);
    expect(metrics.publicMethodCount).toBe(1);
    const open = metrics.allFunctions.find((fn) => fn.name === 'Box.open');
    expect(open?.complexity).toBe(4);
    expect(metrics.allFunctions.map((fn) => fn.name)).toEqual([
      'helper',
      'arrow',
      'Box.open',
      'Box.close',
    ]);
  });

  it('returns empty metrics for unsupported or unreadable files', () => {
    const metrics = analyzeSourceFileStructure(path.join(os.tmpdir(), 'missing-file.py'));
    expect(metrics.classCount).toBe(0);
    expect(metrics.allFunctions).toEqual([]);
  });
});
