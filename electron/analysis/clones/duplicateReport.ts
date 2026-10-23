import { createHash } from 'crypto';
import * as path from 'path';
import type { GraphData } from '../../store/types';
import { isTestFile } from '../testFiles';
import type { CloneGroup, CloneInstance } from './detectClones';
import { tokenizeFileWithText, type TextTokenStream } from './tokenize';

export interface DuplicateCopy {
  /** Project-relative, forward slashes. */
  file: string;
  startLine: number;
  endLine: number;
  test: boolean;
}

export type DuplicateAction = 'extract_function' | 'extract_shared_module' | 'merge_into_one';

export interface DuplicateSuggestion {
  action: DuplicateAction;
  sameFile: boolean;
  samePackage: boolean;
  /** How many positions differ between the copies; -1 when the copies could not be aligned. */
  parameters: number;
  /** Project-relative home for the shared code. */
  targetFile?: string;
  /** One sentence an agent can act on. */
  reason: string;
}

export interface DuplicateGroup {
  id: string;
  lineCount: number;
  tokenCount: number;
  copies: DuplicateCopy[];
  suggestion: DuplicateSuggestion;
  /** Up to five short samples, e.g. "users.go:12 `user` vs orders.go:30 `order`". */
  differences: string[];
}

export interface DuplicateReport {
  totalGroups: number;
  /** Sum over groups of lineCount * (copies - 1): the lines that removing the copies saves. */
  duplicatedLines: number;
  /** Worst first, capped by `limit`. */
  groups: DuplicateGroup[];
  omittedGroups: number;
}

export interface DuplicateReportOptions {
  limit?: number;
  minLines?: number;
  includeTests?: boolean;
  /** Only groups with a copy in this file (absolute or project-relative). */
  filePath?: string;
}

const DEFAULT_LIMIT = 10;
const MAX_DIFFERENCES = 5;
const MAX_SAMPLE_LENGTH = 40;

const toPosix = (value: string) => value.replace(/\\/g, '/');

const relativeToRoot = (root: string, file: string): string => {
  const normalizedRoot = toPosix(root).replace(/\/$/, '');
  const normalized = toPosix(file);
  return normalizedRoot && normalized.toLowerCase().startsWith(`${normalizedRoot.toLowerCase()}/`)
    ? normalized.slice(normalizedRoot.length + 1)
    : normalized;
};

interface Candidate {
  group: CloneGroup;
  instances: CloneInstance[];
  copies: DuplicateCopy[];
  saving: number;
}

/** Keeps the copies the caller wants; a group with fewer than two of them is dropped. */
const toCandidate = (
  root: string,
  group: CloneGroup,
  options: DuplicateReportOptions
): Candidate | null => {
  const copies = group.instances.map((instance) => ({
    instance,
    copy: {
      file: relativeToRoot(root, instance.file),
      startLine: instance.startLine,
      endLine: instance.endLine,
      test: isTestFile(instance.file),
    },
  }));
  const kept = options.includeTests ? copies : copies.filter((entry) => !entry.copy.test);
  if (kept.length < 2 || group.lineCount < (options.minLines ?? 0)) return null;
  return {
    group,
    instances: kept.map((entry) => entry.instance),
    copies: kept.map((entry) => entry.copy),
    saving: group.lineCount * (kept.length - 1),
  };
};

