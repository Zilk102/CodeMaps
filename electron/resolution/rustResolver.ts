import { RustModuleTree } from './rustModuleTree';
import {
  entityTarget,
  hasEntity,
  type FileEntry,
  type LanguageResolver,
  type ProjectIndex,
  type ResolvedEdge,
} from './types';

const MAX_REEXPORT_DEPTH = 4;

export { parseCargoToml } from './rustModuleTree';

const moduleEdge = (target: string): ResolvedEdge => ({ target, value: 1, reason: 'rust:use' });

const entityUseEdge = (module: string, name: string): ResolvedEdge => ({
  target: entityTarget(module, name),
  value: 2,
  reason: 'rust:use',
});

export class RustResolver implements LanguageResolver {
  readonly languageId = 'rust';
  private index!: ProjectIndex;
  private tree = new RustModuleTree();

  async prepare(index: ProjectIndex): Promise<void> {
    this.index = index;
    this.tree = new RustModuleTree();
    await this.tree.build(index);
  }

  /** Follows `pub use` re-exports so a name resolves to where it is declared. */
  private itemIn(module: string, name: string, depth = 0): ResolvedEdge | null {
    if (hasEntity(this.index, module, name)) {
      return entityUseEdge(module, name);
    }
    const entry = this.index.files.get(module);
    if (!entry || depth >= MAX_REEXPORT_DEPTH) return null;
    for (const record of entry.facts.imports) {
      const segments = record.path.split('::');
      const exposed = record.alias ?? segments[segments.length - 1];
      if (exposed !== name) continue;
      const resolved = this.walk(module, segments, depth + 1);
      if (resolved) return resolved.edge;
    }
    return null;
  }

  private walk(
    file: string,
    segments: string[],
    depth = 0
  ): { edge: ResolvedEdge; module: string | null } | null {
    const origin = this.tree.start(file, segments);
    if (!origin) return null;
    let current = origin.module;
    for (const segment of origin.rest) {
      const child = this.tree.childFile(current, segment);
      if (child) {
        current = child;
        continue;
      }
      // The segment is an item (possibly re-exported) or unknown: stop at this module.
      const item = this.itemIn(current, segment, depth);
      return { edge: item ?? moduleEdge(current), module: null };
    }
    return { edge: moduleEdge(current), module: current };
  }

  resolve(file: FileEntry): ResolvedEdge[] {
    const edges: ResolvedEdge[] = [];
    /** Names that refer to a module file, for `module::function` uses. */
    const moduleNames = new Map<string, string>();

    this.resolveModuleDeclarations(file, edges, moduleNames);
    this.resolveImports(file, edges, moduleNames);

    for (const use of file.facts.qualifiedUses) {
      const module = moduleNames.get(use.qualifier);
      if (module && hasEntity(this.index, module, use.name)) {
        edges.push(entityUseEdge(module, use.name));
      }
    }
    return edges;
  }

  private resolveModuleDeclarations(
    file: FileEntry,
    edges: ResolvedEdge[],
    moduleNames: Map<string, string>
  ): void {
    for (const name of file.facts.moduleDeclarations ?? []) {
      const child = this.tree.childFile(file.path, name);
      if (!child) continue;
      edges.push({ target: child, value: 1, reason: 'rust:mod' });
      moduleNames.set(name, child);
    }
  }

  private resolveImports(
    file: FileEntry,
    edges: ResolvedEdge[],
    moduleNames: Map<string, string>
  ): void {
    const used = new Set(file.facts.usedNames);
    for (const record of file.facts.imports) {
      const segments = record.path.split('::');
      const resolved = this.walk(file.path, segments);
      if (!resolved || resolved.edge.target === file.path) continue;

      if (record.importedEntities.includes('*') && resolved.module) {
        this.addGlobImportEdges(resolved, used, edges);
        continue;
      }

      edges.push(resolved.edge);
      if (resolved.module) {
        moduleNames.set(record.alias ?? segments[segments.length - 1], resolved.module);
      }
    }
  }

  /** `use module::*`: link the used names that module declares, else the module itself. */
  private addGlobImportEdges(
    resolved: { edge: ResolvedEdge; module: string | null },
    used: Set<string>,
    edges: ResolvedEdge[]
  ): void {
    const module = resolved.module as string;
    let matched = 0;
    for (const name of this.index.entitiesByFile.get(module) ?? []) {
      if (used.has(name) && !name.includes('::')) {
        edges.push(entityUseEdge(module, name));
        matched += 1;
      }
    }
    if (matched === 0) edges.push(resolved.edge);
  }
}
