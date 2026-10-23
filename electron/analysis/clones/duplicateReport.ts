import { createHash } from 'crypto';
import type { GraphData } from '../../store/types';
import { isTestFile } from '../testFiles';
import type { CloneGroup, CloneInstance } from './detectClones';
import { alignCopies, StreamCache } from './duplicateAlignment';
import { relativeToRoot, toPosix } from './duplicatePaths';
import type {
  DuplicateCopy,
  DuplicateGroup,
  DuplicateReport,
  DuplicateReportOptions,
} from './duplicateReportTypes';
import { chooseSuggestion } from './duplicateSuggestion';

export type {
  DuplicateAction,
  DuplicateCopy,
  DuplicateGroup,
  DuplicateReport,
  DuplicateReportOptions,
  DuplicateSuggestion,
} from './duplicateReportTypes';

const DEFAULT_LIMIT = 10;

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
