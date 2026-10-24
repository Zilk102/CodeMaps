// Base class for resolvers that look imports up in tables rebuilt from the project index on every
// pass.

import type { ImportRecord } from '../parsing/types';
import {
  edgesOfImports,
  filesOfLanguage,
  type FileEntry,
  type LanguageResolver,
  type ProjectIndex,
  type ResolvedEdge,
} from './types';

/** A resolver that keeps the project index and rebuilds its lookup tables for every refresh. */
export abstract class IndexedResolver<Tables> implements LanguageResolver {
  abstract readonly languageId: string;
  protected index!: ProjectIndex;
  protected tables!: Tables;

  /** Stores the index and rebuilds the lookup tables from the files of this language. */
  async prepare(index: ProjectIndex): Promise<void> {
    this.index = index;
    this.tables = this.buildTables(filesOfLanguage(index, this.languageId));
  }

  /** Starts the lookup tables over from the project's files of this resolver's language. */
  protected abstract buildTables(files: FileEntry[]): Tables;

  /** The project file an import of `importer` names, or null for external or unknown targets. */
  protected abstract resolveImport(importer: string, record: ImportRecord): string | null;

  /** The edges to a resolved import target: the file itself and the symbols the importer uses. */
  protected abstract edgesToImport(file: FileEntry, target: string): ResolvedEdge[];

  /** Edges the file earns without importing anything (an implementation of a header, autoloading). */
  protected abstract inferredEdges(file: FileEntry): ResolvedEdge[];

  /**
   * Edges of a file: those of its imports that resolve to project files, then the inferred ones
   * that need no import.
   */
  resolve(file: FileEntry): ResolvedEdge[] {
    const imported = edgesOfImports(
      file,
      (record) => this.resolveImport(file.path, record),
      (target) => this.edgesToImport(file, target)
    );
    return [...imported, ...this.inferredEdges(file)];
  }
}
