import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

/**
 * The Kuzu worker runs under the system Node, which cannot read app.asar, so every file it
 * loads must be listed in `build.asarUnpack`. The patterns are case-sensitive: a helper called
 * `kuzuRecovery.ts` was left inside the archive and the installed app's worker crashed on start.
 */
const projectRoot = path.resolve(__dirname, '../../..');
const servicesDir = path.join(projectRoot, 'electron', 'services');

const unpackPatterns: string[] = JSON.parse(
  fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8')
).build.asarUnpack;

const patternToRegex = (pattern: string) =>
  new RegExp(
    `^${pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*\*\//g, '(?:.*/)?')
      .replace(/\*/g, '[^/]*')}$`
  );

const isUnpacked = (compiledPath: string) =>
  unpackPatterns.some((pattern) => patternToRegex(pattern).test(compiledPath));

const localImports = (file: string): string[] => {
  const source = fs.readFileSync(file, 'utf8');
  const specifiers = Array.from(source.matchAll(/from\s+'(\.[^']+)'|require\('(\.[^']+)'\)/g)).map(
    (match) => match[1] ?? match[2]
  );
  return specifiers.map((specifier) => path.resolve(path.dirname(file), specifier) + '.ts');
};

const closureOf = (entry: string): string[] => {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const current = queue.pop()!;
    if (seen.has(current)) continue;
    seen.add(current);
    queue.push(...localImports(current).filter((file) => fs.existsSync(file)));
  }
  return Array.from(seen);
};

describe('Kuzu worker packaging', () => {
  const entry = path.join(servicesDir, 'KuzuNativeProcess.ts');
  const files = closureOf(entry);

  it('finds the worker and what it loads', () => {
    expect(files.length).toBeGreaterThanOrEqual(3);
    expect(files.map((file) => path.basename(file))).toContain('KuzuConnectionManager.ts');
  });

  it.each(files.map((file) => path.basename(file)))(
    '%s is unpacked next to the worker',
    (fileName) => {
      const compiled = `dist-electron/services/${fileName.replace(/\.ts$/, '.js')}`;
      expect(
        isUnpacked(compiled),
        `${compiled} is loaded by the Kuzu worker but does not match build.asarUnpack in package.json`
      ).toBe(true);
    }
  );

  it('would have caught a lower-case helper name', () => {
    expect(isUnpacked('dist-electron/services/kuzuRecovery.js')).toBe(false);
    expect(isUnpacked('dist-electron/services/KuzuRecovery.js')).toBe(true);
  });
});
