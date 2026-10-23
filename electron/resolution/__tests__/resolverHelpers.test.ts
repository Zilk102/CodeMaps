import { describe, expect, it } from 'vitest';
import {
  addToBucket,
  bucketsBy,
  edgesOfImports,
  filesOfLanguage,
  languageEdge,
  nearestOther,
  type FileEntry,
  type ProjectIndex,
} from '../types';

const file = (path: string, language: string, imports: string[] = []): FileEntry => ({
  path,
  language,
  facts: {
    imports: imports.map((target) => ({ path: target, importedEntities: [] })),
    qualifiedUses: [],
    usedNames: [],
  } as unknown as FileEntry['facts'],
});

describe('resolver helpers', () => {
  it('addToBucket creates a list on first use and appends afterwards', () => {
    const map = new Map<string, number[]>();
    addToBucket(map, 'a', 1);
    addToBucket(map, 'a', 2);
    addToBucket(map, 'b', 3);
    expect(Object.fromEntries(map)).toEqual({ a: [1, 2], b: [3] });
  });

  it('bucketsBy groups file paths under every key of a file, in file order', () => {
    const files = [file('/r/a.h', 'cpp'), file('/r/b.h', 'cpp')];
    const buckets = bucketsBy(files, (entry) => ['all', entry.path.endsWith('a.h') ? 'a' : 'b']);
    expect(Object.fromEntries(buckets)).toEqual({
      all: ['/r/a.h', '/r/b.h'],
      a: ['/r/a.h'],
      b: ['/r/b.h'],
    });
  });

  it('nearestOther skips the importer and prefers the longest shared directory', () => {
    expect(nearestOther('/r/x/a.rb', undefined)).toBeNull();
    expect(nearestOther('/r/x/a.rb', ['/r/x/a.rb'])).toBeNull();
    expect(nearestOther('/r/x/a.rb', ['/r/x/a.rb', '/r/y/b.rb', '/r/x/c.rb'])).toBe('/r/x/c.rb');
  });

  it('languageEdge prefixes the reason with the language id', () => {
    expect(languageEdge('ruby')('/r/a.rb', 1, 'require')).toEqual({
      target: '/r/a.rb',
      value: 1,
      reason: 'ruby:require',
    });
  });

  it('filesOfLanguage keeps only the files of one language', () => {
    const index = {
      files: new Map([
        ['/r/a.rb', file('/r/a.rb', 'ruby')],
        ['/r/b.h', file('/r/b.h', 'cpp')],
      ]),
    } as unknown as ProjectIndex;
    expect(filesOfLanguage(index, 'ruby').map((entry) => entry.path)).toEqual(['/r/a.rb']);
  });

  it('edgesOfImports builds edges only for the imports that resolve', () => {
    const importer = file('/r/main.rb', 'ruby', ['known', 'unknown']);
    const edges = edgesOfImports(
      importer,
      (record) => (record.path === 'known' ? '/r/known.rb' : null),
      (target) => [languageEdge('ruby')(target, 1, 'require')]
    );
    expect(edges.map((edge) => edge.target)).toEqual(['/r/known.rb']);
  });
});
