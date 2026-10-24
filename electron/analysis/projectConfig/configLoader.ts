/**
 * Loads `<project>/.codemaps/config.json`.
 *
 * Reading is synchronous and cheap: one `stat` per call, and the parsed result is reused until the
 * file's modification time or size changes. The loader never throws; a missing file, unreadable
 * file or invalid JSON all produce a usable configuration and, when something is wrong, warnings
 * the tools can surface to the agent.
 */
import * as fs from 'fs';
import { compileGlobs } from './globMatcher';
import { parseProjectConfig } from './configParser';
import { codemapsFilePath, relativeToRoot } from './projectPaths';
import { DEFAULT_PROJECT_CONFIG, type LoadedProjectConfig, type ProjectConfig } from './types';

/** Name of the configuration file inside `.codemaps`. */
export const CONFIG_FILE_NAME = 'config.json';

interface CacheEntry {
  stamp: string;
  loaded: LoadedProjectConfig;
}

const cache = new Map<string, CacheEntry>();

/** Builds the loaded form: the exclusion matcher is compiled once per file version. */
const toLoaded = (
  root: string,
  config: ProjectConfig,
  warnings: string[],
  present: boolean
): LoadedProjectConfig => {
  const matches = compileGlobs(config.exclude);
  return {
    config,
    warnings,
    present,
    isExcluded: (file) => matches(relativeToRoot(root, file)),
  };
};

/** Reads and parses the file; invalid JSON yields the defaults and one warning. */
const readConfigFile = (root: string, file: string): LoadedProjectConfig => {
  try {
    const parsed = parseProjectConfig(JSON.parse(fs.readFileSync(file, 'utf-8')));
    return toLoaded(root, parsed.config, parsed.warnings, true);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return toLoaded(
      root,
      { ...DEFAULT_PROJECT_CONFIG },
      [`Cannot read ${CONFIG_FILE_NAME}: ${reason}. Using defaults.`],
      true
    );
  }
};

/** `mtime:size` of the file, or `missing` when it does not exist. */
const stampOf = (file: string): string => {
  try {
    const stat = fs.statSync(file);
    return stat.isFile() ? `${stat.mtimeMs}:${stat.size}` : 'missing';
  } catch {
    return 'missing';
  }
};

/**
 * The configuration of the project at `root`. Without a root (no project open) or without a
 * config file the defaults apply. Cached by the file's modification time, so editing the file
 * takes effect on the next call.
 */
export const loadProjectConfig = (root: string | undefined): LoadedProjectConfig => {
  const projectRoot = root ?? '';
  const file = codemapsFilePath(projectRoot, CONFIG_FILE_NAME);
  const stamp = projectRoot ? stampOf(file) : 'missing';
  const cached = cache.get(projectRoot);
  if (cached?.stamp === stamp) return cached.loaded;

  const loaded =
    stamp === 'missing'
      ? toLoaded(projectRoot, { ...DEFAULT_PROJECT_CONFIG }, [], false)
      : readConfigFile(projectRoot, file);
  cache.set(projectRoot, { stamp, loaded });
  return loaded;
};

/** Forgets every cached configuration; tests use it to start clean. */
export const clearProjectConfigCache = (): void => cache.clear();

/** Absolute path of the config file of a project, whether it exists or not. */
export const projectConfigPath = (root: string): string => codemapsFilePath(root, CONFIG_FILE_NAME);
