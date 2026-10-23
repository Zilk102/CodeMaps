import type { ImportRecord } from '../parsing/types';
import { PackageResolver } from './packageResolver';
import {
  dirOf,
  entityTarget,
  hasEntity,
  joinPath,
  normalizeSegments,
  type FileEntry,
  type ProjectIndex,
  type ResolvedEdge,
} from './types';

interface Psr4Mapping {
  /** Namespace prefix with a trailing backslash, e.g. `App\`. */
  prefix: string;
  dir: string;
}

const trimSlashes = (value: string) => value.replace(/^\\+|\\+$/g, '');

/** `autoload.psr-4` and `autoload-dev.psr-4` of one composer.json, directories made absolute. */
export const parseComposerPsr4 = (dir: string, text: string): Psr4Mapping[] => {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return [];
  }
  const mappings: Psr4Mapping[] = [];
  for (const section of ['autoload', 'autoload-dev']) {
    const psr4 = (json as Record<string, { 'psr-4'?: Record<string, string | string[]> }>)?.[
      section
    ]?.['psr-4'];
    for (const [prefix, target] of Object.entries(psr4 ?? {})) {
      for (const relative of Array.isArray(target) ? target : [target]) {
        const normalized = trimSlashes(prefix);
        mappings.push({
          prefix: normalized ? `${normalized}\\` : '',
          dir: normalizeSegments(joinPath(dir, relative)),
        });
      }
    }
  }
  return mappings;
};

/** PHP namespaces use backslashes; the shared package logic uses dots, so names are converted. */
export class PhpResolver extends PackageResolver {
  private mappings: Psr4Mapping[] = [];

  constructor() {
    super('php');
  }

  protected override packagesOf(file: FileEntry): string[] {
    return [(file.facts.packageName ?? '').replace(/\\/g, '.')];
  }

  protected override visiblePackages(file: FileEntry): string[] {
    return this.packagesOf(file);
  }

  override async prepare(index: ProjectIndex): Promise<void> {
    await super.prepare(index);
    const mappings: Psr4Mapping[] = [];
    for (const manifest of index.manifests.composer) {
      const text = await index.readText(manifest);
      if (text) mappings.push(...parseComposerPsr4(dirOf(manifest), text));
    }
    // The most specific namespace prefix wins.
    this.mappings = mappings.sort((a, b) => b.prefix.length - a.prefix.length);
  }

  /** The file and entity a fully qualified class or function name points at. */
  private locate(qualified: string): { file: string; name: string } | null {
    const name = trimSlashes(qualified);
    const cut = name.lastIndexOf('\\');
    const namespace = cut < 0 ? '' : name.slice(0, cut).replace(/\\/g, '.');
    const short = name.slice(cut + 1);
    const declared = (this.filesByPackage.get(namespace) ?? []).find((file) =>
      hasEntity(this.index, file.path, short)
    );
    if (declared) return { file: declared.path, name: short };
    for (const mapping of this.mappings) {
      if (!`${name}`.startsWith(mapping.prefix)) continue;
      const relative = name.slice(mapping.prefix.length).replace(/\\/g, '/');
      const file = joinPath(mapping.dir, `${relative}.php`);
      if (this.index.files.has(file)) return { file, name: short };
    }
    return null;
  }

  private locateEdge(own: FileEntry, qualified: string): ResolvedEdge[] {
    const hit = this.locate(qualified);
    if (!hit || hit.file === own.path) return [];
    return hit.name && hasEntity(this.index, hit.file, hit.name)
      ? [this.edge(entityTarget(hit.file, hit.name), 'import')]
      : [{ target: hit.file, value: 1, reason: 'php:import' }];
  }

  /** `require 'a.php'` / `require __DIR__ . '/a.php'`: relative to the file, then the project root. */
  private includeEdges(file: FileEntry, record: ImportRecord): ResolvedEdge[] {
    const bases = [dirOf(file.path), this.index.root];
    for (const base of bases) {
      const target = normalizeSegments(joinPath(base, record.path));
      if (target !== file.path && this.index.files.has(target)) {
        return [{ target, value: 1, reason: 'php:include' }];
      }
    }
    return [];
  }

  /** Aliases introduced by `use`, by the first segment a qualified name may start with. */
  private aliases(file: FileEntry): Map<string, string> {
    const map = new Map<string, string>();
    for (const record of file.facts.imports) {
      if (record.kind === 'file' || record.kind === 'function' || record.kind === 'const') continue;
      const path = trimSlashes(record.path);
      map.set(record.alias ?? path.slice(path.lastIndexOf('\\') + 1), path);
    }
    return map;
  }

  /** `Sub\Foo`, `Alias\Foo` or `\App\Foo` used inline, resolved to the class it names. */
  private qualifiedEdges(file: FileEntry): ResolvedEdge[] {
    const aliases = this.aliases(file);
    const namespace = file.facts.packageName ?? '';
    return file.facts.qualifiedUses.flatMap((use) => {
      const [first, ...rest] = trimSlashes(use.qualifier).split('\\');
      let base: string;
      if (use.qualifier.startsWith('\\')) base = trimSlashes(use.qualifier);
      else if (aliases.has(first)) base = [aliases.get(first), ...rest].join('\\');
      else base = [namespace, first, ...rest].filter(Boolean).join('\\');
      return this.locateEdge(file, `${base}\\${use.name}`);
    });
  }

  protected override importEdges(file: FileEntry): ResolvedEdge[] {
    const fromUse = file.facts.imports.flatMap((record) => {
      if (record.kind === 'file') return this.includeEdges(file, record);
      if (record.kind === 'const') return [];
      return this.locateEdge(file, record.path);
    });
    return [...fromUse, ...this.qualifiedEdges(file)];
  }
}
