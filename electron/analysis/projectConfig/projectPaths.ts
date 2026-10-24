/**
 * Path helpers shared by the project configuration and the baseline: where the files live and
 * how a file is named relative to the project root.
 */
import * as path from 'path';

/** Folder inside a project that holds CodeMaps' per-project files. */
export const CODEMAPS_DIRECTORY = '.codemaps';

/** Absolute path of a file inside the project's `.codemaps` folder. */
export const codemapsFilePath = (root: string, fileName: string): string =>
  path.join(root, CODEMAPS_DIRECTORY, fileName);

/** Forward-slash form of a path, the only form stored in files and compared in tests. */
export const toPosix = (value: string): string => value.replace(/\\/g, '/');

/**
 * Name of `file` relative to `root` with forward slashes. A path outside the root, or already
 * relative, comes back normalized but otherwise unchanged. The comparison ignores case, like the
 * file systems CodeMaps usually runs on, but the returned text keeps the case of `file`.
 */
export const relativeToRoot = (root: string, file: string): string => {
  const normalizedFile = toPosix(file);
  const normalizedRoot = toPosix(root).replace(/\/+$/, '');
  if (!normalizedRoot) return normalizedFile;
  const prefix = `${normalizedRoot.toLowerCase()}/`;
  return normalizedFile.toLowerCase().startsWith(prefix)
    ? normalizedFile.slice(prefix.length)
    : normalizedFile;
};
