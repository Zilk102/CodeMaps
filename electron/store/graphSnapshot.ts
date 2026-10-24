/** Builds consistent graph snapshots from store state: normalizes cached nodes and repairs links whose targets moved or are barrel re-exports. */

import { GraphData, GraphLink, GraphNode, GraphSnapshotState } from './types';

const POSSIBLE_EXTS = [
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mts',
  '.cts',
  '.mjs',
  '.cjs',
  '/index.ts',
  '/index.tsx',
  '/index.js',
  '/index.jsx',
  '/index.mts',
  '/index.cts',
  '/index.mjs',
  '/index.cjs',
];

/** The containing directory of a path, or undefined at (or above) the project root. */
const parentDirectoryWithin = (baseDir: string, normalizedId: string): string | undefined => {
  const parentDir = normalizedId.substring(0, normalizedId.lastIndexOf('/'));
  const hasParent = parentDir.startsWith(baseDir) && parentDir !== baseDir;
  return hasParent ? parentDir : undefined;
};

/** Parent id for a normalized node: the folder for directories, files and ADRs (none at the project root), the owning file for a `file#symbol` id, otherwise the cached parent. */
const normalizedParentOf = (
  baseDir: string,
  node: GraphNode,
  normalizedId: string,
  normalizedParentId: string | undefined
): string | undefined => {
  if (node.type === 'directory' && normalizedParentId) return normalizedParentId;
  if (node.type === 'directory' || node.type === 'file' || node.type === 'adr') {
    return parentDirectoryWithin(baseDir, normalizedId);
  }
  if (normalizedId.includes('#')) return normalizedId.split('#')[0];
  return normalizedParentId;
};

/** Converts ids and parents of nodes loaded from the on-disk cache to forward slashes and recomputes parents, since caches may come from another platform or older version. */
export const normalizeCachedNodes = (baseDir: string, nodes: GraphNode[]) =>
  nodes.map((node) => {
    const normalizedId = node.id.replace(/\\/g, '/');
    const normalizedParentId = node.parentId?.replace(/\\/g, '/');
    return {
      ...node,
      id: normalizedId,
      parentId: normalizedParentOf(baseDir, node, normalizedId, normalizedParentId),
    };
  });

// Raw import facts only feed link resolution in the main process; consumers of the snapshot
// (renderer, MCP tools, Kuzu) never read them and they can be large.
const withoutResolutionFacts = (node: GraphNode): GraphNode => {
  if (!node.resolution) return node;
  const { resolution: _resolution, ...rest } = node;
  void _resolution;
  return rest;
};

type NodeMap = Map<string, GraphNode>;

const MAX_REEXPORT_DEPTH = 6;

// Finds the file node that a re-export `specifier` points at, trying the exact specifier
// first and then the extension / index fallbacks.
const resolveReExportFile = (nodes: NodeMap, specifier: string): string | undefined =>
  [specifier, ...POSSIBLE_EXTS.map((ext) => specifier + ext)].find((file) => nodes.has(file));

/**
 * Resolves a symbol the file declares itself (directly or through an `export { local as x }`).
 */
const resolveOwnSymbol = (
  nodes: NodeMap,
  fileNode: GraphNode,
  filePath: string,
  symbolName: string
): { target?: string; originalName: string } => {
  const directExport = fileNode.exports?.find(
    (record) => record.exportedName === symbolName || (symbolName === 'default' && record.isDefault)
  );

  if (directExport?.localName && nodes.has(`${filePath}#${directExport.localName}`)) {
    return { target: `${filePath}#${directExport.localName}`, originalName: symbolName };
  }
  if (directExport && nodes.has(`${filePath}#${directExport.exportedName}`)) {
    return { target: `${filePath}#${directExport.exportedName}`, originalName: symbolName };
  }
  return { originalName: directExport?.localName ?? symbolName };
};

const reExportsName = (
  reExport: NonNullable<GraphNode['reExports']>[number],
  name: string
): boolean => reExport.entities.includes('*') || reExport.entities.includes(name);

