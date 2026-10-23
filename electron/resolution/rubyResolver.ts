import type { ImportRecord } from '../parsing/types';
import {
  bucketsBy,
  ancestorDirs,
  dirOf,
  entityTarget,
  joinPath,
  languageEdge,
  nearestOther,
  normalizeSegments,
  pathSuffixes,
  type FileEntry,
  type ResolvedEdge,
} from './types';
import { IndexedResolver } from './IndexedResolver';

const isConstant = (name: string) => /^[A-Z]/.test(name) && !name.includes('.');
const withExtension = (spec: string) => (spec.endsWith('.rb') ? spec : `${spec}.rb`);

const edge = languageEdge('ruby');

interface RubyTables {
  /** constant -> the files that declare it (a class or module). */
  declarers: Map<string, string[]>;
  /** `lib/acme/user.rb`-style suffixes: files reachable through some `lib/` load path. */
  libFiles: Map<string, string[]>;
}

export class RubyResolver extends IndexedResolver<RubyTables> {
  readonly languageId = 'ruby';

  protected buildTables(files: FileEntry[]): RubyTables {
    return {
      declarers: bucketsBy(files, (entry) =>
        [...(this.index.entitiesByFile.get(entry.path) ?? [])].filter(isConstant)
      ),
      libFiles: bucketsBy(files, (entry) =>
        pathSuffixes(entry.path, this.index.root)
          .filter((suffix) => suffix.startsWith('lib/'))
          .map((suffix) => suffix.slice('lib/'.length))
      ),
    };
  }

  private resolveRelative(importer: string, spec: string, bases: string[]): string | null {
    for (const base of bases) {
      const candidate = normalizeSegments(joinPath(base, withExtension(spec)));
      if (candidate !== importer && this.index.files.has(candidate)) return candidate;
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
    return nearestOther(importer, this.tables.libFiles.get(file));
  }

  protected resolveImport(importer: string, record: ImportRecord): string | null {
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

  protected edgesToImport(file: FileEntry, target: string): ResolvedEdge[] {
    return [edge(target, 1, 'require'), ...this.constantEdges(file, target)];
  }

  /**
   * Autoloaded code (Zeitwerk, Rails) is never required: a constant that exactly one file of the
   * project declares, and this file does not, can only mean that file's class.
   */
  protected inferredEdges(file: FileEntry): ResolvedEdge[] {
    const own = this.index.entitiesByFile.get(file.path) ?? new Set<string>();
    const edges: ResolvedEdge[] = [];
    for (const name of file.facts.usedNames) {
      const files = this.tables.declarers.get(name);
      if (own.has(name) || files?.length !== 1) continue;
      edges.push(edge(entityTarget(files[0], name), 2, 'constant'));
    }
    return edges;
  }
}
