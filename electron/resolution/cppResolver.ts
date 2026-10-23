import type { ImportRecord } from '../parsing/types';
import {
  ancestorDirs,
  baseName,
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

const HEADER_EXTENSION = /\.(h|hh|hpp|hxx)$/;
const stemOf = (path: string) => baseName(path).replace(/\.[^.]+$/, '');

const edge = (target: string, value: number, reason: string): ResolvedEdge => ({
  target,
  value,
  reason: `cpp:${reason}`,
});

export class CppResolver implements LanguageResolver {
  readonly languageId = 'cpp';
  private index!: ProjectIndex;
  /** `proj/bar.h`, `bar.h`: every trailing path of every C/C++ file. */
  private filesBySuffix = new Map<string, string[]>();
  /** header stem -> headers, for `foo.cpp` implements `foo.h`. */
  private headersByStem = new Map<string, string[]>();

  async prepare(index: ProjectIndex): Promise<void> {
    this.index = index;
    this.filesBySuffix = new Map();
    this.headersByStem = new Map();
    for (const entry of index.files.values()) {
      if (entry.language !== 'cpp') continue;
      for (const suffix of pathSuffixes(entry.path, index.root)) {
        const bucket = this.filesBySuffix.get(suffix);
        if (bucket) bucket.push(entry.path);
        else this.filesBySuffix.set(suffix, [entry.path]);
      }
      if (!HEADER_EXTENSION.test(entry.path)) continue;
      const stem = stemOf(entry.path);
      const headers = this.headersByStem.get(stem);
      if (headers) headers.push(entry.path);
      else this.headersByStem.set(stem, [entry.path]);
    }
  }

  private exists(path: string): boolean {
    return this.index.files.has(path);
  }

  /** Directories searched for an include: the project root, `include/`, `src/`, then ancestors'. */
  private searchDirs(importer: string, quoted: boolean): string[] {
    const { root } = this.index;
    const dirs = quoted ? [dirOf(importer)] : [];
    dirs.push(root, joinPath(root, 'include'), joinPath(root, 'src'));
    for (const ancestor of ancestorDirs(importer, root)) {
      if (quoted) dirs.push(ancestor);
      dirs.push(joinPath(ancestor, 'include'), joinPath(ancestor, 'src'));
    }
    return dirs;
  }

  /** The project file an `#include` names, or null for system headers and unknown files. */
  private resolveInclude(importer: string, record: ImportRecord): string | null {
    const quoted = record.kind !== 'system';
    const spec = record.path;
    // A bare `<stdio.h>` is a system header even if a project file shares the name.
    if (!quoted && !spec.includes('/')) return null;
    for (const dir of this.searchDirs(importer, quoted)) {
      const candidate = normalizeSegments(joinPath(dir, spec));
      if (candidate !== importer && this.exists(candidate)) return candidate;
    }
    // Include directories come from build files; any directory holding the path suffix will do.
    if (spec.includes('..')) return null;
    const matches = (this.filesBySuffix.get(spec) ?? []).filter((path) => path !== importer);
    return matches.length > 0 ? nearestPath(importer, matches) : null;
  }

  /** Header entities the includer defines or uses: a class, a function, `Foo::bar` it implements. */
  private entityEdges(file: FileEntry, header: string): ResolvedEdge[] {
    const used = new Set(file.facts.usedNames);
    const own = this.index.entitiesByFile.get(file.path) ?? new Set<string>();
    const qualified = new Set(
      file.facts.qualifiedUses.map((use) => `${use.qualifier}::${use.name}`)
    );
    const edges: ResolvedEdge[] = [];
    for (const name of this.index.entitiesByFile.get(header) ?? []) {
      const isMember = name.includes('::');
      const referenced = isMember ? qualified.has(name) : used.has(name);
      if (referenced || own.has(name)) edges.push(edge(entityTarget(header, name), 2, 'include'));
    }
    return edges;
  }

  private includeEdges(file: FileEntry): ResolvedEdge[] {
    return file.facts.imports.flatMap((record) => {
      const header = this.resolveInclude(file.path, record);
      return header ? [edge(header, 1, 'include'), ...this.entityEdges(file, header)] : [];
    });
  }

  /** `foo.cpp` implements `foo.h`: same directory, or a unique header sharing declared names. */
  private implementsEdges(file: FileEntry): ResolvedEdge[] {
    if (HEADER_EXTENSION.test(file.path)) return [];
    const headers = this.headersByStem.get(stemOf(file.path)) ?? [];
    const sibling = headers.find((header) => dirOf(header) === dirOf(file.path));
    if (sibling) return [edge(sibling, 1, 'implements')];
    const own = this.index.entitiesByFile.get(file.path) ?? new Set<string>();
    const sharing = headers.filter((header) =>
      [...(this.index.entitiesByFile.get(header) ?? [])].some((name) => own.has(name))
    );
    return sharing.length === 1 ? [edge(sharing[0], 1, 'implements')] : [];
  }

  resolve(file: FileEntry): ResolvedEdge[] {
    return [...this.includeEdges(file), ...this.implementsEdges(file)];
  }
}
