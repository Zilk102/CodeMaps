import * as fs from 'fs/promises';
import * as path from 'path';
import { GraphData } from '../store/types';

export type JsonRecord = Record<string, unknown>;

export class StackDetectionContext {
  private readonly rootRelativeToAbsolute = new Map<string, string>();
  private readonly basenames = new Map<string, string[]>();
  private readonly rootSuffixMatches = new Map<string, string[]>();
  private readonly reader = new CachedFileReader();

  constructor(private readonly graph: GraphData) {
    for (const node of graph.nodes) {
      if (node.type !== 'file') {
        continue;
      }

      const absolutePath = node.id;
      const relativePath = this.toProjectRelativePath(absolutePath);
      this.rootRelativeToAbsolute.set(relativePath, absolutePath);

      const basename = path.basename(relativePath).toLowerCase();
      const current = this.basenames.get(basename) || [];
      current.push(absolutePath);
      this.basenames.set(basename, current);
    }
  }

  private toProjectRelativePath(filePath: string) {
    return path.relative(this.graph.projectRoot, filePath).replace(/\\/g, '/').toLowerCase();
  }

  hasRelativePath(relativePath: string) {
    return this.rootRelativeToAbsolute.has(relativePath.toLowerCase());
  }

  hasBasename(basename: string) {
    return this.basenames.has(basename.toLowerCase());
  }

  hasSuffix(suffix: string) {
    return this.findBySuffix(suffix).length > 0;
  }

  findBySuffix(suffix: string) {
    const normalizedSuffix = suffix.toLowerCase();
    if (this.rootSuffixMatches.has(normalizedSuffix)) {
      return this.rootSuffixMatches.get(normalizedSuffix)!;
    }

    const matches = Array.from(this.rootRelativeToAbsolute.entries())
      .filter(([relativePath]) => relativePath.endsWith(normalizedSuffix))
      .map(([, absolutePath]) => absolutePath);

    this.rootSuffixMatches.set(normalizedSuffix, matches);
    return matches;
  }

  async readTextByRelativePath(relativePath: string) {
    const absolutePath = this.rootRelativeToAbsolute.get(relativePath.toLowerCase());
    if (!absolutePath) {
      return null;
    }

    return this.readText(absolutePath);
  }

  async readTextsBySuffix(suffix: string) {
    const matches = this.findBySuffix(suffix);
    return Promise.all(matches.map((absolutePath) => this.readText(absolutePath)));
  }

  async readJsonByRelativePath(relativePath: string) {
    const absolutePath = this.rootRelativeToAbsolute.get(relativePath.toLowerCase());
    if (!absolutePath) {
      return null;
    }

    return this.reader.readJson(absolutePath);
  }

  private readText(absolutePath: string): Promise<string | null> {
    return this.reader.readText(absolutePath);
  }
}

/** Reads files once and caches both the raw text and the parsed JSON. */
class CachedFileReader {
  private readonly textCache = new Map<string, Promise<string | null>>();
  private readonly jsonCache = new Map<string, Promise<JsonRecord | null>>();

  readText(absolutePath: string): Promise<string | null> {
    if (!this.textCache.has(absolutePath)) {
      this.textCache.set(
        absolutePath,
        fs.readFile(absolutePath, 'utf-8').catch(() => null)
      );
    }

    return this.textCache.get(absolutePath)!;
  }

  readJson(absolutePath: string): Promise<JsonRecord | null> {
    if (!this.jsonCache.has(absolutePath)) {
      this.jsonCache.set(absolutePath, this.parseJson(absolutePath));
    }

    return this.jsonCache.get(absolutePath)!;
  }

  private async parseJson(absolutePath: string): Promise<JsonRecord | null> {
    const text = await this.readText(absolutePath);
    if (!text) {
      return null;
    }

    try {
      const parsed = JSON.parse(text) as JsonRecord;
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }
}

export const readJsonField = (record: JsonRecord, field: string): unknown => {
  const segments = field.split('.');
  let current: unknown = record;

  for (const segment of segments) {
    if (!current || typeof current !== 'object' || !(segment in current)) {
      return undefined;
    }
    current = (current as JsonRecord)[segment];
  }

  return current;
};

export const includesCaseInsensitive = (source: string, candidate: string) =>
  source.toLowerCase().includes(candidate.toLowerCase());
