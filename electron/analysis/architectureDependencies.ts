import { isCompositionRoot } from './couplingMetrics';
import { GraphData } from '../store/types';
import { toStructuralNodeId } from './AgentContextUtils';
import { isArchitecturalDependencyLink } from './graphAnalysisUtils';
import {
  ArchitectureLayer,
  ArchitectureViolation,
  LayerDependencySummary,
} from './architectureTypes';

interface LayerRule {
  source: ArchitectureLayer;
  /** Targets the source may depend on; every other target is a violation. */
  allowed?: ArchitectureLayer[];
  /** Targets the source must not depend on. */
  forbidden?: ArchitectureLayer[];
  reason: string;
}

/** Checked in order; the first matching rule wins. */
const LAYER_RULES: LayerRule[] = [
  {
    source: 'domain',
    allowed: ['domain', 'shared', 'configuration'],
    reason: 'Domain-слой не должен зависеть от инфраструктурных или orchestration-слоёв.',
  },
  {
    source: 'shared',
    allowed: ['shared', 'configuration', 'domain'],
    reason: 'Shared-слой должен оставаться низкоуровневым и не зависеть от верхних слоёв.',
  },
  {
    source: 'state',
    allowed: ['state', 'shared', 'configuration', 'domain'],
    reason: 'State-слой не должен тянуть presentation/application/integration детали напрямую.',
  },
  {
    source: 'analysis',
    forbidden: ['presentation', 'integration'],
    reason: 'Analysis-слой не должен зависеть от presentation/integration.',
  },
  {
    source: 'parsing',
    forbidden: ['presentation', 'integration'],
    reason: 'Parsing-слой не должен зависеть от presentation/integration.',
  },
  {
    source: 'application',
    forbidden: ['presentation'],
    reason: 'Application-слой не должен зависеть от presentation.',
  },
];

const violatesRule = (rule: LayerRule, targetLayer: ArchitectureLayer) =>
  rule.allowed ? !rule.allowed.includes(targetLayer) : !!rule.forbidden?.includes(targetLayer);

export const getArchitectureViolationReason = (
  sourceLayer: ArchitectureLayer,
  targetLayer: ArchitectureLayer
) => {
  if (sourceLayer === 'unknown' || targetLayer === 'unknown') return null;
  if (sourceLayer === targetLayer || sourceLayer === 'configuration') return null;

  if (targetLayer === 'presentation') {
    return 'Внутренний слой зависит от presentation-слоя.';
  }

  const rule = LAYER_RULES.find(
    (candidate) => candidate.source === sourceLayer && violatesRule(candidate, targetLayer)
  );
  return rule ? rule.reason : null;
};

/** Unique structural source->target pairs of the architectural dependency links. */
const collectDependencyEdges = (graph: GraphData) => {
  const edges = new Map<string, { sourceId: string; targetId: string }>();
  for (const link of graph.links) {
    if (!isArchitecturalDependencyLink(link)) continue;
    const sourceId = toStructuralNodeId(link.source);
    const targetId = toStructuralNodeId(link.target);
    if (!sourceId || !targetId || sourceId === targetId) continue;
    const dedupeKey = `${sourceId}->${targetId}`;
    if (!edges.has(dedupeKey)) edges.set(dedupeKey, { sourceId, targetId });
  }
  return edges;
};

export const summarizeArchitectureDependencies = (
  graph: GraphData,
  layerByNodeId: Map<string, ArchitectureLayer>
): {
  dependencies: LayerDependencySummary[];
  violations: ArchitectureViolation[];
} => {
  const dependencyCounts = new Map<string, number>();
  const dedupedDependencyEdges = collectDependencyEdges(graph);

  const violations: ArchitectureViolation[] = [];

  for (const { sourceId, targetId } of dedupedDependencyEdges.values()) {
    const sourceLayer = layerByNodeId.get(sourceId) || 'unknown';
    const targetLayer = layerByNodeId.get(targetId) || 'unknown';
    const dependencyKey = `${sourceLayer}->${targetLayer}`;
    dependencyCounts.set(dependencyKey, (dependencyCounts.get(dependencyKey) || 0) + 1);

    // The program's entry point legitimately reaches into every layer.
    const violationReason = isCompositionRoot(sourceId)
      ? null
      : getArchitectureViolationReason(sourceLayer, targetLayer);
    if (violationReason) {
      violations.push({
        sourceId,
        targetId,
        sourceLayer,
        targetLayer,
        reason: violationReason,
      });
    }
  }

  const dependencies = Array.from(dependencyCounts.entries())
    .map(([key, count]) => {
      const [sourceLayer, targetLayer] = key.split('->') as [ArchitectureLayer, ArchitectureLayer];
      return { sourceLayer, targetLayer, count };
    })
    .sort(
      (a, b) =>
        b.count - a.count ||
        a.sourceLayer.localeCompare(b.sourceLayer) ||
        a.targetLayer.localeCompare(b.targetLayer)
    );

  return { dependencies, violations };
};
