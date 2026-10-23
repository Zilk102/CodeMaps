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

export const normalizeCachedNodes = (baseDir: string, nodes: GraphNode[]) =>
  nodes.map((node) => {
    const normalizedId = node.id.replace(/\\/g, '/');
    const normalizedParentId = node.parentId?.replace(/\\/g, '/');

    if (node.type === 'directory') {
      if (normalizedParentId) {
        return { ...node, id: normalizedId, parentId: normalizedParentId };
      }

      const parentDir = normalizedId.substring(0, normalizedId.lastIndexOf('/'));
      const hasParent = parentDir.startsWith(baseDir) && parentDir !== baseDir;
      return {
        ...node,
        id: normalizedId,
        parentId: hasParent ? parentDir : undefined,
      };
    }

    if (node.type === 'file' || node.type === 'adr') {
      const parentDir = normalizedId.substring(0, normalizedId.lastIndexOf('/'));
      const hasParent = parentDir.startsWith(baseDir) && parentDir !== baseDir;
      return {
        ...node,
        id: normalizedId,
        parentId: hasParent ? parentDir : undefined,
      };
    }

    if (normalizedId.includes('#')) {
      const fileId = normalizedId.split('#')[0];
      return {
        ...node,
        id: normalizedId,
        parentId: fileId,
      };
    }

    return {
      ...node,
      id: normalizedId,
      parentId: normalizedParentId,
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

// Finds the node of `filePath` that a re-export can forward `symbolName` to, trying the
// exact specifier first and then the extension / index fallbacks.
const resolveReExportFile = (nodes: NodeMap, specifier: string): string | undefined =>
  [specifier, ...POSSIBLE_EXTS.map((ext) => specifier + ext)].find((file) => nodes.has(file));

// Resolves a symbol the file declares itself (directly or through an `export { local as x }`).
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

// Follows the file's re-exports that forward `name` to the file that declares it.
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

// Looks up the node a name really refers to, following barrel re-exports
// (`export * from`, `export { a as b } from`) so dependents link to the declaration
// instead of the barrel file.
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

// Tries `<file><ext>` for every known extension, returning the first non-undefined result.
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
