/** Loads the project's own architecture layer rules from `.codemaps/architecture.json`. */

import * as fs from 'fs';
import * as path from 'path';

/**
 * A rule as stored in the project's config file: a regex source, a layer name and an optional
 * reason. It is not validated here.
 */
export interface PersistedArchitectureRuleRecord {
  pattern: string;
  layer: string;
  reason?: string;
}

/**
 * Reads the `rules` array from `<projectRoot>/.codemaps/architecture.json`. Returns null when the
 * file is missing, is not valid JSON or has no `rules` array. Entries are not validated.
 */
export const loadProjectArchitectureRuleRecords = (
  projectRoot: string
): PersistedArchitectureRuleRecord[] | null => {
  try {
    const configPath = path.join(projectRoot, '.codemaps', 'architecture.json');
    if (!fs.existsSync(configPath)) {
      return null;
    }

    const configData = fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(configData) as { rules?: PersistedArchitectureRuleRecord[] } | null;

    if (!parsed || !Array.isArray(parsed.rules)) {
      return null;
    }

    return parsed.rules;
  } catch {
    return null;
  }
};
