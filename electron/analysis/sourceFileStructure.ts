// Structure of one source file (functions, classes, complexity, body hashes), read with the
// TypeScript compiler API and a regex fallback. Scoring modules on top of it lives in
// moduleQualityMetrics.ts. The work is split across ./sourceStructure/*.
import * as fs from 'fs';
import { analyzeSourceFileStructureWithRegex } from './sourceStructure/regexStructure';
import { SUPPORTED_SOURCE_FILE_REGEX } from './sourceStructure/structureRules';
import type { SourceFileMetrics } from './sourceStructure/structureTypes';
import { analyzeSourceFileStructureWithTypeScript } from './sourceStructure/typescriptStructure';

export type {
  SourceClassMetric,
  SourceFileMetrics,
  SourceFunctionMetric,
} from './sourceStructure/structureTypes';

function readText(filePath: string): string | null {
  if (!SUPPORTED_SOURCE_FILE_REGEX.test(filePath)) {
    return null;
  }

  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

export function analyzeSourceFileStructure(filePath: string): SourceFileMetrics {
  const text = readText(filePath);
  return (
    (text ? analyzeSourceFileStructureWithTypeScript(filePath, text) : null) ||
    analyzeSourceFileStructureWithRegex(text)
  );
}
