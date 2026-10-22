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

export const buildValidGraphSnapshot = (state: GraphSnapshotState): GraphData => {
  const validLinks: GraphLink[] = [];

  const MAX_REEXPORT_DEPTH = 6;

  // Looks up the node a name really refers to, following barrel re-exports
  // (`export * from`, `export { a as b } from`) so dependents link to the declaration
  // instead of the barrel file.
  const resolveSymbolTarget = (
    filePath: string,
    symbolName: string,
    visited: Set<string> = new Set()
  ): string | undefined => {
    const visitKey = `${filePath}#${symbolName}`;
    if (visited.has(visitKey) || visited.size > MAX_REEXPORT_DEPTH) {
      return undefined;
    }
    visited.add(visitKey);

    const fileNode = state.nodes.get(filePath);

    if (state.nodes.has(`${filePath}#${symbolName}`)) {
      return `${filePath}#${symbolName}`;
    }

    if (!fileNode) {
      return undefined;
    }

    const directExport = fileNode.exports?.find(
      (record) =>
        record.exportedName === symbolName || (symbolName === 'default' && record.isDefault)
    );

    if (directExport?.localName && state.nodes.has(`${filePath}#${directExport.localName}`)) {
      return `${filePath}#${directExport.localName}`;
    }

    if (directExport && state.nodes.has(`${filePath}#${directExport.exportedName}`)) {
      return `${filePath}#${directExport.exportedName}`;
    }

    const originalName = directExport?.localName ?? symbolName;
    for (const reExport of fileNode.reExports ?? []) {
      if (!reExport.entities.includes('*') && !reExport.entities.includes(originalName)) {
        continue;
      }
      for (const targetFile of [
        reExport.target,
        ...POSSIBLE_EXTS.map((ext) => reExport.target + ext),
      ]) {
        if (!state.nodes.has(targetFile)) continue;
        const forwarded = resolveSymbolTarget(targetFile, originalName, visited);
        if (forwarded) return forwarded;
        break;
      }
    }

    return undefined;
  };

  state.links.forEach((link) => {
    let resolvedTarget = link.target;
    let isValid = false;

    if (resolvedTarget.includes('#')) {
      if (state.nodes.has(resolvedTarget)) {
        isValid = true;
      } else {
        const [filePath, entityName] = resolvedTarget.split('#');
        const directResolvedSymbol = resolveSymbolTarget(filePath, entityName);
        if (directResolvedSymbol) {
          resolvedTarget = directResolvedSymbol;
          isValid = true;
        }

        if (isValid) {
          validLinks.push({ ...link, target: resolvedTarget });
          return;
        }

        for (const ext of POSSIBLE_EXTS) {
          const resolvedSymbol = resolveSymbolTarget(`${filePath}${ext}`, entityName);
          if (resolvedSymbol) {
            resolvedTarget = resolvedSymbol;
            isValid = true;
            break;
          }
        }

        if (!isValid) {
          if (state.nodes.has(filePath)) {
            resolvedTarget = filePath;
            isValid = true;
          } else {
            for (const ext of POSSIBLE_EXTS) {
              const fullFile = `${filePath}${ext}`;
              if (state.nodes.has(fullFile)) {
                resolvedTarget = fullFile;
                isValid = true;
                break;
              }
            }
          }
        }
      }
    } else if (state.nodes.has(resolvedTarget)) {
      isValid = true;
    } else {
      const targetNode = state.nodes.get(resolvedTarget);
      if (targetNode && targetNode.type === 'directory') {
        isValid = true;
      } else {
        for (const ext of POSSIBLE_EXTS) {
          const candidate = resolvedTarget + ext;
          if (state.nodes.has(candidate)) {
            resolvedTarget = candidate;
            isValid = true;
            break;
          }
        }
      }
    }

    if (isValid) {
      validLinks.push({ ...link, target: resolvedTarget });
    }
  });

  return {
    projectRoot: state.baseDir,
    nodes: Array.from(state.nodes.values()),
    links: validLinks,
    refreshTelemetry: state.refreshTelemetry,
  };
};
