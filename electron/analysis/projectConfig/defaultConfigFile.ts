/**
 * Creates the default `<project>/.codemaps/config.json` for a project that has none. A setup tool
 * calls it once; it never overwrites a file a person has edited.
 */
import * as fs from 'fs';
import * as path from 'path';
import { projectConfigPath } from './configLoader';
import { DEFAULT_PROJECT_CONFIG } from './types';

/** Outcome of `writeDefaultProjectConfig`: where the file is and whether this call created it. */
export interface DefaultConfigResult {
  path: string;
  created: boolean;
}

/**
 * The text of the default config file. The thresholds are written out so that a new project
 * starts with the same limits CodeMaps applies to itself; combined with the ratchet baseline they
 * only block code that gets worse.
 */
export const defaultProjectConfigText = (): string =>
  `${JSON.stringify(
    {
      version: DEFAULT_PROJECT_CONFIG.version,
      mode: DEFAULT_PROJECT_CONFIG.mode,
      exclude: DEFAULT_PROJECT_CONFIG.exclude,
      thresholds: DEFAULT_PROJECT_CONFIG.thresholds,
      documentation: DEFAULT_PROJECT_CONFIG.documentation,
    },
    null,
    2
  )}\n`;

/**
 * Writes the default config file unless one exists. Returns `created: false` and leaves the file
 * alone when it is already there. Throws only when the folder cannot be written.
 */
export const writeDefaultProjectConfig = (root: string): DefaultConfigResult => {
  const file = projectConfigPath(root);
  if (fs.existsSync(file)) return { path: file, created: false };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, defaultProjectConfigText(), 'utf-8');
  return { path: file, created: true };
};
