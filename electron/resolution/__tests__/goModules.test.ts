import { describe, expect, it } from 'vitest';
import { directoryForImport, lastMeaningfulSegment, parseGoMod } from '../goModules';

describe('goModules', () => {
  const module = parseGoMod(
    '/repo',
    ['module example.com/app', '', 'replace example.com/lib => ./libs/lib'].join('\n')
  )!;

  it('maps import paths inside the module to project directories', () => {
    expect(directoryForImport([module], 'example.com/app')).toBe('/repo');
    expect(directoryForImport([module], 'example.com/app/pkg/util')).toBe('/repo/pkg/util');
    expect(directoryForImport([module], 'github.com/other/x')).toBeNull();
  });

  it('follows local replace directives', () => {
    expect(directoryForImport([module], 'example.com/lib/sub')).toBe('/repo/libs/lib/sub');
  });

  it('names a versioned import by the package before the version', () => {
    expect(lastMeaningfulSegment('example.com/foo/v2')).toBe('foo');
    expect(lastMeaningfulSegment('example.com/foo')).toBe('foo');
  });
});
