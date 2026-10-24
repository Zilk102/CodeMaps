/**
 * Maps graph symbols and file contents to the link endpoints used in stack relationships
 * (`file` or `file#symbol`), and finds which files mention which symbols.
 */
import * as path from 'path';
import { GraphData } from '../store/types';
import { StackRelationshipType, StackStructuralRelationship } from './stackTopologyTypes';
import {
  FileContentEntry,
  GraphSymbolIndex,
  escapeRegExp,
  inferSymbolsForFile,
} from './stackTopologyIdentifiers';

/**
 * Index of class and function symbol names per file (keyed by project-relative path) built from the graph's `file#symbol` node ids.
 */
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

/**
 * Endpoint id of a file for a relationship: `file#symbol` when the graph knows the symbol, otherwise
 * the file path. The symbol is the first of `preferredSymbols`, then of the ones inferred from
 * `text`, that the file has; with neither, it is the file's only symbol, if it has exactly one.
 */
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

  const isAvailable = (candidate: string) => availableSymbols.includes(candidate);
  const inferred = options.text ? inferSymbolsForFile(relativeFilePath, options.text) : [];
  const chosen =
    options.preferredSymbols?.find(isAvailable) ??
    inferred.find(isAvailable) ??
    onlyElement(availableSymbols);

  return chosen === undefined ? relativeFilePath : `${relativeFilePath}#${chosen}`;
};

const onlyElement = (items: string[]): string | undefined =>
  items.length === 1 ? items[0] : undefined;

/** Maps each symbol the extractor finds to the first file that declares it (first one wins). */
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

/**
 * Symbols from `symbolToFileMap` that `text` mentions as whole words, skipping symbols that belong
 * to `excludeFiles`, sorted by file and symbol.
 */
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

/** Builds a relationship record. */
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

/** File contents keyed by their path. */
export const getContentByRelativePath = (entries: FileContentEntry[]) =>
  new Map(entries.map((entry) => [entry.filePath, entry.text]));

/** Maps symbols guessed from each file (its name and declared types) to that file. */
export const buildSymbolToFileMap = (entries: FileContentEntry[]) =>
  buildNamedSymbolToFileMap(entries, (text, filePath) => inferSymbolsForFile(filePath, text));
