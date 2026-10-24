import type { GraphData } from '../../store/types';
import { type FileStat, statFiles } from '../fileStats';
import { isGeneratedPath } from '../generatedFiles';
import { InflightRuns } from '../inflightRuns';
import { isTestFile } from '../testFiles';
import { detectClones, type CloneGroup } from './detectClones';
import { tokenizeFile, type TokenStream } from './tokenize';

const MAX_FILES = 4000;
const STAT_CONCURRENCY = 32;
/** Tokenizing is CPU work on the main thread: give the event loop a turn every few files. */
const YIELD_EVERY = 15;

interface CachedStream {
  mtimeMs: number;
  size: number;
  stream: TokenStream | null;
}

const yieldToEventLoop = () => new Promise<void>((resolve) => setImmediate(resolve));

/**
 * Keeps the duplicated-code groups of the open project. Token streams are cached per file
 * (by modification time), so a refresh after one edit re-reads only that file.
 */
export class CloneIndex {
  private readonly streams = new Map<string, CachedStream>();
  private readonly results = new Map<string, { signature: string; groups: CloneGroup[] }>();
  private readonly inflight = new InflightRuns<CloneGroup[]>();

  /** Last computed groups for a project, or null when none were computed yet. */
  peek(root: string | undefined): CloneGroup[] | null {
    return root ? (this.results.get(root)?.groups ?? null) : null;
  }

  /** `includeTests` adds test files to the search; they are left out by default. */
  refreshFor(graph: GraphData, includeTests = false): Promise<CloneGroup[]> {
    const files = graph.nodes.filter((node) => node.type === 'file').map((node) => node.id);
    return this.refresh(graph.projectRoot ?? '', files, includeTests);
  }

  /**
   * Recomputes the groups for an explicit file list, de-duplicating concurrent calls per project.
   * Tests (unless `includeTests`) and generated files are dropped and the list is capped at 4000
   * files.
   */
  refresh(root: string, files: string[], includeTests = false): Promise<CloneGroup[]> {
    // Groups with and without tests are different results, so they are cached apart.
    const key = includeTests ? `${root}::tests` : root;
    return this.inflight.run(key, () => {
      const candidates = files
        .filter(
          // Generated code repeats by construction; nobody refactors it.
          (file) => (includeTests || !isTestFile(file)) && !isGeneratedPath(file)
        )
        .slice(0, MAX_FILES);
      return this.compute(key, candidates);
    });
  }

  /** Forgets every cached token stream and result, so the next refresh starts cold. */
  clear() {
    this.streams.clear();
    this.results.clear();
  }

  /**
   * Detects clones for one cache key. Returns the previous groups untouched when no file changed
   * (same path, mtime and size), otherwise re-tokenizes only the changed files and runs detection
   * again.
   */
  private async compute(key: string, files: string[]): Promise<CloneGroup[]> {
    const present = await statFiles(files, STAT_CONCURRENCY);
    const signature = present
      .map((entry) => `${entry.file}:${entry.mtimeMs}:${entry.size}`)
      .join('|');

    const previous = this.results.get(key);
    if (previous?.signature === signature) return previous.groups;

    const streams = await this.loadStreams(present);
    await yieldToEventLoop();
    const groups = detectClones(streams);
    this.results.set(key, { signature, groups });
    return groups;
  }

  /** Token streams of the files, re-tokenizing only those that changed since the last run. */
  private async loadStreams(present: FileStat[]): Promise<TokenStream[]> {
    const streams: TokenStream[] = [];
    let processed = 0;
    for (const entry of present) {
      let cached = this.streams.get(entry.file);
      if (!cached || cached.mtimeMs !== entry.mtimeMs || cached.size !== entry.size) {
        const stream = await tokenizeFile(entry.file).catch(() => null);
        cached = { mtimeMs: entry.mtimeMs, size: entry.size, stream };
        this.streams.set(entry.file, cached);
        processed += 1;
        if (processed % YIELD_EVERY === 0) await yieldToEventLoop();
      }
      if (cached.stream) streams.push(cached.stream);
    }
    return streams;
  }
}

export const cloneIndex = new CloneIndex();
