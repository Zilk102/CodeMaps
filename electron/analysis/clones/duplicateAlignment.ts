import * as path from 'path';
import type { CloneInstance } from './detectClones';
import { tokenizeFileWithText, type TextTokenStream } from './tokenize';
import { toPosix } from './duplicatePaths';

const MAX_DIFFERENCES = 5;
const MAX_SAMPLE_LENGTH = 40;

// ---- Alignment of the copies' raw tokens ------------------------------------------------

interface Alignment {
  parameters: number;
  differences: string[];
}

const shorten = (text: string): string => {
  const flat = text.replace(/\s+/g, ' ').replace(/`/g, "'");
  return flat.length > MAX_SAMPLE_LENGTH ? `${flat.slice(0, MAX_SAMPLE_LENGTH - 1)}…` : flat;
};

/** Token streams with their raw text, read once per file. */
export class StreamCache {
  private readonly streams = new Map<string, Promise<TextTokenStream | null>>();

  /**
   * Raw token stream of a file, tokenized on first request and shared afterwards; null when the
   * file cannot be read or tokenized.
   */
  get(file: string): Promise<TextTokenStream | null> {
    let stream = this.streams.get(file);
    if (!stream) {
      stream = tokenizeFileWithText(file).catch(() => null);
      this.streams.set(file, stream);
    }
    return stream;
  }
}

interface CopySlice {
  stream: TextTokenStream;
  start: number;
  end: number;
}

const sliceOf = async (cache: StreamCache, instance: CloneInstance): Promise<CopySlice | null> => {
  const stream = await cache.get(instance.file);
  if (!stream || instance.tokenEnd > stream.tokens.length) return null;
  return { stream, start: instance.tokenStart, end: instance.tokenEnd };
};

/** The copies line up when their normalized tokens are the same at every position. */
const isAligned = (slices: CopySlice[]): boolean => {
  const [first, ...rest] = slices;
  const length = first.end - first.start;
  return rest.every((slice) => {
    if (slice.end - slice.start !== length) return false;
    for (let offset = 0; offset < length; offset += 1) {
      if (slice.stream.tokens[slice.start + offset] !== first.stream.tokens[first.start + offset]) {
        return false;
      }
    }
    return true;
  });
};

const describeDifference = (slices: CopySlice[], offset: number): string =>
  slices
    .map(
      (slice) =>
        `${path.posix.basename(toPosix(slice.stream.file))}:${slice.stream.lines[slice.start + offset]} \`${shorten(slice.stream.texts[slice.start + offset])}\``
    )
    .join(' vs ');

/**
 * Positions where the copies' names, numbers or strings differ. A value that is renamed in
 * several places (`user` -> `order` five times) is one parameter, so equal tuples count once.
 */
const collectParameters = (slices: CopySlice[]): Alignment => {
  const length = slices[0].end - slices[0].start;
  const seen = new Set<string>();
  const differences: string[] = [];
  for (let offset = 0; offset < length; offset += 1) {
    const values = slices.map((slice) => slice.stream.texts[slice.start + offset]);
    if (values.every((value) => value === values[0])) continue;
    const key = JSON.stringify(values);
    if (seen.has(key)) continue;
    seen.add(key);
    if (differences.length < MAX_DIFFERENCES) differences.push(describeDifference(slices, offset));
  }
  return { parameters: seen.size, differences };
};

/**
 * Compares the raw tokens of all copies of a group position by position. `parameters` is the number
 * of distinct differing value tuples (the arguments of a function to extract), -1 when the copies
 * are not token-aligned or a file cannot be read; `differences` holds a few readable samples.
 */
export const alignCopies = async (
  cache: StreamCache,
  instances: CloneInstance[]
): Promise<Alignment> => {
  const slices = await Promise.all(instances.map((instance) => sliceOf(cache, instance)));
  const present = slices.filter((slice): slice is CopySlice => slice !== null);
  if (present.length !== slices.length || !isAligned(present)) {
    return { parameters: -1, differences: [] };
  }
  return collectParameters(present);
};
