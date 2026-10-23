import type { ImportRecord } from '../parsing/types';
import { PackageResolver } from './packageResolver';
import { entityTarget, hasEntity, type FileEntry, type ResolvedEdge } from './types';

/** `Acme.App.Sub` -> itself, `Acme.App`, `Acme`: a namespace sees the types of its parents. */
const withParents = (namespace: string): string[] => {
  const segments = namespace.split('.').filter(Boolean);
  return segments.map((_, index) => segments.slice(0, segments.length - index).join('.'));
};

export class CSharpResolver extends PackageResolver {
  constructor() {
    super('c_sharp');
  }

  protected override packagesOf(file: FileEntry): string[] {
    const declared = file.facts.namespaces;
    return declared && declared.length > 0 ? declared : [''];
  }

  protected override visiblePackages(file: FileEntry): string[] {
    const own = this.packagesOf(file).flatMap((namespace) => withParents(namespace));
    return [...new Set([...own, ''])];
  }

  /** The namespace a possibly partial name refers to, searched from the file's own namespaces. */
  private namespaceFor(file: FileEntry, name: string): string | null {
    const candidates = [name, ...this.visiblePackages(file).map((scope) => `${scope}.${name}`)];
    return candidates.find((candidate) => this.filesByPackage.has(candidate)) ?? null;
  }

  /** `Ns.Type` -> the type in namespace Ns, for a namespace or alias used as a qualifier. */
  private qualifiedEdges(file: FileEntry, qualifier: string, name: string): ResolvedEdge[] {
    const namespace = this.namespaceFor(file, qualifier);
    if (!namespace) return [];
    return (this.filesByPackage.get(namespace) ?? [])
      .filter(
        (candidate) => candidate.path !== file.path && hasEntity(this.index, candidate.path, name)
      )
      .map((candidate) => this.edge(entityTarget(candidate.path, name), 'import'));
  }

  private aliasEdges(file: FileEntry, record: ImportRecord): ResolvedEdge[] {
    const asType = this.typeEdge(record.path, file);
    if (asType.length > 0 || !record.alias) return asType;
    // `using M = Acme.Models;` then `M.Order`.
    return file.facts.qualifiedUses
      .filter((use) => use.qualifier === record.alias)
      .flatMap((use) => this.qualifiedEdges(file, record.path, use.name));
  }

  private recordEdges(file: FileEntry, record: ImportRecord, used: Set<string>): ResolvedEdge[] {
    if (record.alias) return this.aliasEdges(file, record);
    if (record.kind === 'static') return this.typeEdge(record.path, file);
    return this.packageEdges(file, record.path, used, 'import');
  }

  protected override importEdges(file: FileEntry, used: Set<string>): ResolvedEdge[] {
    const fromUsings = file.facts.imports.flatMap((record) => this.recordEdges(file, record, used));
    const qualified = file.facts.qualifiedUses.flatMap((use) =>
      this.qualifiedEdges(file, use.qualifier, use.name)
    );
    return [...fromUsings, ...qualified];
  }
}
