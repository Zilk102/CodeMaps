/**
 * Contracts of the module quality analysis: the measurements of one file and the summary of the
 * worst offenders per smell.
 */

import type { StructureLimits } from './projectConfig/structureLimits';
import type { GraphNode } from '../store/types';
import type {
  SourceClassMetric,
  SourceFileMetrics,
  SourceFunctionMetric,
} from './sourceFileStructure';

/**
 * Quality measurements of one file: line and symbol counts, coupling, links to frameworks, DI and
 * API contracts, parsed source metrics, and the derived responsibility count, mixed-responsibility
 * flag and design smell score. `lineCount` is null when the file cannot be read.
 */
export interface ModuleQualityMetric {
  node: GraphNode;
  lineCount: number | null;
  symbolCount: number;
  fanIn: number;
  fanOut: number;
  stackAwareDegree: number;
  diRuntimeDegree: number;
  contractDegree: number;
  sourceMetrics: SourceFileMetrics;
  responsibilityAxisCount: number;
  mixedResponsibilities: boolean;
  designSmellScore: number;
}

/**
 * All per-file metrics plus the top 10 files for each smell. Test files appear only in `metrics`;
 * clone groups come from the token-level detector when it has run, otherwise from identical
 * function bodies.
 */
export interface ModuleQualitySummary {
  metrics: ModuleQualityMetric[];
  /** The function limits the metrics were measured with; the built-in ones when absent. */
  limits?: StructureLimits;
  oversizedModules: ModuleQualityMetric[];
  godFiles: ModuleQualityMetric[];
  godClasses: Array<ModuleQualityMetric & { matchedClasses: SourceClassMetric[] }>;
  longMethods: Array<ModuleQualityMetric & { matchedMethods: SourceFunctionMetric[] }>;
  complexMethods: Array<ModuleQualityMetric & { matchedMethods: SourceFunctionMetric[] }>;
  mixedResponsibilityModules: ModuleQualityMetric[];
  codeClones: Array<{
    bodyHash: string;
    instances: Array<{
      nodeId: string;
      methodName: string;
      lineCount: number;
    }>;
  }>;
}
