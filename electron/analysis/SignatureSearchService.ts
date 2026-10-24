/**
 * Searches declaration lines (classes, functions, methods, ...) of the project's files for a text or
 * regex query and maps hits back to graph symbols.
 */
import { GraphData } from '../store/types';
import { readFileWithinLimit } from '../parsing/fileLimits';

import safeRegex from 'safe-regex';

/**
 * One declaration line that matched the query, with the graph symbol it belongs to when one was found.
 */
export interface SignatureSearchMatch {
  nodeId: string;
  symbolId?: string;
  symbolType?: string;
  /** Declaration keyword found on the line (class, interface, function, ...). */
  kind?: string;
  line: number;
  preview: string;
}

/**
 * Matches of a signature search; `count` equals `matches.length`, which is capped by the limit.
 */
export interface SignatureSearchResult {
  count: number;
  matches: SignatureSearchMatch[];
}

const DECLARATION_PATTERNS = [
  /^\s*(export\s+)?(default\s+)?(async\s+)?(class|function|interface|type|enum|struct|trait|impl|def|func|fn|module|namespace)\b/,
  /^\s*(export\s+)?(const|let|var)\s+\w+\s*=\s*(async\s*)?\([^)]*\)\s*=>/,
  /^\s*\w+\s*:\s*(async\s*)?\([^)]*\)\s*=>/,
  /^\s*(public|private|protected|static|readonly|abstract|\s)*\s*\w+\s*\([^;=]*\)\s*(?::\s*[^=]+)?\s*\{/,
];

const KIND_PATTERN =
  /\b(class|interface|type|enum|struct|trait|impl|function|def|func|fn|module|namespace)\b/;

interface FileSymbol {
  id: string;
  label: string;
  type: string;
}

interface SignatureSearchOptions {
  type?: string;
  limit?: number;
  caseSensitive?: boolean;
  regex?: boolean;
  /** Only search files whose path contains this text (case-insensitive). */
  filePath?: string;
}

/**
 * Groups the symbol nodes (ids of the form `file#symbol`) of a graph by the file that contains them.
 */
const groupSymbolsByFile = (graph: GraphData) => {
  const symbolByFile = new Map<string, FileSymbol[]>();
  for (const node of graph.nodes) {
    if (!node.id.includes('#')) continue;
    const [fileId] = node.id.split('#');
    const bucket = symbolByFile.get(fileId) || [];
    bucket.push({ id: node.id, label: node.label, type: node.type });
    symbolByFile.set(fileId, bucket);
  }
  return symbolByFile;
};

const selectFileNodes = (graph: GraphData, filePath?: string) => {
  const fileFilter = filePath?.trim().toLowerCase().replace(/\\/g, '/');
  return graph.nodes.filter(
    (node) => node.type === 'file' && (!fileFilter || node.id.toLowerCase().includes(fileFilter))
  );
};

/**
 * Finds declarations by their signature text, which is cheaper and more precise than grepping files.
 */
export class SignatureSearchService {
  /**
   * Scans the (optionally path-filtered) files for declaration-like lines matching `query`. Stops at
   * `limit` matches (default 20). Throws for a regex that safe-regex rejects; unreadable files are skipped.
   */
  async search(
    graph: GraphData,
    query: string,
    options?: SignatureSearchOptions
  ): Promise<SignatureSearchResult> {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      return { count: 0, matches: [] };
    }

    const limit = options?.limit ?? 20;
    const pattern = this.createPattern(trimmedQuery, !!options?.regex, !!options?.caseSensitive);
    const symbolByFile = groupSymbolsByFile(graph);
    const matches: SignatureSearchMatch[] = [];

    for (const fileNode of selectFileNodes(graph, options?.filePath)) {
      if (matches.length >= limit) break;

      try {
        const content = await readFileWithinLimit(fileNode.id);
        if (content === null) continue;
        this.collectFileMatches({
          fileId: fileNode.id,
          lines: content.split(/\r?\n/),
          fileSymbols: symbolByFile.get(fileNode.id) || [],
          pattern,
          type: options?.type,
          limit,
          matches,
        });
      } catch {
        // Skip unreadable files.
      }
    }

    return {
      count: matches.length,
      matches,
    };
  }

  /**
   * Appends matches from one file's lines to `matches`, in file order, until `limit` is reached. A line
   * counts only if it looks like a declaration and matches the pattern; with `type`, the symbol found
   * on the line must have that type.
   */
  private collectFileMatches(input: {
    fileId: string;
    lines: string[];
    fileSymbols: FileSymbol[];
    pattern: RegExp;
    type?: string;
    limit: number;
    matches: SignatureSearchMatch[];
  }) {
    const { fileId, lines, fileSymbols, pattern, type, limit, matches } = input;
    for (let index = 0; index < lines.length && matches.length < limit; index += 1) {
      const line = lines[index];
      if (!this.isDeclarationLike(line)) continue;
      if (!pattern.test(line)) continue;

      const symbol = fileSymbols.find((candidate) => line.includes(candidate.label));
      if (type && symbol?.type !== type) continue;

      matches.push({
        nodeId: fileId,
        symbolId: symbol?.id,
        symbolType: symbol?.type,
        kind: KIND_PATTERN.exec(line)?.[1],
        line: index + 1,
        preview: line.trim(),
      });
    }
  }

  /**
   * Compiles the query into a case-(in)sensitive RegExp. Regex input is checked with safe-regex first
   * to prevent catastrophic backtracking; plain text is escaped and matched literally.
   */
  private createPattern(query: string, regex: boolean, caseSensitive: boolean) {
    if (regex) {
      if (!safeRegex(query)) {
        throw new Error('Potentially unsafe regex');
      }
      return new RegExp(query, caseSensitive ? '' : 'i');
    }

    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(escaped, caseSensitive ? '' : 'i');
  }

  private isDeclarationLike(line: string) {
    return DECLARATION_PATTERNS.some((pattern) => pattern.test(line));
  }
}
