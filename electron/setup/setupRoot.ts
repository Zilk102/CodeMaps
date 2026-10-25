/**
 * Validates the `projectPath` of `setup_project` before anything is written. The tool has no
 * fallback to the project open in the CodeMaps window: an agent that omitted the path once wrote
 * its files into the wrong repository, so the path must be explicit, absolute and plausible.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const comparable = (value: string): string =>
  path
    .resolve(value)
    .replace(/[\\/]+$/, '')
    .toLowerCase();

/**
 * Returns `projectPath` as an absolute directory with forward slashes. Throws a clear error, before
 * any file is touched, for a path that is empty or relative, does not exist, is not a directory,
 * is a filesystem root or is the home directory itself.
 */
export const resolveSetupRoot = (projectPath: string): string => {
  const given = typeof projectPath === 'string' ? projectPath.trim() : '';
  if (!given || !path.isAbsolute(given)) {
    throw new Error(
      `setup_project needs projectPath: the absolute path of the project you are working in (your current working directory). Received "${given}".`
    );
  }
  const resolved = path.resolve(given);
  let isDirectory = false;
  try {
    isDirectory = fs.statSync(resolved).isDirectory();
  } catch {
    throw new Error(`setup_project: projectPath "${given}" does not exist. Nothing was written.`);
  }
  if (!isDirectory) {
    throw new Error(
      `setup_project: projectPath "${given}" is not a directory. Nothing was written.`
    );
  }
  if (path.parse(resolved).root === resolved || comparable(resolved) === comparable(os.homedir())) {
    throw new Error(
      `setup_project: projectPath "${given}" is a filesystem root or the home directory, not a project. Pass the project directory you are working in. Nothing was written.`
    );
  }
  return resolved.replace(/\\/g, '/');
};
