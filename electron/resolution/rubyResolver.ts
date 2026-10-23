import type { ImportRecord } from '../parsing/types';
import {
  ancestorDirs,
  dirOf,
  entityTarget,
  joinPath,
  nearestPath,
  normalizeSegments,
  pathSuffixes,
  type FileEntry,
  type LanguageResolver,
  type ProjectIndex,
  type ResolvedEdge,
} from './types';

const isConstant = (name: string) => /^[A-Z]/.test(name) && !name.includes('.');
const withExtension = (spec: string) => (spec.endsWith('.rb') ? spec : `${spec}.rb`);

const edge = (target: string, value: number, reason: string): ResolvedEdge => ({
  target,
  value,
  reason: `ruby:${reason}`,
});

export class RubyResolver implements LanguageResolver {
  readonly languageId = 'ruby';
  private index!: ProjectIndex;
  /** constant -> the files that declare it (a class or module). */
  private declarers = new Map<string, string[]>();
  /** `lib/acme/user.rb`-style suffixes: files reachable through some `lib/` load path. */
  private libFiles = new Map<string, string[]>();

  async prepare(index: ProjectIndex): Promise<void> {
    this.index = index;
    this.declarers = new Map();
    this.libFiles = new Map();
    for (const entry of index.files.values()) {
      if (entry.language !== 'ruby') continue;
      for (const name of index.entitiesByFile.get(entry.path) ?? []) {
        if (!isConstant(name)) continue;
        const bucket = this.declarers.get(name);
        if (bucket) bucket.push(entry.path);
        else this.declarers.set(name, [entry.path]);
      }
      for (const suffix of pathSuffixes(entry.path, index.root)) {
        if (!suffix.startsWith('lib/')) continue;
        const key = suffix.slice('lib/'.length);
        const bucket = this.libFiles.get(key);
        if (bucket) bucket.push(entry.path);
        else this.libFiles.set(key, [entry.path]);
      }
    }
  }

  private exists(path: string): boolean {
    return this.index.files.has(path);
  }

  private resolveRelative(importer: string, spec: string, bases: string[]): string | null {
    for (const base of bases) {
      const candidate = normalizeSegments(joinPath(base, withExtension(spec)));
      if (candidate !== importer && this.exists(candidate)) return candidate;
    }
    return null;
  }

  /** `require 'acme/user'`: `lib/` is on the load path, of the project and of nested gems. */
  private resolveRequire(importer: string, spec: string): string | null {
    const file = withExtension(spec);
    const bases = ancestorDirs(importer, this.index.root).flatMap((dir) => [
      joinPath(dir, 'lib'),
      dir,
    ]);
    const direct = this.resolveRelative(importer, spec, bases);
    if (direct) return direct;
    const matches = (this.libFiles.get(file) ?? []).filter((path) => path !== importer);
    return matches.length > 0 ? nearestPath(importer, matches) : null;
  }

  private resolveTarget(importer: string, record: ImportRecord): string | null {
    const spec = record.path;
    if (record.kind === 'relative') return this.resolveRelative(importer, spec, [dirOf(importer)]);
    if (record.kind === 'load') {
      return this.resolveRelative(importer, spec, [this.index.root, dirOf(importer)]);
    }
    if (spec.startsWith('./') || spec.startsWith('../')) {
      return this.resolveRelative(importer, spec, [dirOf(importer)]);
    }
    return this.resolveRequire(importer, spec);
  }

  /** Constants the file mentions that the required file declares. */
  private constantEdges(file: FileEntry, target: string): ResolvedEdge[] {
    const used = new Set(file.facts.usedNames);
    return [...(this.index.entitiesByFile.get(target) ?? [])]
      .filter((name) => isConstant(name) && used.has(name))
      .map((name) => edge(entityTarget(target, name), 2, 'require'));
  }

  private requireEdges(file: FileEntry): ResolvedEdge[] {
    return file.facts.imports.flatMap((record) => {
      const target = this.resolveTarget(file.path, record);
      return target ? [edge(target, 1, 'require'), ...this.constantEdges(file, target)] : [];
    });
  }

  /**
   * Autoloaded code (Zeitwerk, Rails) is never required: a constant that exactly one file of the
   * project declares, and this file does not, can only mean that file's class.
   */
  private autoloadEdges(file: FileEntry): ResolvedEdge[] {
    const own = this.index.entitiesByFile.get(file.path) ?? new Set<string>();
    const edges: ResolvedEdge[] = [];
    for (const name of file.facts.usedNames) {
      const files = this.declarers.get(name);
      if (own.has(name) || files?.length !== 1) continue;
      edges.push(edge(entityTarget(files[0], name), 2, 'constant'));
    }
    return edges;
  }

  resolve(file: FileEntry): ResolvedEdge[] {
    return [...this.requireEdges(file), ...this.autoloadEdges(file)];
  }
}
