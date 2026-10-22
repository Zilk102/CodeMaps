import {
  entityTarget,
  hasEntity,
  type FileEntry,
  type LanguageResolver,
  type ProjectIndex,
  type ResolvedEdge,
} from './types';

/** Top-level type names of a file: nested members are labelled `Outer.member`, so plain names. */
const typeNames = (index: ProjectIndex, file: string): string[] =>
  [...(index.entitiesByFile.get(file) ?? [])].filter((name) => !name.includes('.'));

export class JavaResolver implements LanguageResolver {
  readonly languageId = 'java';
  private index!: ProjectIndex;
  /** package name -> files declaring it. */
  private filesByPackage = new Map<string, FileEntry[]>();

  async prepare(index: ProjectIndex): Promise<void> {
    this.index = index;
    this.filesByPackage = new Map();
    for (const file of index.files.values()) {
      if (file.language !== 'java') continue;
      const packageName = file.facts.packageName ?? '';
      const bucket = this.filesByPackage.get(packageName);
      if (bucket) bucket.push(file);
      else this.filesByPackage.set(packageName, [file]);
    }
  }

  /** `a.b.Outer.Inner` -> the file declaring Outer in package a.b (strip trailing segments). */
  private findType(qualifiedName: string): { file: string; type: string } | null {
    const segments = qualifiedName.split('.');
    for (let cut = segments.length - 1; cut >= 0; cut -= 1) {
      const packageName = segments.slice(0, cut).join('.');
      const type = segments[cut];
      const candidates = this.filesByPackage.get(packageName) ?? [];
      const owner = candidates.find((candidate) => hasEntity(this.index, candidate.path, type));
      if (owner) return { file: owner.path, type };
    }
    return null;
  }

  private packageEdges(
    file: FileEntry,
    packageName: string,
    used: Set<string>,
    reason: string
  ): ResolvedEdge[] {
    const edges: ResolvedEdge[] = [];
    for (const sibling of this.filesByPackage.get(packageName) ?? []) {
      if (sibling.path === file.path) continue;
      for (const type of typeNames(this.index, sibling.path)) {
        if (used.has(type)) {
          edges.push({ target: entityTarget(sibling.path, type), value: 2, reason });
        }
      }
    }
    return edges;
  }

  resolve(file: FileEntry): ResolvedEdge[] {
    const edges: ResolvedEdge[] = [];
    const used = new Set(file.facts.usedNames);

    for (const record of file.facts.imports) {
      if (record.importedEntities.includes('*')) {
        // `import a.b.*` (or `import static a.B.*`): resolve what is actually used.
        const asType = this.findType(record.path);
        if (asType) {
          edges.push({
            target: entityTarget(asType.file, asType.type),
            value: 2,
            reason: 'java:import',
          });
        } else {
          edges.push(...this.packageEdges(file, record.path, used, 'java:import'));
        }
        continue;
      }
      const found = this.findType(record.path);
      if (found && found.file !== file.path) {
        edges.push({
          target: entityTarget(found.file, found.type),
          value: 2,
          reason: 'java:import',
        });
      }
    }

    // Classes of the same package are visible without an import.
    edges.push(...this.packageEdges(file, file.facts.packageName ?? '', used, 'java:same package'));
    return edges;
  }
}
