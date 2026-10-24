/**
 * Keeps the documentation results of the open project. Every file is analyzed once and cached by
 * modification time and size, so a refresh after one edit re-reads only that file; reads run in
 * parallel with a bound, parsing runs one file at a time and yields to the event loop.
 */
import * as fs from 'fs/promises';
import * as path from 'path';
import pLimit from 'p-limit';
import type { GraphData } from '../../store/types';
import { type FileStat, statFiles } from '../fileStats';
import { InflightRuns } from '../inflightRuns';
import { loadProjectConfig } from '../projectConfig/configLoader';
import { conventionForFile } from './conventions';
import { analyzeDocumentationSource } from './fileAnalysis';
import { compareText } from './ordering';
import {
  DEFAULT_DOCUMENTATION_LIMITS,
  MAX_ANALYZED_FILES,
  MAX_FILE_BYTES,
  READ_CONCURRENCY,
  YIELD_EVERY,
  type DocumentationLimits,
} from './policy';
import { buildDocumentationReport } from './report';
import type { DocumentationReport, FileDocumentation } from './types';

type FileStamp = FileStat;

interface CachedResult {
  mtimeMs: number;
  size: number;
  result: FileDocumentation | null;
}

type ResultCache = Map<string, CachedResult>;

const yieldToEventLoop = () => new Promise<void>((resolve) => setImmediate(resolve));

/** Files with a measured language, without duplicates, in a fixed order, capped. */
const measurableFiles = (files: string[]): string[] =>
  [...new Set(files)]
    .filter((file) => conventionForFile(path.extname(file).toLowerCase()) !== null)
    .sort(compareText)
    .slice(0, MAX_ANALYZED_FILES);

const isFresh = (cached: CachedResult | undefined, stamp: FileStamp): boolean =>
  !!cached && cached.mtimeMs === stamp.mtimeMs && cached.size === stamp.size;

/** Reads the files in parallel (bounded); a missing, unreadable or oversized file reads as null. */
const readTexts = async (stamps: FileStamp[]): Promise<Map<string, string | null>> => {
  const limit = pLimit(READ_CONCURRENCY);
  const texts = await Promise.all(
    stamps.map((stamp) =>
      limit(() =>
        stamp.size > MAX_FILE_BYTES ? null : fs.readFile(stamp.file, 'utf-8').catch(() => null)
      )
    )
  );
  return new Map(stamps.map((stamp, index) => [stamp.file, texts[index]]));
};

const analyzeText = (
  file: string,
  text: string | null | undefined,
  limits: DocumentationLimits
): Promise<FileDocumentation | null> =>
  text == null
    ? Promise.resolve(null)
    : analyzeDocumentationSource(file, text, limits).catch(() => null);

const limitsKey = (limits: DocumentationLimits): string =>
  `${limits.headerMinLines}:${limits.functionMinLines}`;

/** Documentation results per project, with an mtime cache per file. */
export class DocumentationIndex {
  private readonly caches = new Map<string, ResultCache>();
  private readonly inflight = new InflightRuns<DocumentationReport>();
  private readonly reports = new Map<string, DocumentationReport>();
  private readonly limitsByRoot = new Map<string, string>();

  /** The last report computed for a project root, or null when none was computed yet. */
  peek(root: string | undefined): DocumentationReport | null {
    return root ? (this.reports.get(root) ?? null) : null;
  }

  /**
   * Analyzes the file nodes of a graph under the project's config: excluded files are skipped, the
   * header and function limits come from the config, and a project that disabled documentation
   * gets an empty report (nothing required, so nothing missing).
   */
  refreshFor(graph: GraphData): Promise<DocumentationReport> {
    const root = graph.projectRoot ?? '';
    const { config, isExcluded } = loadProjectConfig(root);
    if (!config.documentation.enabled) {
      const empty = buildDocumentationReport([]);
      this.reports.set(root, empty);
      return Promise.resolve(empty);
    }
    const files = graph.nodes
      .filter((node) => node.type === 'file' && !isExcluded(node.id))
      .map((node) => node.id);
    return this.refresh(root, files, config.documentation);
  }

  /**
   * Analyzes the files and reports on them; files of unmeasured languages are ignored. `limits`
   * are the project's header and function size limits; a change of limits drops the cached
   * per-file results of the project because they were decided under the old ones.
   */
  refresh(
    root: string,
    files: string[],
    limits: DocumentationLimits = DEFAULT_DOCUMENTATION_LIMITS
  ): Promise<DocumentationReport> {
    return this.inflight.run(root, () => this.compute(root, measurableFiles(files), limits));
  }

  /** Forgets every cached result and report, for a project reopened from scratch or a changed policy. */
  clear(): void {
    this.caches.clear();
    this.reports.clear();
    this.limitsByRoot.clear();
  }

  /** Rebuilds the report of one project: re-reads only the files whose modification stamp changed, in chunks that yield to the event loop so a large project never blocks the main process. */
  private async compute(
    root: string,
    files: string[],
    limits: DocumentationLimits
  ): Promise<DocumentationReport> {
    const stamps = await statFiles(files, READ_CONCURRENCY * 2);
    const key = limitsKey(limits);
    const sameLimits = this.limitsByRoot.get(root) === key;
    const previous =
      (sameLimits ? this.caches.get(root) : undefined) ?? new Map<string, CachedResult>();
    const next: ResultCache = new Map();
    for (let from = 0; from < stamps.length; from += YIELD_EVERY) {
      await this.analyzeChunk(stamps.slice(from, from + YIELD_EVERY), previous, next, limits);
      await yieldToEventLoop();
    }
    this.caches.set(root, next);
    this.limitsByRoot.set(root, key);
    const results = [...next.values()].flatMap((entry) => (entry.result ? [entry.result] : []));
    const report = buildDocumentationReport(results);
    this.reports.set(root, report);
    return report;
  }

  /** Analyzes the files of a chunk that changed since the last run; copies the others over. */
  private async analyzeChunk(
    chunk: FileStamp[],
    previous: ResultCache,
    next: ResultCache,
    limits: DocumentationLimits
  ): Promise<void> {
    const texts = await readTexts(
      chunk.filter((stamp) => !isFresh(previous.get(stamp.file), stamp))
    );
    for (const stamp of chunk) {
      const cached = previous.get(stamp.file);
      const reuse = cached !== undefined && isFresh(cached, stamp);
      next.set(
        stamp.file,
        reuse
          ? cached
          : {
              mtimeMs: stamp.mtimeMs,
              size: stamp.size,
              result: await analyzeText(stamp.file, texts.get(stamp.file), limits),
            }
      );
    }
  }
}

export const documentationIndex = new DocumentationIndex();
