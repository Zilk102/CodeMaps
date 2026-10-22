import {
  baseName,
  dirOf,
  entityTarget,
  hasEntity,
  joinPath,
  type FileEntry,
  type LanguageResolver,
  type ProjectIndex,
  type ResolvedEdge,
} from './types';

const MAX_REEXPORT_DEPTH = 4;
const MODULE_ROOT_FILES = new Set(['lib.rs', 'main.rs', 'mod.rs']);

interface CrateInfo {
  name: string;
  dir: string;
  roots: string[];
}

/** The few Cargo.toml facts that matter here, without a full TOML parser. */
export const parseCargoToml = (dir: string, text: string): CrateInfo | null => {
  let section = '';
  let name: string | null = null;
  let libPath: string | null = null;
  const binPaths: string[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    const header = /^\[{1,2}\s*([^\]]+?)\s*\]{1,2}$/.exec(line);
    if (header) {
      section = header[1];
      continue;
    }
    const pair = /^(\w+)\s*=\s*"([^"]*)"/.exec(line);
    if (!pair) continue;
    if (section === 'package' && pair[1] === 'name') name = pair[2];
    if (section === 'lib' && pair[1] === 'path') libPath = pair[2];
    if (section === 'bin' && pair[1] === 'path') binPaths.push(pair[2]);
  }
  if (!name) return null;

  const roots = [
    joinPath(dir, libPath ?? 'src/lib.rs'),
    ...(binPaths.length > 0
      ? binPaths.map((path) => joinPath(dir, path))
      : [joinPath(dir, 'src/main.rs')]),
  ];
  return { name: name.replace(/-/g, '_'), dir, roots };
};

const stemOf = (path: string) => baseName(path).replace(/\.rs$/, '');

export class RustResolver implements LanguageResolver {
  readonly languageId = 'rust';
  private index!: ProjectIndex;
  private crates: CrateInfo[] = [];
  /** crate root file -> crate name. */
  private rootCrate = new Map<string, string>();
  private crateRoot = new Map<string, string>();
  /** file -> the file of its parent module. */
  private parentOf = new Map<string, string>();
  /** file -> the crate root it belongs to. */
  private ownerRoot = new Map<string, string>();
  private isRoot = new Set<string>();

  async prepare(index: ProjectIndex): Promise<void> {
    this.index = index;
    this.crates = [];
    this.rootCrate.clear();
    this.crateRoot.clear();
    this.parentOf.clear();
    this.ownerRoot.clear();
    this.isRoot.clear();

    for (const manifest of index.manifests.cargo) {
      const text = await index.readText(manifest);
      const info = text ? parseCargoToml(dirOf(manifest), text) : null;
      if (info) this.crates.push(info);
    }

    for (const crate of this.crates) {
      for (const root of crate.roots) {
        if (!index.files.has(root)) continue;
        this.isRoot.add(root);
        this.rootCrate.set(root, crate.name);
        // The library root represents the crate for `use crate_name::...`.
        if (!this.crateRoot.has(crate.name) || root.endsWith('/lib.rs')) {
          this.crateRoot.set(crate.name, root);
        }
        this.indexModuleTree(root, root);
      }
    }
  }

  private indexModuleTree(file: string, root: string, seen = new Set<string>()): void {
    if (seen.has(file)) return;
    seen.add(file);
    this.ownerRoot.set(file, root);
    const entry = this.index.files.get(file);
    for (const name of entry?.facts.moduleDeclarations ?? []) {
      const child = this.childFile(file, name);
      if (!child) continue;
      this.parentOf.set(child, file);
      this.indexModuleTree(child, root, seen);
    }
  }

  private childFile(parent: string, name: string): string | null {
    const directory = dirOf(parent);
    const ownsDirectory = this.isRoot.has(parent) || MODULE_ROOT_FILES.has(baseName(parent));
    const base = ownsDirectory ? directory : joinPath(directory, stemOf(parent));
    for (const candidate of [joinPath(base, `${name}.rs`), joinPath(base, name, 'mod.rs')]) {
      if (this.index.files.has(candidate)) return candidate;
    }
    return null;
  }

