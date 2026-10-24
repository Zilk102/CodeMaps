import type { ImportRecord } from '../parsing/types';
import {
  addToBucket,
  ancestorDirs,
  dirOf,
  entityTarget,
  hasEntity,
  joinPath,
  nearestPath,
  type FileEntry,
  type LanguageResolver,
  type ProjectIndex,
  type ResolvedEdge,
} from './types';

const MAX_REEXPORT_DEPTH = 3;

interface ModuleHit {
  /** The module's file (`a/b.py` or `a/b/__init__.py`). */
  file: string;
}

/** Directories an absolute import may be rooted at: every ancestor plus `src/`. */
const absoluteRoots = (rootDir: string, importer: FileEntry): string[] => [
  ...ancestorDirs(importer.path, rootDir),
  joinPath(rootDir, 'src'),
];

/** `django_host.apps.billing` -> candidate files, for every suffix of every module path. */
const buildModulesBySuffix = (index: ProjectIndex): Map<string, string[]> => {
  const modulesBySuffix = new Map<string, string[]>();
  const prefix = `${index.root}/`;
  for (const entry of index.files.values()) {
    if (entry.language !== 'python') continue;
    const relative = entry.path.startsWith(prefix) ? entry.path.slice(prefix.length) : entry.path;
    const segments = relative.replace(/\.pyi?$/, '').split('/');
    if (segments[segments.length - 1] === '__init__') segments.pop();
    // Source roots are not declared anywhere (src/, a monorepo service folder, ...), so any
    // trailing part of the path may be the module name.
    for (let start = 0; start < segments.length; start += 1) {
      const key = segments.slice(start).join('.');
      addToBucket(modulesBySuffix, key, entry.path);
    }
  }
  return modulesBySuffix;
};

const importEdge = (target: string): ResolvedEdge => ({
  target,
  value: 1,
  reason: 'python:import',
});

/** `from ..x import y` starts in the directory `dots - 1` levels above the importing file. */
const climbDirectories = (filePath: string, dots: number): string => {
  let base = dirOf(filePath);
  for (let level = 1; level < dots; level += 1) base = dirOf(base);
  return base;
};

/** The module file `entry` re-exports `name` from (`from .x import name`), if any. */
const reExportSource = (
  entry: FileEntry,
  name: string,
  resolveModule: (spec: string) => ModuleHit | null
): string | null => {
  for (const record of entry.facts.imports) {
    if (!record.importedEntities.includes(name)) continue;
    const next = resolveModule(record.path);
    if (next && next.file !== entry.path) return next.file;
  }
  return null;
};

export class PythonResolver implements LanguageResolver {
  readonly languageId = 'python';
  private index!: ProjectIndex;

  private modulesBySuffix = new Map<string, string[]>();

  async prepare(index: ProjectIndex): Promise<void> {
    this.index = index;
    this.modulesBySuffix = buildModulesBySuffix(index);
  }

  /** `base/a/b` -> the file that module a.b lives in, if the project has one. */
  private moduleFileAt(base: string, segments: string[]): ModuleHit | null {
    const stem = joinPath(base, ...segments);
    if (segments.length > 0 && this.index.files.has(`${stem}.py`)) return { file: `${stem}.py` };
    if (this.index.files.has(joinPath(stem, '__init__.py')))
      return { file: joinPath(stem, '__init__.py') };
    return null;
  }

  private resolveModule(importer: FileEntry, spec: string): ModuleHit | null {
    const dots = /^\.*/.exec(spec)?.[0].length ?? 0;
    const segments = spec.slice(dots).split('.').filter(Boolean);

    if (dots > 0) {
      const base = climbDirectories(importer.path, dots);
      // `from . import x` has no module part: the package itself.
      if (segments.length > 0) return this.moduleFileAt(base, segments);
      const init = joinPath(base, '__init__.py');
      return this.index.files.has(init) ? { file: init } : null;
    }

    for (const root of absoluteRoots(this.index.root, importer)) {
      const hit = this.moduleFileAt(root, segments);
      if (hit) return hit;
    }
    const candidates = this.modulesBySuffix.get(segments.join('.'));
    return candidates?.length ? { file: nearestPath(importer.path, candidates) } : null;
  }

  /** Where `name` imported from `module` really lives, following `from .x import name` re-exports. */
  private resolveName(moduleFile: string, name: string, depth = 0): ResolvedEdge {
    if (hasEntity(this.index, moduleFile, name)) {
      return { target: entityTarget(moduleFile, name), value: 2, reason: 'python:import' };
    }
    const entry = this.index.files.get(moduleFile);
    const forwardedTo =
      entry && depth < MAX_REEXPORT_DEPTH
        ? reExportSource(entry, name, (spec) => this.resolveModule(entry, spec))
        : null;
    if (forwardedTo) return this.resolveName(forwardedTo, name, depth + 1);
    return { target: moduleFile, value: 1, reason: 'python:import' };
  }

  /** `from pkg import sub` where sub is a module of the package, not a name inside it. */
  private submodule(packageFile: string, name: string): ModuleHit | null {
    if (!packageFile.endsWith('/__init__.py')) return null;
    return this.moduleFileAt(dirOf(packageFile), [name]);
  }

  /** `import pkg.mod as m` then `m.func()`: link the used function itself. */
  private qualifiedUseEdges(file: FileEntry, record: ImportRecord, target: string): ResolvedEdge[] {
    const qualifier = record.alias ?? (record.path.includes('.') ? null : record.path);
    if (!qualifier) return [];
    return file.facts.qualifiedUses
      .filter((use) => use.qualifier === qualifier && hasEntity(this.index, target, use.name))
      .map((use) => ({
        target: entityTarget(target, use.name),
        value: 2,
        reason: 'python:import',
      }));
  }

  private importedNameEdge(targetFile: string, name: string): ResolvedEdge {
    if (name === '*') return importEdge(targetFile);
    const child = this.submodule(targetFile, name);
    return child ? importEdge(child.file) : this.resolveName(targetFile, name);
  }

  private edgesForImport(file: FileEntry, record: ImportRecord): ResolvedEdge[] {
    const target = this.resolveModule(file, record.path);
    if (!target || target.file === file.path) return [];
    if (record.importedEntities.length === 0) {
      return [importEdge(target.file), ...this.qualifiedUseEdges(file, record, target.file)];
    }
    return record.importedEntities.map((name) => this.importedNameEdge(target.file, name));
  }

  resolve(file: FileEntry): ResolvedEdge[] {
    return file.facts.imports.flatMap((record) => this.edgesForImport(file, record));
  }
}
