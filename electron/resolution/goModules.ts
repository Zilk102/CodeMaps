// Go module metadata (go.mod) and import-path to directory mapping.

import { joinPath, normalizeSegments } from './types';

/** A Go module: where its go.mod lives, its module path and local replacements. */
export interface GoModule {
  dir: string;
  modulePath: string;
  /** `replace example.com/x => ./local` directives pointing inside the repository. */
  replacements: Array<{ from: string; dir: string }>;
}

/**
 * Reads the module path and the `replace ... => ./dir` directives that point inside the repository
 * from a go.mod text. Null when there is no `module` line. Replacements to remote modules are
 * ignored.
 */
export const parseGoMod = (dir: string, text: string): GoModule | null => {
  const module = /^\s*module\s+("?)([^\s"]+)\1/m.exec(text);
  if (!module) return null;
  const replacements: GoModule['replacements'] = [];
  const replaceLine =
    /^\s*(?:replace\s+)?([^\s=]+)(?:\s+v[^\s]+)?\s*=>\s*(\.{1,2}\/[^\s]*|\.{1,2})\s*$/gm;
  for (const match of text.matchAll(replaceLine)) {
    replacements.push({ from: match[1], dir: normalizeSegments(joinPath(dir, match[2])) });
  }
  return { dir, modulePath: module[2], replacements };
};

/** True for Go test files (`_test.go`). */
export const isTestFile = (path: string) => path.endsWith('_test.go');

/** `foo/v2` exposes package foo. */
export const lastMeaningfulSegment = (importPath: string): string => {
  const segments = importPath.split('/');
  const last = segments[segments.length - 1] ?? '';
  return /^v\d+$/.test(last) && segments.length > 1 ? segments[segments.length - 2] : last;
};

/** Directory inside the project that an import path points at, if any. */
export const directoryForImport = (modules: GoModule[], importPath: string): string | null => {
  for (const module of modules) {
    for (const replacement of module.replacements) {
      if (importPath === replacement.from) return replacement.dir;
      if (importPath.startsWith(`${replacement.from}/`)) {
        return joinPath(replacement.dir, importPath.slice(replacement.from.length + 1));
      }
    }
    if (importPath === module.modulePath) return module.dir;
    if (importPath.startsWith(`${module.modulePath}/`)) {
      return joinPath(module.dir, importPath.slice(module.modulePath.length + 1));
    }
  }
  return null;
};
