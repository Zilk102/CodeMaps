import type { FileResolutionFacts } from '../parsing/types';

/** One edge from a file to a file (`a/b.go`) or to a symbol in a file (`a/b.go#Name`). */
export interface ResolvedEdge {
  target: string;
  value: number;
  /** Prefixed with the language id, e.g. `go:same package`; marks the link as resolver-owned. */
  reason: string;
}

export interface FileEntry {
  path: string;
  language: string;
  facts: FileResolutionFacts;
}

export interface ProjectIndex {
  root: string;
  /** Every indexed file of a resolver language. */
  files: Map<string, FileEntry>;
  filesByDir: Map<string, string[]>;
  /** Declared entity names per file (class and function labels). */
  entitiesByFile: Map<string, Set<string>>;
  /** Absolute paths of manifests (go.mod, Cargo.toml, composer.json) found on disk, normalized with '/'. */
  manifests: { goMod: string[]; cargo: string[]; composer: string[] };
  readText: (path: string) => Promise<string | null>;
}

export interface LanguageResolver {
  languageId: string;
  prepare: (index: ProjectIndex) => Promise<void>;
  resolve: (file: FileEntry) => ResolvedEdge[];
}

export const entityTarget = (file: string, name: string) => `${file}#${name}`;

export const hasEntity = (index: ProjectIndex, file: string, name: string): boolean =>
  index.entitiesByFile.get(file)?.has(name) ?? false;

export const dirOf = (path: string): string => {
  const cut = path.lastIndexOf('/');
  return cut <= 0 ? '' : path.slice(0, cut);
};

export const baseName = (path: string): string => path.slice(path.lastIndexOf('/') + 1);

export const joinPath = (...parts: string[]): string =>
  parts
    .filter((part) => part.length > 0)
    .join('/')
    .replace(/\/+/g, '/');

/** Resolves `.` and `..` segments in an already normalized path. */
export const normalizeSegments = (path: string): string => {
  const out: string[] = [];
  for (const segment of path.split('/')) {
    if (segment === '..') out.pop();
    else if (segment !== '.' && segment !== '') out.push(segment);
  }
  const prefix = path.startsWith('/') ? '/' : '';
  return prefix + out.join('/');
};

/** Every ancestor directory of `path`, nearest first, down to and including `root`. */
export const ancestorDirs = (path: string, root: string): string[] => {
  const dirs: string[] = [];
  let current = dirOf(path);
  while (current.length >= root.length) {
    dirs.push(current);
    if (current === root) break;
    current = dirOf(current);
  }
  return dirs;
};

/** The candidate that shares the longest directory prefix with the importer. */
export const nearestPath = (importer: string, candidates: string[]): string => {
  const shared = (candidate: string) => {
    const a = importer.split('/');
    const b = candidate.split('/');
    let count = 0;
    while (count < a.length && count < b.length && a[count] === b[count]) count += 1;
    return count;
  };
  return candidates.reduce((best, candidate) =>
    shared(candidate) > shared(best) ? candidate : best
  );
};

/** `a/b/c.h` -> `a/b/c.h`, `b/c.h`, `c.h`: every trailing part of a path relative to the root. */
export const pathSuffixes = (path: string, root: string): string[] => {
  const prefix = `${root}/`;
  const segments = (path.startsWith(prefix) ? path.slice(prefix.length) : path).split('/');
  return segments.map((_, start) => segments.slice(start).join('/'));
};
