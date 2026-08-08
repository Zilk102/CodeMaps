import * as fs from 'fs/promises';

// Generated bundles and minified vendor files routinely reach tens of megabytes.
// Reading them whole buys nothing for structural analysis and is the easiest way to
// push the main process into an out-of-memory crash.
export const MAX_ANALYZED_FILE_SIZE = 300 * 1024;

export const readFileWithinLimit = async (filePath: string): Promise<string | null> => {
  const stat = await fs.stat(filePath);
  if (stat.size > MAX_ANALYZED_FILE_SIZE) {
    return null;
  }

  return fs.readFile(filePath, 'utf-8');
};
