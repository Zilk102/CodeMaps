import { baseName, dirOf, joinPath, type ProjectIndex } from './types';

const MODULE_ROOT_FILES = new Set(['lib.rs', 'main.rs', 'mod.rs']);

export interface CrateInfo {
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

export interface ModuleStart {
  module: string;
  rest: string[];
}

/** Crates, their `mod` tree and the module a `use` path starts in. */
export class RustModuleTree {
  private index!: ProjectIndex;
  private crates: CrateInfo[] = [];
  private crateRoot = new Map<string, string>();
  /** file -> the file of its parent module. */
  private parentOf = new Map<string, string>();
  /** file -> the crate root it belongs to. */
  private ownerRoot = new Map<string, string>();
  private isRoot = new Set<string>();

  async build(index: ProjectIndex): Promise<void> {
    this.index = index;
    this.crates = [];
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

  childFile(parent: string, name: string): string | null {
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

  /** `super::super::x`: climb one parent module per leading `super`. */
  private startFromSuper(file: string, tail: string[]): ModuleStart | null {
    let module: string | undefined = this.parentOf.get(file);
    let rest = tail;
    while (module && rest[0] === 'super') {
      module = this.parentOf.get(module);
      rest = rest.slice(1);
    }
    return module ? { module, rest } : null;
  }

  /** The module an item path starts in, and the segments still to walk. */
  start(file: string, segments: string[]): ModuleStart | null {
    const [first, ...tail] = segments;
    if (first === 'crate') {
      const root = this.rootOf(file);
      return root ? { module: root, rest: tail } : null;
    }
    if (first === 'self') return { module: file, rest: tail };
    if (first === 'super') return this.startFromSuper(file, tail);
    // Module in scope, then crate in the workspace, then the crate root (2015-style paths).
    if (this.childFile(file, first)) return { module: file, rest: segments };
    const crateRoot = this.crateRoot.get(first);
    if (crateRoot) return { module: crateRoot, rest: tail };
    const root = this.rootOf(file);
    if (root && this.childFile(root, first)) return { module: root, rest: segments };
    return null;
  }
}
