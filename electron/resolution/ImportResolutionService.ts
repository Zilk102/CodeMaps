import fg from 'fast-glob';
import * as fs from 'fs/promises';
import { ORACLE_IGNORE_GLOBS, normalizePath } from '../oracle/shared';
import { GraphLink, GraphNode, oracleStore } from '../store';
import { GoResolver } from './goResolver';
import { JavaResolver } from './javaResolver';
import { PythonResolver } from './pythonResolver';
import { RustResolver } from './rustResolver';
import { dirOf, type FileEntry, type LanguageResolver, type ProjectIndex } from './types';

/** Reasons start with the language id, which is how resolver-owned links are recognised. */
const OWNED_REASON = /^(go|python|java|rust):/;
export const isResolverLink = (link: GraphLink): boolean =>
  link.type === 'import' && !!link.reason && OWNED_REASON.test(link.reason);

const MANIFEST_IGNORE = [
  ...ORACLE_IGNORE_GLOBS.filter((glob) => !glob.includes('/target/')),
  '**/vendor/**',
];

const MANIFEST_CACHE_MS = 5_000;

export interface ImportResolutionResult {
  linksAdded: number;
  filesResolved: number;
}

const collectIndex = (
  nodes: Map<string, GraphNode>,
  root: string,
  resolverLanguages: Set<string>
): Pick<ProjectIndex, 'files' | 'filesByDir' | 'entitiesByFile'> => {
  const files = new Map<string, FileEntry>();
  const filesByDir = new Map<string, string[]>();
  const entitiesByFile = new Map<string, Set<string>>();

  for (const node of nodes.values()) {
    if (
      node.type === 'file' &&
      node.resolution &&
      node.language &&
      resolverLanguages.has(node.language)
    ) {
      files.set(node.id, { path: node.id, language: node.language, facts: node.resolution });
      const directory = dirOf(node.id);
      const bucket = filesByDir.get(directory);
      if (bucket) bucket.push(node.id);
      else filesByDir.set(directory, [node.id]);
    } else if ((node.type === 'class' || node.type === 'function') && node.parentId) {
      const names = entitiesByFile.get(node.parentId);
      if (names) names.add(node.label);
      else entitiesByFile.set(node.parentId, new Set([node.label]));
    }
  }
  void root;
  return { files, filesByDir, entitiesByFile };
};

export class ImportResolutionService {
  private readonly resolvers: LanguageResolver[];

  constructor(
    resolvers: LanguageResolver[] = [
      new GoResolver(),
      new PythonResolver(),
      new JavaResolver(),
      new RustResolver(),
    ]
  ) {
    this.resolvers = resolvers;
  }

  private manifestCache: { root: string; at: number; value: ProjectIndex['manifests'] } | null =
    null;

  /** Manifests change rarely, but the pass runs on every watcher flush: glob at most every few seconds. */
  private async findManifests(root: string): Promise<ProjectIndex['manifests']> {
    const cached = this.manifestCache;
    if (cached && cached.root === root && Date.now() - cached.at < MANIFEST_CACHE_MS) {
      return cached.value;
    }
    const value = await this.globManifests(root);
    this.manifestCache = { root, at: Date.now(), value };
    return value;
  }

  private async globManifests(root: string): Promise<ProjectIndex['manifests']> {
    const find = async (name: string) =>
      (await fg(`**/${name}`, { cwd: root, absolute: true, ignore: MANIFEST_IGNORE, deep: 6 })).map(
        normalizePath
      );
    const [goMod, cargo] = await Promise.all([find('go.mod'), find('Cargo.toml')]);
    return { goMod, cargo };
  }

  /**
   * Recomputes every resolver-owned import link from the raw facts on the file nodes. It is a
   * full pass on purpose: one added or removed file can change what many imports resolve to.
   */
  async resolveAll(): Promise<ImportResolutionResult> {
    const state = oracleStore.getState();
    const root = normalizePath(state.baseDir);
    const languages = new Set(this.resolvers.map((resolver) => resolver.languageId));
    const parts = collectIndex(state.nodes, root, languages);

    if (parts.files.size === 0) {
      state.replaceLinks(isResolverLink, []);
      return { linksAdded: 0, filesResolved: 0 };
    }

    const index: ProjectIndex = {
      root,
      ...parts,
      manifests: await this.findManifests(root),
      readText: (path) => fs.readFile(path, 'utf-8').catch(() => null),
    };

    const links: GraphLink[] = [];
    const seen = new Set<string>();
    for (const resolver of this.resolvers) {
      await resolver.prepare(index);
      for (const file of index.files.values()) {
        if (file.language !== resolver.languageId) continue;
        for (const edge of resolver.resolve(file)) {
          if (edge.target === file.path) continue;
          const key = `${file.path}\u0000${edge.target}`;
          if (seen.has(key)) continue;
          seen.add(key);
          links.push({
            source: file.path,
            target: edge.target,
            value: edge.value,
            type: 'import',
            reason: edge.reason,
          });
        }
      }
    }

    // Targets that are not nodes (an entity that was renamed, a directory outside the index)
    // would be dropped by the snapshot anyway; keeping the store clean helps every consumer.
    const nodes = oracleStore.getState().nodes;
    const valid = links.filter((link) => nodes.has(link.target));
    oracleStore.getState().replaceLinks(isResolverLink, valid);
    return { linksAdded: valid.length, filesResolved: index.files.size };
  }
}