/**
 * Follows the file's re-exports that forward `name` to the file that declares it.
 */
const resolveThroughReExports = (
  nodes: NodeMap,
  fileNode: GraphNode,
  name: string,
  visited: Set<string>
): string | undefined => {
  for (const reExport of fileNode.reExports ?? []) {
    if (!reExportsName(reExport, name)) continue;
    const targetFile = resolveReExportFile(nodes, reExport.target);
    if (!targetFile) continue;
    const forwarded = resolveSymbolTarget(nodes, targetFile, name, visited);
    if (forwarded) return forwarded;
  }
  return undefined;
};

/**
 * Looks up the node a name really refers to, following barrel re-exports
 * (`export * from`, `export { a as b } from`) so dependents link to the declaration
 * instead of the barrel file.
 * Gives up (returns undefined) on cycles and after `MAX_REEXPORT_DEPTH` hops.
 */
const resolveSymbolTarget = (
  nodes: NodeMap,
  filePath: string,
  symbolName: string,
  visited: Set<string> = new Set()
): string | undefined => {
  const visitKey = `${filePath}#${symbolName}`;
  if (visited.has(visitKey) || visited.size > MAX_REEXPORT_DEPTH) {
    return undefined;
  }
  visited.add(visitKey);

  if (nodes.has(visitKey)) {
    return visitKey;
  }

  const fileNode = nodes.get(filePath);
  if (!fileNode) {
    return undefined;
  }

  const own = resolveOwnSymbol(nodes, fileNode, filePath, symbolName);
  if (own.target) return own.target;

  return resolveThroughReExports(nodes, fileNode, own.originalName, visited);
};

/**
 * Tries `<file><ext>` for every known extension, returning the first non-undefined result.
 */
const firstWithExtension = (
  file: string,
  resolve: (candidate: string) => string | undefined
): string | undefined => {
  for (const ext of POSSIBLE_EXTS) {
    const resolved = resolve(`${file}${ext}`);
    if (resolved) return resolved;
  }
  return undefined;
};

/** Resolves a `file#symbol` link target: the exact node, the declaration behind re-exports (also trying extension variants of the file), then the file itself. Undefined when nothing matches. */
const resolveSymbolLinkTarget = (nodes: NodeMap, target: string): string | undefined => {
  if (nodes.has(target)) return target;

  const [filePath, entityName] = target.split('#');
  return (
    resolveSymbolTarget(nodes, filePath, entityName) ??
    firstWithExtension(filePath, (candidate) =>
      resolveSymbolTarget(nodes, candidate, entityName)
    ) ??
    (nodes.has(filePath) ? filePath : undefined) ??
    firstWithExtension(filePath, (candidate) => (nodes.has(candidate) ? candidate : undefined))
  );
};

// Returns the node id a link target really points at, or undefined when it dangles.
const resolveLinkTarget = (nodes: NodeMap, target: string): string | undefined => {
  if (target.includes('#')) return resolveSymbolLinkTarget(nodes, target);
  if (nodes.has(target)) return target;
  return firstWithExtension(target, (candidate) => (nodes.has(candidate) ? candidate : undefined));
};

/** Snapshot of the store as `GraphData`: links with dangling targets are dropped, targets that only needed an extension or re-export lookup are rewritten to the real node id, and import-resolution facts are stripped from the nodes. */
export const buildValidGraphSnapshot = (state: GraphSnapshotState): GraphData => {
  const validLinks: GraphLink[] = [];

  for (const link of state.links) {
    const resolvedTarget = resolveLinkTarget(state.nodes, link.target);
    if (resolvedTarget !== undefined) {
      validLinks.push({ ...link, target: resolvedTarget });
    }
  }

  return {
    projectRoot: state.baseDir,
    nodes: Array.from(state.nodes.values(), withoutResolutionFacts),
    links: validLinks,
    refreshTelemetry: state.refreshTelemetry,
  };
};
