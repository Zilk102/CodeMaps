// Shared contracts and path helpers of the language import resolvers.

import type { FileResolutionFacts, ImportRecord } from '../parsing/types';

/** One edge from a file to a file (`a/b.go`) or to a symbol in a file (`a/b.go#Name`). */
export interface ResolvedEdge {
  target: string;
  value: number;
  /** Prefixed with the language id, e.g. `go:same package`; marks the link as resolver-owned. */
  reason: string;
}

/** A project file of a resolver language with the raw facts the parser extracted from it. */
export interface FileEntry {
  path: string;
  language: string;
  facts: FileResolutionFacts;
}

/**
 * Everything a resolver may consult about the project. Paths are absolute with forward slashes;
 * entity names are the labels of the class and function nodes of each file.
 */
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

/**
 * Turns the raw import facts of one language into graph edges. `prepare` runs once per pass and
 * builds lookup tables; `resolve` is then called per file of that language.
 */
export interface LanguageResolver {
  languageId: string;
  prepare: (index: ProjectIndex) => Promise<void>;
  resolve: (file: FileEntry) => ResolvedEdge[];
}

/** Graph node id of a symbol: `<file>#<name>`. */
export const entityTarget = (file: string, name: string) => `${file}#${name}`;

/** True when the file declares an entity of this name, according to the project index. */
export const hasEntity = (index: ProjectIndex, file: string, name: string): boolean =>
  index.entitiesByFile.get(file)?.has(name) ?? false;

/** Directory part of a forward-slash path; empty for a bare file name or a root-level path. */
export const dirOf = (path: string): string => {
  const cut = path.lastIndexOf('/');
  return cut <= 0 ? '' : path.slice(0, cut);
};

/** Last segment of a forward-slash path. */
export const baseName = (path: string): string => path.slice(path.lastIndexOf('/') + 1);

/**
 * Joins non-empty parts with `/` and collapses repeated slashes. Does not resolve `..`; see
 * `normalizeSegments`.
 */
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

/** Appends `value` to the list kept under `key`, creating the list on first use. */
export const addToBucket = <V>(map: Map<string, V[]>, key: string, value: V): void => {
  const bucket = map.get(key);
  if (bucket) bucket.push(value);
  else map.set(key, [value]);
};

/** Builds the edges of one language: the reason is prefixed with its id. */
export const languageEdge =
  (languageId: string) =>
  (target: string, value: number, reason: string): ResolvedEdge => ({
    target,
    value,
    reason: `${languageId}:${reason}`,
  });

/** The candidate nearest to the importer, ignoring the importer itself; null when none is left. */
export const nearestOther = (importer: string, candidates: string[] | undefined): string | null => {
  const others = (candidates ?? []).filter((path) => path !== importer);
  return others.length > 0 ? nearestPath(importer, others) : null;
};

/** Edges for every import of the file whose target `resolveTarget` finds. */
export const edgesOfImports = (
  file: FileEntry,
  resolveTarget: (record: ImportRecord) => string | null,
  edgesTo: (target: string) => ResolvedEdge[]
): ResolvedEdge[] =>
  file.facts.imports.flatMap((record) => {
    const target = resolveTarget(record);
    return target ? edgesTo(target) : [];
  });

/** The indexed files written in `language`. */
export const filesOfLanguage = (index: ProjectIndex, language: string): FileEntry[] =>
  [...index.files.values()].filter((entry) => entry.language === language);

/** Groups the paths of `files` under each key `keysOf` gives them, in file order. */
export const bucketsBy = (
  files: FileEntry[],
  keysOf: (entry: FileEntry) => string[]
): Map<string, string[]> => {
  const buckets = new Map<string, string[]>();
  for (const entry of files) {
    for (const key of keysOf(entry)) addToBucket(buckets, key, entry.path);
  }
  return buckets;
};
