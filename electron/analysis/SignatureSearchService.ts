import * as fs from 'fs/promises';
import { GraphData } from '../store';

export interface SignatureSearchMatch {
  nodeId: string;
  symbolId?: string;
  symbolType?: string;
  line: number;
  preview: string;
}

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

export class SignatureSearchService {
  async search(
    graph: GraphData,
    query: string,
    options?: {
      type?: string;
      limit?: number;
      caseSensitive?: boolean;
      regex?: boolean;
    }
  ): Promise<SignatureSearchResult> {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      return { count: 0, matches: [] };
    }

    const limit = options?.limit ?? 20;
    const pattern = this.createPattern(trimmedQuery, !!options?.regex, !!options?.caseSensitive);
    const symbolByFile = new Map<string, Array<{ id: string; label: string; type: string }>>();

    for (const node of graph.nodes) {
      if (!node.id.includes('#')) continue;
      const [fileId] = node.id.split('#');
      const bucket = symbolByFile.get(fileId) || [];
      bucket.push({ id: node.id, label: node.label, type: node.type });
      symbolByFile.set(fileId, bucket);
    }

    const matches: SignatureSearchMatch[] = [];
    const fileNodes = graph.nodes.filter((node) => node.type === 'file');

    for (const fileNode of fileNodes) {
      if (matches.length >= limit) break;

      try {
        const content = await fs.readFile(fileNode.id, 'utf-8');
        const lines = content.split(/\r?\n/);
        const fileSymbols = symbolByFile.get(fileNode.id) || [];

        for (let index = 0; index < lines.length && matches.length < limit; index += 1) {
          const line = lines[index];
          if (!this.isDeclarationLike(line)) continue;
          if (!pattern.test(line)) continue;

          const symbol = fileSymbols.find((candidate) => line.includes(candidate.label));
          if (options?.type && symbol?.type !== options.type) {
            continue;
          }

          matches.push({
            nodeId: fileNode.id,
            symbolId: symbol?.id,
            symbolType: symbol?.type,
            line: index + 1,
            preview: line.trim(),
          });
        }
      } catch {
        // Skip unreadable files.
      }
    }

    return {
      count: matches.length,
      matches,
    };
  }

  private createPattern(query: string, regex: boolean, caseSensitive: boolean) {
    if (regex) {
      return new RegExp(query, caseSensitive ? '' : 'i');
    }

    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(escaped, caseSensitive ? '' : 'i');
  }

  private isDeclarationLike(line: string) {
    return DECLARATION_PATTERNS.some((pattern) => pattern.test(line));
  }
}
