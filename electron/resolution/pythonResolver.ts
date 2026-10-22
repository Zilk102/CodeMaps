import {
  dirOf,
  entityTarget,
  hasEntity,
  joinPath,
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

export class PythonResolver implements LanguageResolver {
  readonly languageId = 'python';
  private index!: ProjectIndex;

  /** `django_host.apps.billing` -> candidate files, for every suffix of every module path. */
  private modulesBySuffix = new Map<string, string[]>();

  async prepare(index: ProjectIndex): Promise<void> {
    this.index = index;
    this.modulesBySuffix = new Map();
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
        const bucket = this.modulesBySuffix.get(key);
        if (bucket) bucket.push(entry.path);
        else this.modulesBySuffix.set(key, [entry.path]);
      }
    }
  }

  /** The candidate that shares the longest directory prefix with the importer. */
  private nearest(importer: string, candidates: string[]): string {
    const score = (candidate: string) => {
      const a = importer.split('/');
      const b = candidate.split('/');
      let shared = 0;
      while (shared < a.length && shared < b.length && a[shared] === b[shared]) shared += 1;
      return shared;
    };
    return candidates.reduce((best, candidate) =>
      score(candidate) > score(best) ? candidate : best
    );
  }

  private has(path: string): boolean {
    return this.index.files.has(path);
  }

  /** `base/a/b` -> the file that module a.b lives in, if the project has one. */
  private moduleFileAt(base: string, segments: string[]): ModuleHit | null {
    const stem = joinPath(base, ...segments);
    if (segments.length > 0 && this.has(`${stem}.py`)) return { file: `${stem}.py` };
    if (this.has(joinPath(stem, '__init__.py'))) return { file: joinPath(stem, '__init__.py') };
    return null;
  }

  /** Directories an absolute import may be rooted at: every ancestor plus `src/`. */
  private absoluteRoots(importer: FileEntry): string[] {
    const roots: string[] = [];
    const rootDir = this.index.root;
    let current = dirOf(importer.path);
    while (current.length >= rootDir.length) {
      roots.push(current);
      if (current === rootDir) break;
      current = dirOf(current);
    }
    roots.push(joinPath(rootDir, 'src'));
    return roots;
  }

  private resolveModule(importer: FileEntry, spec: string): ModuleHit | null {
    const dots = /^\.*/.exec(spec)?.[0].length ?? 0;
    const segments = spec.slice(dots).split('.').filter(Boolean);

    if (dots > 0) {
      let base = dirOf(importer.path);
      for (let level = 1; level < dots; level += 1) base = dirOf(base);
      // `from . import x` has no module part: the package itself.
      if (segments.length === 0) {
        const init = joinPath(base, '__init__.py');
        return this.has(init) ? { file: init } : null;
      }
      return this.moduleFileAt(base, segments);
    }

    for (const root of this.absoluteRoots(importer)) {
      const hit = this.moduleFileAt(root, segments);
      if (hit) return hit;
    }
    const candidates = this.modulesBySuffix.get(segments.join('.'));
    return candidates?.length ? { file: this.nearest(importer.path, candidates) } : null;
  }

  /** Where `name` imported from `module` really lives, following `from .x import name` re-exports. */
  private resolveName(moduleFile: string, name: string, depth = 0): ResolvedEdge {
    if (hasEntity(this.index, moduleFile, name)) {
      return { target: entityTarget(moduleFile, name), value: 2, reason: 'python:import' };
    }
    const entry = this.index.files.get(moduleFile);
    if (entry && depth < MAX_REEXPORT_DEPTH) {
      for (const record of entry.facts.imports) {
        if (!record.importedEntities.includes(name)) continue;
        const next = this.resolveModule(entry, record.path);
        if (next && next.file !== moduleFile) return this.resolveName(next.file, name, depth + 1);
      }
    }
    return { target: moduleFile, value: 1, reason: 'python:import' };
  }

  /** `from pkg import sub` where sub is a module of the package, not a name inside it. */
  private submodule(packageFile: string, name: string): ModuleHit | null {
    if (!packageFile.endsWith('/__init__.py')) return null;
    return this.moduleFileAt(dirOf(packageFile), [name]);
  }

  resolve(file: FileEntry): ResolvedEdge[] {
    const edges: ResolvedEdge[] = [];
    for (const record of file.facts.imports) {
      const target = this.resolveModule(file, record.path);
      if (!target || target.file === file.path) continue;

      if (record.importedEntities.length === 0) {
        edges.push({ target: target.file, value: 1, reason: 'python:import' });
        // `import pkg.mod as m` then `m.func()`: link the used function itself.
        const qualifier = record.alias ?? (record.path.includes('.') ? null : record.path);
        if (qualifier) {
          for (const use of file.facts.qualifiedUses) {
            if (use.qualifier === qualifier && hasEntity(this.index, target.file, use.name)) {
              edges.push({
                target: entityTarget(target.file, use.name),
                value: 2,
                reason: 'python:import',
              });
            }
          }
        }
        continue;
      }

      for (const name of record.importedEntities) {
        if (name === '*') {
          edges.push({ target: target.file, value: 1, reason: 'python:import' });
          continue;
        }
        const child = this.submodule(target.file, name);
        if (child) {
          edges.push({ target: child.file, value: 1, reason: 'python:import' });
          continue;
        }
        edges.push(this.resolveName(target.file, name));
      }
    }
    return edges;
  }
}
