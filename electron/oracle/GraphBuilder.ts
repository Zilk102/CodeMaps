import * as path from 'path';
import { ParseResult } from '../parsing/types';
import { oracleStore } from '../store';
import { getParentDir, isLocalSpecifier, normalizePath } from './shared';

export class GraphBuilder {
  ensureDirectoryChainForFile(filePath: string, baseDir: string) {
    const store = oracleStore.getState();
    const normalizedBaseDir = normalizePath(baseDir);
    let currentDir = getParentDir(filePath);

    while (
      currentDir.startsWith(normalizedBaseDir) &&
      currentDir !== normalizedBaseDir &&
      currentDir !== '.' &&
      currentDir !== normalizePath(path.dirname(currentDir))
    ) {
      const parentDir = normalizePath(path.dirname(currentDir));
      const hasParent = parentDir.startsWith(normalizedBaseDir) && parentDir !== normalizedBaseDir;

      if (!store.nodes.has(currentDir)) {
        store.upsertNode({
          id: currentDir,
          label: path.basename(currentDir),
          group: 0,
          type: 'directory',
          churn: 0,
          parentId: hasParent ? parentDir : undefined,
        });
      }

      currentDir = parentDir;
    }
  }

  removeFileArtifacts(filePath: string) {
    const store = oracleStore.getState();
    store.removeLinksBySource(filePath);
    store.removeNodesPrefix(`${filePath}#`);
  }

  removeFile(filePath: string) {
    const store = oracleStore.getState();
    store.removeNode(filePath);
    store.removeLinksBySourceOrTarget(filePath);
    store.removeNodesPrefix(`${filePath}#`);
  }

  removeDirectory(dirPath: string) {
    const store = oracleStore.getState();
    store.removeNode(dirPath);
    store.removeLinksBySourceOrTarget(dirPath);
  }

  applyParsedFile(filePath: string, baseDir: string, churn: number, result: ParseResult) {
    const store = oracleStore.getState();
    const normalizedPath = normalizePath(filePath);
    const fileName = path.basename(normalizedPath);
    const parentDir = getParentDir(normalizedPath);
    const normalizedBaseDir = normalizePath(baseDir);
    const hasParent = parentDir.startsWith(normalizedBaseDir) && parentDir !== normalizedBaseDir;

    this.ensureDirectoryChainForFile(normalizedPath, baseDir);

    if (result.sizeExceeded) {
      if (!store.nodes.has(normalizedPath)) {
        store.upsertNode({
          id: normalizedPath,
          label: fileName,
          group: 1,
          type: 'file',
          churn,
          parentId: hasParent ? parentDir : undefined,
        });
      }
      return;
    }

    const { imports, entities, exports, adr, isMarkdownADR } = result;

    if (isMarkdownADR) {
      store.upsertNode({
        id: normalizedPath,
        label: `ADR: ${adr}`,
        group: 4,
        type: 'adr',
        churn,
        adr: normalizedPath,
        parentId: hasParent ? parentDir : undefined,
      });
      return;
    }

    store.upsertNode({
      id: normalizedPath,
      label: fileName,
      group: 1,
      type: 'file',
      churn,
      adr,
      exports,
      parentId: hasParent ? parentDir : undefined,
    });

    if (adr) {
      const adrPathMatch = Array.from(store.nodes.keys()).find(
        (candidate) =>
          candidate.toLowerCase().includes(adr.toLowerCase()) &&
          store.nodes.get(candidate)?.type === 'adr'
      );
      if (adrPathMatch) {
        store.addLink({ source: normalizedPath, target: adrPathMatch, value: 3, type: 'adr' });
      }
    }

    for (const imp of imports) {
      const resolvedPath = imp.resolvedPath
        ? normalizePath(imp.resolvedPath)
        : isLocalSpecifier(imp.path)
          ? normalizePath(path.resolve(path.dirname(normalizedPath), imp.path))
          : undefined;

      if (!resolvedPath) continue;

      if (imp.importedEntities.length > 0) {
        for (const entityName of imp.importedEntities) {
          if (entityName === '*') {
            store.addLink({
              source: normalizedPath,
              target: resolvedPath,
              value: 1,
              type: 'import',
            });
            continue;
          }

          store.addLink({
            source: normalizedPath,
            target: `${resolvedPath}#${entityName}`,
            value: 2,
            type: 'import',
          });
        }
      } else {
        store.addLink({ source: normalizedPath, target: resolvedPath, value: 1, type: 'import' });
      }
    }

    for (const entity of entities) {
      store.upsertNode({
        id: `${normalizedPath}#${entity.name}`,
        label: entity.name,
        group: entity.type === 'class' ? 2 : 3,
        type: entity.type,
        churn,
        parentId: normalizedPath,
      });
    }
  }
}
