import type { ImportRecord } from '../parsing/types';
import {
  bucketsBy,
  ancestorDirs,
  baseName,
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

const HEADER_EXTENSION = /\.(h|hh|hpp|hxx)$/;
const stemOf = (path: string) => baseName(path).replace(/\.[^.]+$/, '');

const edge = languageEdge('cpp');

interface CppTables {
  /** `proj/bar.h`, `bar.h`: every trailing path of every C/C++ file. */
  filesBySuffix: Map<string, string[]>;
  /** header stem -> headers, for `foo.cpp` implements `foo.h`. */
  headersByStem: Map<string, string[]>;
}

/** `proj/bar.h`, `bar.h`, ...: every trailing path of every file, mapped to the files having it. */
const suffixTable = (files: FileEntry[], root: string) =>
  bucketsBy(files, (entry) => pathSuffixes(entry.path, root));

export class CppResolver extends IndexedResolver<CppTables> {
  readonly languageId = 'cpp';

  protected buildTables(files: FileEntry[]): CppTables {
    return {
      filesBySuffix: suffixTable(files, this.index.root),
      headersByStem: bucketsBy(
        files.filter((entry) => HEADER_EXTENSION.test(entry.path)),
        (entry) => [stemOf(entry.path)]
      ),
    };
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
  protected resolveImport(importer: string, record: ImportRecord): string | null {
    const quoted = record.kind !== 'system';
    const spec = record.path;
    // A bare `<stdio.h>` is a system header even if a project file shares the name.
    if (!quoted && !spec.includes('/')) return null;
    for (const dir of this.searchDirs(importer, quoted)) {
      const candidate = normalizeSegments(joinPath(dir, spec));
      if (candidate !== importer && this.index.files.has(candidate)) return candidate;
    }
    // Include directories come from build files; any directory holding the path suffix will do.
    if (spec.includes('..')) return null;
    return nearestOther(importer, this.tables.filesBySuffix.get(spec));
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

  protected edgesToImport(file: FileEntry, header: string): ResolvedEdge[] {
    return [edge(header, 1, 'include'), ...this.entityEdges(file, header)];
  }

  /** `foo.cpp` implements `foo.h`: same directory, or a unique header sharing declared names. */
  protected inferredEdges(file: FileEntry): ResolvedEdge[] {
    if (HEADER_EXTENSION.test(file.path)) return [];
    const headers = this.tables.headersByStem.get(stemOf(file.path)) ?? [];
    const sibling = headers.find((header) => dirOf(header) === dirOf(file.path));
    if (sibling) return [edge(sibling, 1, 'implements')];
    const own = this.index.entitiesByFile.get(file.path) ?? new Set<string>();
    const sharing = headers.filter((header) =>
      [...(this.index.entitiesByFile.get(header) ?? [])].some((name) => own.has(name))
    );
    return sharing.length === 1 ? [edge(sharing[0], 1, 'implements')] : [];
  }
}
