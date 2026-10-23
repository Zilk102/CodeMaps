import { findTypeIn, typeNamesOf } from './packageLookup';
import {
  entityTarget,
  type FileEntry,
  type LanguageResolver,
  type ProjectIndex,
  type ResolvedEdge,
} from './types';

/**
 * Resolution for languages that organise code in dotted packages or namespaces (Java, Kotlin,
 * C#): a package maps to the files declaring it, a qualified name to the file declaring its
 * type, and names used without an import to the siblings of the same package.
 */
export class PackageResolver implements LanguageResolver {
  protected index!: ProjectIndex;
  /** package name -> files declaring it (own language and `peers`, which share the namespace). */
  protected filesByPackage = new Map<string, FileEntry[]>();

  constructor(
    readonly languageId: string,
    private readonly peers: string[] = []
  ) {}

  /** Packages a file contributes to; C# files may declare several namespaces. */
  protected packagesOf(file: FileEntry): string[] {
    return [file.facts.packageName ?? ''];
  }

  /** Packages whose types are visible in `file` without an import. */
  protected visiblePackages(file: FileEntry): string[] {
    return [file.facts.packageName ?? ''];
  }

  async prepare(index: ProjectIndex): Promise<void> {
    this.index = index;
    this.filesByPackage = new Map();
    const languages = new Set([this.languageId, ...this.peers]);
    for (const file of index.files.values()) {
      if (!languages.has(file.language)) continue;
      for (const packageName of this.packagesOf(file)) {
        const bucket = this.filesByPackage.get(packageName);
        if (bucket) bucket.push(file);
        else this.filesByPackage.set(packageName, [file]);
      }
    }
  }

  protected edge(target: string, reason: string): ResolvedEdge {
    return { target, value: 2, reason: `${this.languageId}:${reason}` };
  }

  protected findType(qualifiedName: string): { file: string; type: string } | null {
    return findTypeIn(this.index, this.filesByPackage, qualifiedName);
  }

  protected typeEdge(qualifiedName: string, own: FileEntry, reason = 'import'): ResolvedEdge[] {
    const found = this.findType(qualifiedName);
    return found && found.file !== own.path
      ? [this.edge(entityTarget(found.file, found.type), reason)]
      : [];
  }

  /** The types of `packageName` that `used` names, declared in files other than `file`. */
  protected packageEdges(
    file: FileEntry,
    packageName: string,
    used: Set<string>,
    reason: string
  ): ResolvedEdge[] {
    const edges: ResolvedEdge[] = [];
    for (const sibling of this.filesByPackage.get(packageName) ?? []) {
      if (sibling.path === file.path) continue;
      for (const type of typeNamesOf(this.index, sibling.path)) {
        if (used.has(type)) edges.push(this.edge(entityTarget(sibling.path, type), reason));
      }
    }
    return edges;
  }

  protected importEdges(file: FileEntry, used: Set<string>): ResolvedEdge[] {
    return file.facts.imports.flatMap((record) => {
      if (!record.importedEntities.includes('*')) return this.typeEdge(record.path, file);
      // `import a.b.*` (or `import static a.B.*`): resolve what is actually used.
      const asType = this.typeEdge(record.path, file);
      const found = this.findType(record.path);
      return found ? asType : this.packageEdges(file, record.path, used, 'import');
    });
  }

  resolve(file: FileEntry): ResolvedEdge[] {
    const used = new Set(file.facts.usedNames);
    // Classes of the same package are visible without an import.
    const sameScope = this.visiblePackages(file).flatMap((packageName) =>
      this.packageEdges(file, packageName, used, 'same package')
    );
    return [...this.importEdges(file, used), ...sameScope];
  }
}
