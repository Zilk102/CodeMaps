import * as fs from 'fs';
import * as path from 'path';

export interface PersistedArchitectureRuleRecord {
  pattern: string;
  layer: string;
  reason?: string;
}

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