const touchesFile = (root: string, candidate: Candidate, filePath: string): boolean => {
  const wanted = toPosix(filePath).toLowerCase();
  const wantedRelative = relativeToRoot(root, filePath).toLowerCase();
  return candidate.instances.some((instance) => {
    const absolute = toPosix(instance.file).toLowerCase();
    return (
      absolute === wanted || relativeToRoot(root, instance.file).toLowerCase() === wantedRelative
    );
  });
};

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
class StreamCache {
  private readonly streams = new Map<string, Promise<TextTokenStream | null>>();

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

const alignCopies = async (cache: StreamCache, instances: CloneInstance[]): Promise<Alignment> => {
  const slices = await Promise.all(instances.map((instance) => sliceOf(cache, instance)));
  const present = slices.filter((slice): slice is CopySlice => slice !== null);
  if (present.length !== slices.length || !isAligned(present)) {
    return { parameters: -1, differences: [] };
  }
  return collectParameters(present);
};

// ---- Suggestions ------------------------------------------------------------------------

const commonDirectory = (files: string[]): string => {
  const parts = files.map((file) =>
    path.posix
      .dirname(file)
      .split('/')
      .filter((p) => p !== '.')
  );
  const common: string[] = [];
  for (let index = 0; index < parts[0].length; index += 1) {
    if (!parts.every((segments) => segments[index] === parts[0][index])) break;
    common.push(parts[0][index]);
  }
  return common.join('/');
};

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;
const copiesOf = (count: number) => `${count} ${count === 1 ? 'copy' : 'copies'}`;

const rangeOf = (copy: DuplicateCopy) => `${copy.file}:${copy.startLine}-${copy.endLine}`;

const parameterNote = (parameters: number): string =>
  parameters < 0
    ? 'compare them by hand to find the parameters, because the copies were edited after being pasted and could not be aligned'
    : `pass the ${plural(parameters, 'differing value')} as parameters`;

const chooseSuggestion = (copies: DuplicateCopy[], parameters: number): DuplicateSuggestion => {
  const files = copies.map((copy) => copy.file);
  const directories = files.map((file) => path.posix.dirname(file));
  const sameFile = files.every((file) => file === files[0]);
  const samePackage = directories.every((directory) => directory === directories[0]);
  const first = copies[0];
  const where = `${copiesOf(copies.length)} (${copies.map(rangeOf).join(', ')})`;

  if (parameters === 0 && samePackage) {
    return {
      action: 'merge_into_one',
      sameFile,
      samePackage,
      parameters,
      targetFile: first.file,
      reason: `${where} are identical: keep the one in ${first.file} and replace the others with a call to it.`,
    };
  }
  if (samePackage) {
    return {
      action: 'extract_function',
      sameFile,
      samePackage,
      parameters,
      targetFile: first.file,
      reason: `Extract one function in ${first.file} for ${where} and ${parameterNote(parameters)}.`,
    };
  }
  const directory = commonDirectory(files);
  const extension = path.posix.extname(first.file);
  return {
    action: 'extract_shared_module',
    sameFile,
    samePackage,
    parameters,
    targetFile: `${directory ? `${directory}/` : ''}shared${extension}`,
    reason: `${where} live in different packages: move the code into a shared module${directory ? ` under ${directory}` : ''} and ${parameters === 0 ? 'import it from each place' : parameterNote(parameters)}.`,
  };
};

const groupId = (group: CloneGroup, first: DuplicateCopy): string =>
  createHash('sha1')
    .update(`${group.tokenCount}|${first.file}|${first.startLine}`)
    .digest('hex')
    .slice(0, 10);

const toDuplicateGroup = async (
  cache: StreamCache,
  candidate: Candidate
): Promise<DuplicateGroup> => {
  const { parameters, differences } = await alignCopies(cache, candidate.instances);
  return {
    id: groupId(candidate.group, candidate.copies[0]),
    lineCount: candidate.group.lineCount,
    tokenCount: candidate.group.tokenCount,
    copies: candidate.copies,
    suggestion: chooseSuggestion(candidate.copies, parameters),
    differences,
  };
};

/**
 * Turns raw clone groups into guidance an agent can act on: where each copy is, how the copies
 * differ (the parameters of the function to extract) and where the shared code should live.
 * Only the groups that make the cut (`limit`, worst first) are re-read from disk.
 */
export const buildDuplicateReport = async (
  graph: Pick<GraphData, 'projectRoot'>,
  groups: CloneGroup[],
  options: DuplicateReportOptions = {}
): Promise<DuplicateReport> => {
  const root = graph.projectRoot ?? '';
  const limit = Math.max(1, options.limit ?? DEFAULT_LIMIT);
  const candidates = groups
    .map((group) => toCandidate(root, group, options))
    .filter((candidate): candidate is Candidate => candidate !== null)
    .filter((candidate) => !options.filePath || touchesFile(root, candidate, options.filePath))
    .sort((a, b) => b.saving - a.saving || a.copies[0].file.localeCompare(b.copies[0].file));

  const cache = new StreamCache();
  const top = await Promise.all(
    candidates.slice(0, limit).map((candidate) => toDuplicateGroup(cache, candidate))
  );
  return {
    totalGroups: candidates.length,
    duplicatedLines: candidates.reduce((sum, candidate) => sum + candidate.saving, 0),
    groups: top,
    omittedGroups: Math.max(0, candidates.length - top.length),
  };
};
