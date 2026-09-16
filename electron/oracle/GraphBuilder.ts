import * as path from 'path';
import { ParseResult } from '../parsing/types';
import { GraphLink, oracleStore } from '../store';
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

  private handleSizeExceeded(
    normalizedPath: string,
    fileName: string,
    churn: number,
    detectedLanguage?: string,
    parentId?: string
  ) {
    const store = oracleStore.getState();
    if (!store.nodes.has(normalizedPath)) {
      store.upsertNode({
        id: normalizedPath,
        label: fileName,
        group: 1,
        type: 'file',
        churn,
        filePath: normalizedPath,
        language: detectedLanguage,
        parentId,
      });
    }
  }

  private handleMarkdownADR(
    normalizedPath: string,
    adr: string,
    churn: number,
    detectedLanguage?: string,
    parentId?: string
  ) {
    oracleStore.getState().upsertNode({
      id: normalizedPath,
      label: `ADR: ${adr}`,
      group: 4,
      type: 'adr',
      churn,
      filePath: normalizedPath,
      language: detectedLanguage,
      adr: normalizedPath,
      parentId,
    });
  }

  private addADRLink(normalizedPath: string, adr: string) {
    const store = oracleStore.getState();
    const adrPathMatch = Array.from(store.nodes.keys()).find(
      (candidate) =>
        candidate.toLowerCase().includes(adr.toLowerCase()) &&
        store.nodes.get(candidate)?.type === 'adr'
    );
    if (adrPathMatch) {
      store.addLink({ source: normalizedPath, target: adrPathMatch, value: 3, type: 'adr' });
    }
  }

  private processImports(normalizedPath: string, imports: ParseResult['imports']) {
    const store = oracleStore.getState();
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
  }

  private processEntities(
    normalizedPath: string,
    entities: ParseResult['entities'],
    churn: number,
    detectedLanguage?: string
  ) {
    const store = oracleStore.getState();
    for (const entity of entities) {
      store.upsertNode({
        id: `${normalizedPath}#${entity.name}`,
        label: entity.name,
        group: entity.type === 'class' ? 2 : 3,
        type: entity.type,
        churn,
        filePath: normalizedPath,
        language: detectedLanguage,
        sourceLocation: entity.location,
        parentId: normalizedPath,
      });
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
      this.handleSizeExceeded(normalizedPath, fileName, churn, result.detectedLanguage, parentId);
      return;
    }

    const { imports, entities, exports, adr, isMarkdownADR } = result;

    if (isMarkdownADR && adr) {
      this.handleMarkdownADR(normalizedPath, adr, churn, result.detectedLanguage, parentId);
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
      parentId,
    });

    if (adr) {
      this.addADRLink(normalizedPath, adr);
    }

    this.processImports(normalizedPath, imports);
    this.processEntities(normalizedPath, entities, churn, result.detectedLanguage);
  }
}
