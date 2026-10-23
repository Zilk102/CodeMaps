import { describe, expect, it } from 'vitest';
import type { DuplicateGroup } from '../../types/duplicates';
import type { GraphNode } from '../../types/graph';
import {
  actionLabelKey,
  findNodeForFile,
  formatCopy,
  normalizePath,
  shortenPath,
  sortGroups,
} from './duplicatesUtils';

function group(id: string, lineCount: number, copyCount: number): DuplicateGroup {
  return {
    id,
    lineCount,
    tokenCount: lineCount * 5,
    copies: Array.from({ length: copyCount }, (_, i) => ({
      file: `f${i}.ts`,
      startLine: 1,
      endLine: lineCount,
      test: false,
    })),
    suggestion: {
      action: 'extract_function',
      sameFile: false,
      samePackage: true,
      parameters: 0,
      reason: 'r',
    },
    differences: [],
  };
}

const node = (id: string, type: string, filePath?: string): GraphNode => ({
  id,
  label: id,
  group: 0,
  type,
  filePath,
});

describe('normalizePath / formatCopy', () => {
  it('uses forward slashes and drops ./', () => {
    expect(normalizePath('.\\src\\a.ts')).toBe('src/a.ts');
  });

  it('formats a range as file:start-end', () => {
    expect(formatCopy({ file: 'src\\a.ts', startLine: 10, endLine: 24 })).toBe('src/a.ts:10-24');
  });

  it('collapses a single line', () => {
    expect(formatCopy({ file: 'a.ts', startLine: 7, endLine: 7 })).toBe('a.ts:7');
  });
});

describe('shortenPath', () => {
  it('keeps short paths intact', () => {
    expect(shortenPath('src/a/b.ts')).toBe('src/a/b.ts');
  });

  it('cuts long paths from the left', () => {
    expect(shortenPath('a/b/c/d/e.ts')).toBe('.../c/d/e.ts');
    expect(shortenPath('a\\b\\c\\d.ts', 2)).toBe('.../c/d.ts');
  });
});

describe('actionLabelKey', () => {
  it('maps every action to its locale key', () => {
    expect(actionLabelKey('merge_into_one')).toBe('duplicates.actions.merge_into_one');
    expect(actionLabelKey('extract_shared_module')).toBe(
      'duplicates.actions.extract_shared_module'
    );
  });
});

describe('sortGroups', () => {
  it('orders by duplicated volume and does not mutate the input', () => {
    const input = [group('a', 5, 2), group('b', 20, 3), group('c', 5, 2)];
    expect(sortGroups(input).map((g) => g.id)).toEqual(['b', 'a', 'c']);
    expect(input.map((g) => g.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('findNodeForFile', () => {
  const nodes = [
    node('src/a.ts::foo', 'function', 'src/a.ts'),
    node('src/a.ts', 'file', 'src/a.ts'),
    node('C:/proj/src/b.ts', 'file'),
  ];

  it('prefers the file node', () => {
    expect(findNodeForFile(nodes, 'src/a.ts')?.id).toBe('src/a.ts');
  });

  it('matches absolute ids by suffix and windows separators', () => {
    expect(findNodeForFile(nodes, 'src\\b.ts')?.id).toBe('C:/proj/src/b.ts');
  });

  it('returns null when nothing matches', () => {
    expect(findNodeForFile(nodes, 'src/zzz.ts')).toBeNull();
  });
});
