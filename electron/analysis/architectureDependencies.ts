import { GraphData } from '../store';
import { toStructuralNodeId } from './AgentContextUtils';
import { isArchitecturalDependencyLink } from './graphAnalysisUtils';
import {
  ArchitectureLayer,
  ArchitectureViolation,
  LayerDependencySummary,
} from './architectureTypes';

export const getArchitectureViolationReason = (
  sourceLayer: ArchitectureLayer,
  targetLayer: ArchitectureLayer
) => {
  if (sourceLayer === 'unknown' || targetLayer === 'unknown') {
    return null;
  }

  if (sourceLayer === targetLayer) {
    return null;
  }

  if (sourceLayer === 'configuration') {
    return null;
  }

  if (targetLayer === 'presentation' && sourceLayer !== 'presentation') {
    return 'Внутренний слой зависит от presentation-слоя.';
  }

  if (sourceLayer === 'domain' && !['domain', 'shared', 'configuration'].includes(targetLayer)) {
    return 'Domain-слой не должен зависеть от инфраструктурных или orchestration-слоёв.';
  }

  if (sourceLayer === 'shared' && !['shared', 'configuration', 'domain'].includes(targetLayer)) {
    return 'Shared-слой должен оставаться низкоуровневым и не зависеть от верхних слоёв.';
  }

  if (
    sourceLayer === 'state' &&
    !['state', 'shared', 'configuration', 'domain'].includes(targetLayer)
  ) {
    return 'State-слой не должен тянуть presentation/application/integration детали напрямую.';
  }

  if (sourceLayer === 'analysis' && ['presentation', 'integration'].includes(targetLayer)) {
    return 'Analysis-слой не должен зависеть от presentation/integration.';
  }

  if (sourceLayer === 'parsing' && ['presentation', 'integration'].includes(targetLayer)) {
    return 'Parsing-слой не должен зависеть от presentation/integration.';
  }

  if (sourceLayer === 'application' && targetLayer === 'presentation') {
    return 'Application-слой не должен зависеть от presentation.';
  }

  return null;
};

export const summarizeArchitectureDependencies = (
  graph: GraphData,
  layerByNodeId: Map<string, ArchitectureLayer>
): {
  dependencies: LayerDependencySummary[];
  violations: ArchitectureViolation[];
} => {
  const dependencyCounts = new Map<string, number>();
  const dedupedDependencyEdges = new Map<string, { sourceId: string; targetId: string }>();

  for (const link of graph.links) {
    if (!isArchitecturalDependencyLink(link)) {
      continue;
    }

    const sourceId = toStructuralNodeId(link.source);
    const targetId = toStructuralNodeId(link.target);
    if (!sourceId || !targetId || sourceId === targetId) {
      continue;
    }

    const dedupeKey = `${sourceId}->${targetId}`;
    if (!dedupedDependencyEdges.has(dedupeKey)) {
      dedupedDependencyEdges.set(dedupeKey, { sourceId, targetId });
    }
  }

  const violations: ArchitectureViolation[] = [];

  for (const { sourceId, targetId } of dedupedDependencyEdges.values()) {
    const sourceLayer = layerByNodeId.get(sourceId) || 'unknown';
    const targetLayer = layerByNodeId.get(targetId) || 'unknown';
    const dependencyKey = `${sourceLayer}->${targetLayer}`;
    dependencyCounts.set(dependencyKey, (dependencyCounts.get(dependencyKey) || 0) + 1);

    const violationReason = getArchitectureViolationReason(sourceLayer, targetLayer);
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
