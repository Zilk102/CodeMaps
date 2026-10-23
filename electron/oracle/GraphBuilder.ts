import * as path from 'path';
import { ParseResult } from '../parsing/types';
import { GraphLink, oracleStore } from '../store';
import { getParentDir, normalizePath } from './shared';
import { linkImports, resolveReExports } from './graphImportLinks';
import {
  addADRLink,
  handleMarkdownADR,
  handleSizeExceeded,
  processEntities,
} from './graphNodeWriters';

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
          filePath: currentDir,
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

  removeLinksByTypes(types: string[]) {
    oracleStore.getState().removeLinksByTypes(types);
  }

  applyEnrichmentLinks(links: GraphLink[]) {
    const store = oracleStore.getState();
    for (const link of links) {
      store.addLink(link);
    }
  }

  applyParsedFile(filePath: string, baseDir: string, churn: number, result: ParseResult) {
    const normalizedPath = normalizePath(filePath);
    const fileName = path.basename(normalizedPath);
    const parentDir = getParentDir(normalizedPath);
    const normalizedBaseDir = normalizePath(baseDir);
    const hasParent = parentDir.startsWith(normalizedBaseDir) && parentDir !== normalizedBaseDir;
    const parentId = hasParent ? parentDir : undefined;

    this.ensureDirectoryChainForFile(normalizedPath, baseDir);

    if (result.sizeExceeded) {
      handleSizeExceeded(normalizedPath, fileName, churn, result.detectedLanguage, parentId);
      return;
    }

    const { imports, entities, exports, reExports, adr, isMarkdownADR } = result;

    if (isMarkdownADR && adr) {
      handleMarkdownADR(normalizedPath, adr, churn, result.detectedLanguage, parentId);
      return;
    }

    oracleStore.getState().upsertNode({
      id: normalizedPath,
      label: fileName,
      group: 1,
      type: 'file',
      churn,
      filePath: normalizedPath,
      language: result.detectedLanguage,
      adr,
      exports,
      reExports: resolveReExports(normalizedPath, reExports),
      resolution: result.resolution,
      parentId,
    });

    if (adr) {
      addADRLink(normalizedPath, adr);
    }

    linkImports(normalizedPath, imports);
    processEntities(normalizedPath, entities, churn, result.detectedLanguage);
  }
}
