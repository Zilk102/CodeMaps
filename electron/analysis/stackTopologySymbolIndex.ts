import * as path from 'path';
import { GraphData } from '../store/types';
import { StackRelationshipType, StackStructuralRelationship } from './stackTopologyTypes';
import {
  FileContentEntry,
  GraphSymbolIndex,
  escapeRegExp,
  inferSymbolsForFile,
} from './stackTopologyIdentifiers';

export const buildGraphSymbolIndex = (graph: GraphData): GraphSymbolIndex => {
  const index = new Map<string, Set<string>>();

  for (const node of graph.nodes) {
    if (!['class', 'function'].includes(node.type)) {
      continue;
    }

    const [fileId, symbolName] = node.id.split('#');
    if (!fileId || !symbolName) {
      continue;
    }

    const relativeFile = fileId
      .replace(/\\/g, '/')
      .startsWith(graph.projectRoot.replace(/\\/g, '/'))
      ? path.relative(graph.projectRoot, fileId).replace(/\\/g, '/')
      : fileId.replace(/\\/g, '/');
    const symbols = index.get(relativeFile) || new Set<string>();
    symbols.add(symbolName);
    index.set(relativeFile, symbols);
  }

  return index;
};

export const resolveSymbolEndpoint = (
  relativeFilePath: string,
  symbolIndex: GraphSymbolIndex,
  options: {
    preferredSymbols?: string[];
    text?: string;
  } = {}
) => {
  const availableSymbols = Array.from(symbolIndex.get(relativeFilePath) || []);
  if (availableSymbols.length === 0) {
    return relativeFilePath;
  }

  for (const candidate of options.preferredSymbols || []) {
    if (availableSymbols.includes(candidate)) {
      return `${relativeFilePath}#${candidate}`;
    }
  }

  if (options.text) {
    for (const inferredSymbol of inferSymbolsForFile(relativeFilePath, options.text)) {
      if (availableSymbols.includes(inferredSymbol)) {
        return `${relativeFilePath}#${inferredSymbol}`;
      }
    }
  }

  if (availableSymbols.length === 1) {
    return `${relativeFilePath}#${availableSymbols[0]}`;
  }

  return relativeFilePath;
};

export const buildNamedSymbolToFileMap = (
  entries: FileContentEntry[],
  extractor: (text: string, filePath: string) => string[]
) => {
  const symbolToFile = new Map<string, string>();

  for (const entry of entries) {
    for (const symbol of extractor(entry.text, entry.filePath)) {
      if (!symbolToFile.has(symbol)) {
        symbolToFile.set(symbol, entry.filePath);
      }
    }
  }

  return symbolToFile;
};

export const findReferencedSymbolMatches = (
  text: string,
  symbolToFileMap: Map<string, string>,
  excludeFiles: string[] = []
) => {
  const excludeSet = new Set(excludeFiles);
  const matches = new Map<string, { filePath: string; symbol: string }>();

  for (const [symbol, filePath] of symbolToFileMap.entries()) {
    if (excludeSet.has(filePath)) {
      continue;
    }

    if (new RegExp(`\\b${escapeRegExp(symbol)}\\b`).test(text)) {
      matches.set(`${filePath}#${symbol}`, { filePath, symbol });
    }
  }

  return Array.from(matches.values()).sort(
    (a, b) => a.filePath.localeCompare(b.filePath) || a.symbol.localeCompare(b.symbol)
  );
};

export const createRelationship = (
  source: string,
  target: string,
  type: StackRelationshipType,
  reason: string
): StackStructuralRelationship => ({
  source,
  target,
  type,
  reason,
});

export const getContentByRelativePath = (entries: FileContentEntry[]) =>
  new Map(entries.map((entry) => [entry.filePath, entry.text]));

export const buildSymbolToFileMap = (entries: FileContentEntry[]) =>
  buildNamedSymbolToFileMap(entries, (text, filePath) => inferSymbolsForFile(filePath, text));
