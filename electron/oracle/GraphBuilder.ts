/** Applies parse results and file-system changes to the graph store. */

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

/** The only writer of file-derived nodes and links; the indexer and the watcher go through it so the graph stays consistent. */
export class GraphBuilder {
  /** Creates the missing directory nodes between `baseDir` and the file (never `baseDir` itself), each pointing at its parent. */
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

  /** Removes a file's outgoing links and its symbol nodes but keeps the file node itself, ready for a fresh parse. */
  removeFileArtifacts(filePath: string) {
    const store = oracleStore.getState();
    store.removeLinksBySource(filePath);
    store.removeNodesPrefix(`${filePath}#`);
  }

  /** Removes a file completely: its node, all links to or from it and its symbol nodes. */
  removeFile(filePath: string) {
    const store = oracleStore.getState();
    store.removeNode(filePath);
    store.removeLinksBySourceOrTarget(filePath);
    store.removeNodesPrefix(`${filePath}#`);
  }

  /** Removes a directory node and the links attached to it; nodes inside it are removed by their own events. */
  removeDirectory(dirPath: string) {
    const store = oracleStore.getState();
    store.removeNode(dirPath);
    store.removeLinksBySourceOrTarget(dirPath);
  }

  /** Removes every link whose type is in `types`. */
  removeLinksByTypes(types: string[]) {
    oracleStore.getState().removeLinksByTypes(types);
  }

  /** Adds derived (framework/build) links to the graph. */
  applyEnrichmentLinks(links: GraphLink[]) {
    const store = oracleStore.getState();
    for (const link of links) {
      store.addLink(link);
    }
  }

  /**
   * Writes the graph elements of one parsed file: directory chain, the file node (or a bare placeholder for oversized files, or an ADR node for markdown ADRs),
   * ADR link, import links and one node per declared entity.
   */
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
