import * as fs from 'fs/promises';
import pLimit from 'p-limit';
import type { GraphData } from '../../store/types';
import { isTestFile } from '../testFiles';
import { detectClones, type CloneGroup } from './detectClones';
import { tokenizeFile, type TokenStream } from './tokenize';

const MAX_FILES = 4000;
// Code that is generated or machine-written repeats by construction; nobody refactors it.
const GENERATED_PATH =
  /(^|\/)(migrations|generated|__generated__|gen|vendor|third_party)\/|\.pb\.go$|_pb2(_grpc)?\.pyi?$|\.(generated|g|designer)\.[a-z]+$|\.min\.js$/;
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
  private readonly inflight = new Map<string, Promise<CloneGroup[]>>();

  /** Last computed groups for a project, or null when none were computed yet. */
  peek(root: string | undefined): CloneGroup[] | null {
    return root ? (this.results.get(root)?.groups ?? null) : null;
  }

  refreshFor(graph: GraphData): Promise<CloneGroup[]> {
    const files = graph.nodes.filter((node) => node.type === 'file').map((node) => node.id);
    return this.refresh(graph.projectRoot ?? '', files);
  }

  refresh(root: string, files: string[]): Promise<CloneGroup[]> {
    const running = this.inflight.get(root);
    if (running) return running;
    const candidates = files
      .filter((file) => !isTestFile(file) && !GENERATED_PATH.test(file.replace(/\\/g, '/')))
      .slice(0, MAX_FILES);
    const work = this.compute(root, candidates).finally(() => {
      this.inflight.delete(root);
    });
    this.inflight.set(root, work);
    return work;
  }

  clear() {
    this.streams.clear();
    this.results.clear();
  }

  private async compute(root: string, files: string[]): Promise<CloneGroup[]> {
    const limit = pLimit(STAT_CONCURRENCY);
    const stats = await Promise.all(
      files.map((file) =>
        limit(async () => {
          const stat = await fs.stat(file).catch(() => null);
          return stat ? { file, mtimeMs: stat.mtimeMs, size: stat.size } : null;
        })
      )
    );
    const present = stats.filter((entry): entry is NonNullable<typeof entry> => !!entry);
    const signature = present
      .map((entry) => `${entry.file}:${entry.mtimeMs}:${entry.size}`)
      .join('|');

    const previous = this.results.get(root);
    if (previous?.signature === signature) return previous.groups;

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

    await yieldToEventLoop();
    const groups = detectClones(streams);
    this.results.set(root, { signature, groups });
    return groups;
  }
}

export const cloneIndex = new CloneIndex();
