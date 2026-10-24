// Types and pure helpers for the activity heatmap: colour buckets, bar widths, date window and
// author summaries.
/**
 * Git activity of one file over the analysed period: commits, added and deleted lines, last change
 * and authors.
 */
export interface FileChurn {
  filePath: string;
  commits: number;
  additions: number;
  deletions: number;
  lastModified: string;
  authors: string[];
}

/**
 * Heatmap result for the period: the files (most active first), the maxima used for scaling, the
 * total file count and the analysed date range.
 */
export interface HeatmapData {
  files: FileChurn[];
  maxCommits: number;
  maxChanges: number;
  totalFiles: number;
  timeRange: { from: string; to: string };
}

/** Number of files listed before the "and N more" footer. */
export const MAX_VISIBLE_FILES = 50;

/** Cool-to-hot colour classes of the intensity buckets (low to critical). */
export const HEAT_LEGEND = [
  { key: 'low', swatch: 'bg-blue-100 dark:bg-blue-900/20' },
  { key: 'medium', swatch: 'bg-green-100 dark:bg-green-900/20' },
  { key: 'high', swatch: 'bg-yellow-100 dark:bg-yellow-900/20' },
  { key: 'veryHigh', swatch: 'bg-orange-100 dark:bg-orange-900/20' },
  { key: 'critical', swatch: 'bg-red-100 dark:bg-red-900/20' },
] as const;

/**
 * Tailwind classes for a row, from cool blue to hot red in five steps by the share of the busiest
 * file's commit count.
 */
export function getHeatColor(commits: number, max: number): string {
  const intensity = Math.min(commits / max, 1);
  // From cool (blue) to hot (red)
  if (intensity < 0.2) return 'bg-blue-100 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200';
  if (intensity < 0.4)
    return 'bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-200';
  if (intensity < 0.6)
    return 'bg-yellow-100 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-200';
  if (intensity < 0.8)
    return 'bg-orange-100 dark:bg-orange-900/20 text-orange-800 dark:text-orange-200';
  return 'bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-200';
}

/**
 * Width of a row's background bar as a percentage string, at least 2% so every file shows a bar.
 */
export function getHeatWidth(commits: number, max: number): string {
  return `${Math.max((commits / max) * 100, 2)}%`;
}

/** Start of the analysed window: `days` days before `now`. */
export function computeSince(days: number, now: Date = new Date()): Date {
  const since = new Date(now);
  since.setDate(since.getDate() - days);
  return since;
}

/** File name for the row title; falls back to the whole path when it ends in a slash. */
export function fileBaseName(filePath: string): string {
  return filePath.split('/').pop() || filePath;
}

/** "a, b, c +N" author summary. */
export function summarizeAuthors(authors: string[], limit = 3): string {
  const shown = authors.slice(0, limit).join(', ');
  return authors.length > limit ? `${shown} +${authors.length - limit}` : shown;
}
