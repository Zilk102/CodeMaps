import * as fs from 'fs/promises';
import pLimit from 'p-limit';

/** The size and modification time of a file: what a cache compares to know it is still valid. */
export interface FileStat {
  file: string;
  mtimeMs: number;
  size: number;
}

/**
 * Stats the files with at most `concurrency` calls in flight. Files that are missing or are not
 * regular files are left out; the order of the input is kept.
 */
export const statFiles = async (files: string[], concurrency: number): Promise<FileStat[]> => {
  const limit = pLimit(concurrency);
  const stats = await Promise.all(
    files.map((file) =>
      limit(async () => {
        const stat = await fs.stat(file).catch(() => null);
        return stat?.isFile() ? { file, mtimeMs: stat.mtimeMs, size: stat.size } : null;
      })
    )
  );
  return stats.filter((entry): entry is FileStat => !!entry);
};
