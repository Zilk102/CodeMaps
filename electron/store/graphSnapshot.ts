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

  const resolveSymbolTarget = (filePath: string, symbolName: string) => {
    const fileNode = state.nodes.get(filePath);

    if (state.nodes.has(`${filePath}#${symbolName}`)) {
      return `${filePath}#${symbolName}`;
    }

    if (!fileNode?.exports?.length) {
      return undefined;
    }

    const directExport = fileNode.exports.find(
      (record) =>
        record.exportedName === symbolName || (symbolName === 'default' && record.isDefault)
    );

    if (directExport?.localName && state.nodes.has(`${filePath}#${directExport.localName}`)) {
      return `${filePath}#${directExport.localName}`;
    }

    if (directExport && state.nodes.has(`${filePath}#${directExport.exportedName}`)) {
      return `${filePath}#${directExport.exportedName}`;
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
