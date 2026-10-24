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
import { conventionForFile } from './conventions';
import { analyzeDocumentationSource } from './fileAnalysis';
import { compareText } from './ordering';
import { MAX_ANALYZED_FILES, MAX_FILE_BYTES, READ_CONCURRENCY, YIELD_EVERY } from './policy';
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
  text: string | null | undefined
): Promise<FileDocumentation | null> =>
  text == null ? Promise.resolve(null) : analyzeDocumentationSource(file, text).catch(() => null);

/** Documentation results per project, with an mtime cache per file. */
export class DocumentationIndex {
  private readonly caches = new Map<string, ResultCache>();
  private readonly inflight = new InflightRuns<DocumentationReport>();
  private readonly reports = new Map<string, DocumentationReport>();

  /** The last report computed for a project root, or null when none was computed yet. */
  peek(root: string | undefined): DocumentationReport | null {
    return root ? (this.reports.get(root) ?? null) : null;
  }

  /** Analyzes the file nodes of a graph. */
  refreshFor(graph: GraphData): Promise<DocumentationReport> {
    const files = graph.nodes.filter((node) => node.type === 'file').map((node) => node.id);
    return this.refresh(graph.projectRoot ?? '', files);
  }

  /** Analyzes the files and reports on them; files of unmeasured languages are ignored. */
  refresh(root: string, files: string[]): Promise<DocumentationReport> {
    return this.inflight.run(root, () => this.compute(root, measurableFiles(files)));
  }

  /** Forgets every cached result and report, for a project reopened from scratch or a changed policy. */
  clear(): void {
    this.caches.clear();
    this.reports.clear();
  }

  /** Rebuilds the report of one project: re-reads only the files whose modification stamp changed, in chunks that yield to the event loop so a large project never blocks the main process. */
  private async compute(root: string, files: string[]): Promise<DocumentationReport> {
    const stamps = await statFiles(files, READ_CONCURRENCY * 2);
    const previous = this.caches.get(root) ?? new Map<string, CachedResult>();
    const next: ResultCache = new Map();
    for (let from = 0; from < stamps.length; from += YIELD_EVERY) {
      await this.analyzeChunk(stamps.slice(from, from + YIELD_EVERY), previous, next);
      await yieldToEventLoop();
    }
    this.caches.set(root, next);
    const results = [...next.values()].flatMap((entry) => (entry.result ? [entry.result] : []));
    const report = buildDocumentationReport(results);
    this.reports.set(root, report);
    return report;
  }

  /** Analyzes the files of a chunk that changed since the last run; copies the others over. */
  private async analyzeChunk(
    chunk: FileStamp[],
    previous: ResultCache,
    next: ResultCache
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
              result: await analyzeText(stamp.file, texts.get(stamp.file)),
            }
      );
    }
  }
}

export const documentationIndex = new DocumentationIndex();
