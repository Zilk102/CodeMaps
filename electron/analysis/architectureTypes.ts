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

export interface ArchitectureNodeClassification {
  nodeId: string;
  layer: ArchitectureLayer;
  reason: string;
}

export interface ArchitectureLayerSummary {
  layer: ArchitectureLayer;
  count: number;
  sampleNodeIds: string[];
}

export interface LayerDependencySummary {
  sourceLayer: ArchitectureLayer;
  targetLayer: ArchitectureLayer;
  count: number;
}

export interface ArchitectureViolation {
  sourceId: string;
  targetId: string;
  sourceLayer: ArchitectureLayer;
  targetLayer: ArchitectureLayer;
  reason: string;
}

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

export interface ArchitectureRule {
  pattern: RegExp;
  layer: ArchitectureLayer;
  reason: string;
}
