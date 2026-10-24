/** Types shared by the architecture analysis: layers, node classifications, overview and rules. */

/** The architecture layers a node can belong to; 'unknown' means no rule matched. */
export type ArchitectureLayer =
  | 'presentation'
  | 'application'
  | 'domain'
  | 'analysis'
  | 'parsing'
  | 'integration'
  | 'state'
  | 'shared'
  | 'configuration'
  | 'unknown';

export const ALL_ARCHITECTURE_LAYERS: ArchitectureLayer[] = [
  'presentation',
  'application',
  'domain',
  'analysis',
  'parsing',
  'integration',
  'state',
  'shared',
  'configuration',
  'unknown',
];

/** The layer assigned to one node and the rule reason (or fallback marker) that chose it. */
export interface ArchitectureNodeClassification {
  nodeId: string;
  layer: ArchitectureLayer;
  reason: string;
}

/** How many nodes sit in a layer, with a few example node ids. */
export interface ArchitectureLayerSummary {
  layer: ArchitectureLayer;
  count: number;
  sampleNodeIds: string[];
}

/** Number of file-level dependencies from one layer to another. */
export interface LayerDependencySummary {
  sourceLayer: ArchitectureLayer;
  targetLayer: ArchitectureLayer;
  count: number;
}

/** A dependency that breaks the layering rules, with the explanation of the broken rule. */
export interface ArchitectureViolation {
  sourceId: string;
  targetId: string;
  sourceLayer: ArchitectureLayer;
  targetLayer: ArchitectureLayer;
  reason: string;
}

/**
 * The complete result of an architecture analysis: classifications, layer sizes, dependency
 * counts, violations and totals.
 */
export interface ArchitectureOverview {
  classifications: ArchitectureNodeClassification[];
  layers: ArchitectureLayerSummary[];
  dependencies: LayerDependencySummary[];
  violations: ArchitectureViolation[];
  summary: {
    classifiedNodes: number;
    unknownNodes: number;
    crossLayerDependencies: number;
    violationCount: number;
    dominantLayer: ArchitectureLayer;
  };
}

/**
 * A path-matching rule: a node whose normalized path matches `pattern` belongs to `layer`;
 * `reason` names the rule for reports.
 */
export interface ArchitectureRule {
  pattern: RegExp;
  layer: ArchitectureLayer;
  reason: string;
}
