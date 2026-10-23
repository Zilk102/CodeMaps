import { ParseResult } from '../parsing/types';
import { oracleStore } from '../store';

/** Writes the graph nodes and links GraphBuilder derives from one parsed file. */

export const handleSizeExceeded = (
  normalizedPath: string,
  fileName: string,
  churn: number,
  detectedLanguage?: string,
  parentId?: string
) => {
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
};

export const handleMarkdownADR = (
  normalizedPath: string,
  adr: string,
  churn: number,
  detectedLanguage?: string,
  parentId?: string
) => {
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
};

export const addADRLink = (normalizedPath: string, adr: string) => {
  const store = oracleStore.getState();
  const adrPathMatch = Array.from(store.nodes.keys()).find(
    (candidate) =>
      candidate.toLowerCase().includes(adr.toLowerCase()) &&
      store.nodes.get(candidate)?.type === 'adr'
  );
  if (adrPathMatch) {
    store.addLink({ source: normalizedPath, target: adrPathMatch, value: 3, type: 'adr' });
  }
};

export const processEntities = (
  normalizedPath: string,
  entities: ParseResult['entities'],
  churn: number,
  detectedLanguage?: string
) => {
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
};
