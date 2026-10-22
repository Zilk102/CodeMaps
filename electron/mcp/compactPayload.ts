export interface CompactOptions {
  /** Longest array that survives; longer ones are cut and the cut is reported. */
  maxItems: number;
  /** Longest string that survives. */
  maxStringLength?: number;
  /** Soft cap on the serialized size; maxItems is halved until the payload fits. */
  maxChars?: number;
}

export interface CompactionReport {
  omittedItems: number;
  truncatedStrings: number;
  /** Repeated sub-trees replaced by a `{ $sameAs: path }` pointer. */
  dedupedSubtrees: number;
  maxItemsApplied: number;
  maxStringLengthApplied: number;
  arrays: Array<{ path: string; total: number; kept: number }>;
}

export const DEFAULT_MAX_STRING_LENGTH = 300;
export const DEFAULT_MAX_CHARS = 24_000;
const MIN_ITEMS = 3;
const MIN_STRING_LENGTH = 100;
const DEDUPE_MIN_CHARS = 600;
const MAX_REPORTED_ARRAYS = 12;

const compactValue = (
  value: unknown,
  path: string,
  maxItems: number,
  maxStringLength: number,
  report: CompactionReport,
  seen: Map<string, string>
): unknown => {
  if (typeof value === 'string') {
    if (value.length <= maxStringLength) return value;
    report.truncatedStrings += 1;
    return `${value.slice(0, maxStringLength)}…`;
  }

  if (Array.isArray(value)) {
    const kept = value.slice(0, maxItems);
    if (value.length > kept.length) {
      report.omittedItems += value.length - kept.length;
      if (report.arrays.length < MAX_REPORTED_ARRAYS) {
        report.arrays.push({ path, total: value.length, kept: kept.length });
      }
    }
    return dedupe(
      kept.map((item, index) =>
        compactValue(item, `${path}[${index}]`, maxItems, maxStringLength, report, seen)
      ),
      path,
      report,
      seen
    );
  }

  if (value && typeof value === 'object') {
    return dedupe(
      Object.fromEntries(
        Object.entries(slimGraphNode(value as Record<string, unknown>)).map(([key, child]) => [
          key,
          compactValue(
            child,
            path ? `${path}.${key}` : key,
            maxItems,
            maxStringLength,
            report,
            seen
          ),
        ])
      ),
      path,
      report,
      seen
    );
  }

  return value;
};

const isGraphNode = (value: Record<string, unknown>) =>
  typeof value.id === 'string' && typeof value.label === 'string' && typeof value.type === 'string';

// Graph nodes carry layout and bookkeeping fields that agents never use and that repeat
// the node id; export lists shrink to their names.
const slimGraphNode = (value: Record<string, unknown>): Record<string, unknown> => {
  if (!isGraphNode(value)) return value;
  const { group: _group, parentId: _parentId, ...rest } = value;
  void _group;
  void _parentId;
  const slim: Record<string, unknown> = { ...rest };
  if (slim.filePath === slim.id) delete slim.filePath;
  if (Array.isArray(slim.exports)) {
    slim.exports = slim.exports.map((entry) =>
      entry && typeof entry === 'object' && 'exportedName' in entry
        ? (entry as { exportedName: unknown }).exportedName
        : entry
    );
  }
  return slim;
};

// Composite contexts embed the same architecture/pattern blocks several times; the
// later copies become a pointer to the first one.
const dedupe = (
  compacted: unknown,
  path: string,
  report: CompactionReport,
  seen: Map<string, string>
): unknown => {
  if (!path) return compacted;
  const serialized = JSON.stringify(compacted);
  if (serialized.length < DEDUPE_MIN_CHARS) return compacted;
  const firstSeenAt = seen.get(serialized);
  if (firstSeenAt) {
    report.dedupedSubtrees += 1;
    return { $sameAs: firstSeenAt };
  }
  seen.set(serialized, path);
  return compacted;
};

/**
 * Bounds an agent-facing payload so it fits an LLM context: arrays are cut to
 * `maxItems`, long strings are shortened, and the cut is described under `_compaction`
 * so the agent knows to ask for more through a narrower tool.
 */
export const compactPayload = <T>(
  payload: T,
  options: CompactOptions
): { payload: T; compaction: CompactionReport | null } => {
  const maxStringLength = options.maxStringLength ?? DEFAULT_MAX_STRING_LENGTH;
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;

  let maxItems = Math.max(1, Math.floor(options.maxItems));
  let stringLength = maxStringLength;
  let report: CompactionReport;
  let compacted: unknown;

  for (;;) {
    report = {
      omittedItems: 0,
      truncatedStrings: 0,
      dedupedSubtrees: 0,
      maxItemsApplied: maxItems,
      maxStringLengthApplied: stringLength,
      arrays: [],
    };
    compacted = compactValue(payload, '', maxItems, stringLength, report, new Map());
    if (JSON.stringify(compacted).length <= maxChars) break;
    if (maxItems <= MIN_ITEMS && stringLength <= MIN_STRING_LENGTH) break;
    maxItems = Math.max(MIN_ITEMS, Math.floor(maxItems / 2));
    stringLength = Math.max(MIN_STRING_LENGTH, Math.floor(stringLength / 2));
  }

  const changed =
    report.omittedItems > 0 || report.truncatedStrings > 0 || report.dedupedSubtrees > 0;
  return { payload: compacted as T, compaction: changed ? report : null };
};