  private rootOf(file: string): string | null {
    const known = this.ownerRoot.get(file);
    if (known) return known;
    // Not reachable through `mod` declarations: fall back to the enclosing crate.
    const crate = this.crates
      .filter((candidate) => file.startsWith(`${candidate.dir}/`))
      .sort((a, b) => b.dir.length - a.dir.length)[0];
    return crate ? (this.crateRoot.get(crate.name) ?? null) : null;
  }

  /** The module an item path starts in, and the segments still to walk. */
  private start(file: string, segments: string[]): { module: string; rest: string[] } | null {
    const [first, ...tail] = segments;
    if (first === 'crate') {
      const root = this.rootOf(file);
      return root ? { module: root, rest: tail } : null;
    }
    if (first === 'self') return { module: file, rest: tail };
    if (first === 'super') {
      let module: string | undefined = this.parentOf.get(file);
      let rest = tail;
      while (module && rest[0] === 'super') {
        module = this.parentOf.get(module);
        rest = rest.slice(1);
      }
      return module ? { module, rest } : null;
    }
    // Module in scope, then crate in the workspace, then the crate root (2015-style paths).
    if (this.childFile(file, first)) return { module: file, rest: segments };
    const crateRoot = this.crateRoot.get(first);
    if (crateRoot) return { module: crateRoot, rest: tail };
    const root = this.rootOf(file);
    if (root && this.childFile(root, first)) return { module: root, rest: segments };
    return null;
  }

  /** Follows `pub use` re-exports so a name resolves to where it is declared. */
  private itemIn(module: string, name: string, depth = 0): ResolvedEdge | null {
    if (hasEntity(this.index, module, name)) {
      return { target: entityTarget(module, name), value: 2, reason: 'rust:use' };
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
    const origin = this.start(file, segments);
    if (!origin) return null;
    let current = origin.module;
    for (let position = 0; position < origin.rest.length; position += 1) {
      const segment = origin.rest[position];
      const child = this.childFile(current, segment);
      if (child) {
        current = child;
        continue;
      }
      const item = this.itemIn(current, segment, depth);
      if (item) return { edge: item, module: null };
      return { edge: { target: current, value: 1, reason: 'rust:use' }, module: null };
    }
    return { edge: { target: current, value: 1, reason: 'rust:use' }, module: current };
  }

  resolve(file: FileEntry): ResolvedEdge[] {
    const edges: ResolvedEdge[] = [];
    /** Names that refer to a module file, for `module::function` uses. */
    const moduleNames = new Map<string, string>();

    for (const name of file.facts.moduleDeclarations ?? []) {
      const child = this.childFile(file.path, name);
      if (!child) continue;
      edges.push({ target: child, value: 1, reason: 'rust:mod' });
      moduleNames.set(name, child);
    }

    const used = new Set(file.facts.usedNames);
    for (const record of file.facts.imports) {
      const segments = record.path.split('::');
      const resolved = this.walk(file.path, segments);
      if (!resolved || resolved.edge.target === file.path) continue;

      if (record.importedEntities.includes('*') && resolved.module) {
        const module = resolved.module;
        let matched = 0;
        for (const name of this.index.entitiesByFile.get(module) ?? []) {
          if (used.has(name) && !name.includes('::')) {
            edges.push({ target: entityTarget(module, name), value: 2, reason: 'rust:use' });
            matched += 1;
          }
        }
        if (matched === 0) edges.push(resolved.edge);
        continue;
      }

      edges.push(resolved.edge);
      if (resolved.module) {
        moduleNames.set(record.alias ?? segments[segments.length - 1], resolved.module);
      }
    }

    for (const use of file.facts.qualifiedUses) {
      const module = moduleNames.get(use.qualifier);
      if (module && hasEntity(this.index, module, use.name)) {
        edges.push({ target: entityTarget(module, use.name), value: 2, reason: 'rust:use' });
      }
    }
    return edges;
  }
}
