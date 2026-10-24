/** Size-bounds tool payloads (list caps, string truncation, repeated-subtree pointers) so one MCP response cannot flood an agent's context. */

/** Limits applied by `compactPayload`. */
export interface CompactOptions {
  /** Longest array that survives; longer ones are cut and the cut is reported. */
  maxItems: number;
  /** Longest string that survives. */
  maxStringLength?: number;
  /** Soft cap on the serialized size; maxItems is halved until the payload fits. */
  maxChars?: number;
}

/** What `compactPayload` removed, attached to a response as `_compaction` so the agent knows the data is partial. */
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

interface CompactContext {
  maxItems: number;
  maxStringLength: number;
  report: CompactionReport;
  seen: Map<string, string>;
}

const compactString = (value: string, ctx: CompactContext): string => {
  if (value.length <= ctx.maxStringLength) return value;
  ctx.report.truncatedStrings += 1;
  return `${value.slice(0, ctx.maxStringLength)}…`;
};

/** Keeps the first `maxItems` entries of an array, compacts each of them and records any cut (the first few arrays only) in the report. */
const compactArray = (value: unknown[], path: string, ctx: CompactContext): unknown => {
  const kept = value.slice(0, ctx.maxItems);
  const { report } = ctx;
  if (value.length > kept.length) {
    report.omittedItems += value.length - kept.length;
    if (report.arrays.length < MAX_REPORTED_ARRAYS) {
      report.arrays.push({ path, total: value.length, kept: kept.length });
    }
  }
  return dedupe(
    kept.map((item, index) => compactValue(item, `${path}[${index}]`, ctx)),
    path,
    report,
    ctx.seen
  );
};

/** Compacts every property of an object after slimming graph-node fields, then replaces it with a pointer if an identical subtree was already emitted. */
const compactObject = (value: Record<string, unknown>, path: string, ctx: CompactContext) =>
  dedupe(
    Object.fromEntries(
      Object.entries(slimGraphNode(value)).map(([key, child]) => [
        key,
        compactValue(child, path ? `${path}.${key}` : key, ctx),
      ])
    ),
    path,
    ctx.report,
    ctx.seen
  );

const compactValue = (value: unknown, path: string, ctx: CompactContext): unknown => {
  if (typeof value === 'string') return compactString(value, ctx);
  if (Array.isArray(value)) return compactArray(value, path, ctx);
  if (value && typeof value === 'object') {
    return compactObject(value as Record<string, unknown>, path, ctx);
  }
  return value;
};

const isGraphNode = (value: Record<string, unknown>) =>
  typeof value.id === 'string' && typeof value.label === 'string' && typeof value.type === 'string';

/**
 * Graph nodes carry layout and bookkeeping fields that agents never use and that repeat
 * the node id; export lists shrink to their names. Values that are not graph nodes pass through.
 */
const slimGraphNode = (value: Record<string, unknown>): Record<string, unknown> => {
  if (!isGraphNode(value)) return value;
  const { group: _group, parentId: _parentId, resolution: _resolution, ...rest } = value;
  void _group;
  void _parentId;
  void _resolution;
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

/**
 * Composite contexts embed the same architecture/pattern blocks several times; the later copies
 * become a `{ $sameAs: path }` pointer to the first one. Only subtrees whose JSON is at least
 * `DEDUPE_MIN_CHARS` long are worth a pointer, and the root (empty path) is never replaced.
 */
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
  let attempt = compactOnce(payload, maxItems, stringLength);

  while (
    JSON.stringify(attempt.compacted).length > maxChars &&
    (maxItems > MIN_ITEMS || stringLength > MIN_STRING_LENGTH)
  ) {
    maxItems = Math.max(MIN_ITEMS, Math.floor(maxItems / 2));
    stringLength = Math.max(MIN_STRING_LENGTH, Math.floor(stringLength / 2));
    attempt = compactOnce(payload, maxItems, stringLength);
  }

  const { report } = attempt;
  return { payload: attempt.compacted as T, compaction: wasCompacted(report) ? report : null };
};

const wasCompacted = (report: CompactionReport) =>
  report.omittedItems > 0 || report.truncatedStrings > 0 || report.dedupedSubtrees > 0;

/** Each attempt starts from a fresh report so halved limits do not double count. */
const compactOnce = (payload: unknown, maxItems: number, stringLength: number) => {
  const report: CompactionReport = {
    omittedItems: 0,
    truncatedStrings: 0,
    dedupedSubtrees: 0,
    maxItemsApplied: maxItems,
    maxStringLengthApplied: stringLength,
    arrays: [],
  };
  const compacted = compactValue(payload, '', {
    maxItems,
    maxStringLength: stringLength,
    report,
    seen: new Map(),
  });
  return { compacted, report };
};
