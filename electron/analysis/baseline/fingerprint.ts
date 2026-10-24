/**
 * Fingerprints: the identity of a finding that survives edits elsewhere in the file.
 *
 * A fingerprint is built from the kind, the project-relative file and the symbol name only. Line
 * numbers are left out on purpose, so adding a line above a legacy function does not turn it into
 * a new finding. Findings that share a name in one file (overloads, repeated clones) are told
 * apart by their order of appearance.
 */
import { relativeToRoot } from '../projectConfig/projectPaths';
import type { CurrentFinding, FindingDraft, FindingKind } from './types';

const SEPARATOR = '|';

/** The fingerprint of the first finding with this kind, file and symbol. */
export const fingerprintBase = (kind: FindingKind, file: string, symbol: string): string =>
  [kind, file, symbol].join(SEPARATOR);

/** The finding kind a fingerprint was made for. */
export const kindOfFingerprint = (fingerprint: string): FindingKind =>
  fingerprint.split(SEPARATOR, 1)[0] as FindingKind;

const compareDrafts = (a: FindingDraft, b: FindingDraft): number =>
  a.path.localeCompare(b.path) || a.line - b.line || a.symbol.localeCompare(b.symbol);

/**
 * Gives every draft its fingerprint. The drafts are ordered by file, line and name first, so the
 * `#2`, `#3` suffixes of same-named findings depend only on their order, not on exact lines.
 */
export const fingerprintFindings = (root: string, drafts: FindingDraft[]): CurrentFinding[] => {
  const seen = new Map<string, number>();
  return [...drafts].sort(compareDrafts).map((draft) => {
    const file = relativeToRoot(root, draft.path);
    const base = fingerprintBase(draft.kind, file, draft.symbol);
    const ordinal = (seen.get(base) ?? 0) + 1;
    seen.set(base, ordinal);
    const { kind, path, relatedPath, symbol, measure, severity, message } = draft;
    return {
      kind,
      path,
      relatedPath,
      symbol,
      measure,
      severity,
      message,
      file,
      fingerprint: ordinal === 1 ? base : `${base}#${ordinal}`,
    };
  });
};
