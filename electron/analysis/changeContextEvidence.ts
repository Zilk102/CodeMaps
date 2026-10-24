import type { GraphData } from '../store/types';
import type { ArchitectureOverview } from './ArchitectureInsightService';
import {
  collectRecommendedFilesToInspect,
  collectRelatedNodeIds,
  collectRelevantPatterns,
  collectTargetViolations,
  getNodeDependencies,
} from './changeContextSupport';
import {
  collectRelatedSecurityFindings,
  collectStructuralNodeIds,
} from './changeContextRuntimeSupport';
import type { ChangeContextServices } from './changeContextServices';
import type {
  ChangeEvidence,
  PrepareChangeContextInput,
  ResolvedTargetContext,
} from './changeContextTypes';

export const MAX_RELATED_NODES = 12;
const MAX_RELATED_PATTERNS = 8;
const MAX_RELATED_FINDINGS = 10;
const MAX_DECOMPOSITION_CANDIDATES = 8;

/** Gathers dependencies, blast radius, patterns, findings and file hints around the target. */
export async function collectChangeEvidence(
  services: ChangeContextServices,
  graph: GraphData,
  input: PrepareChangeContextInput,
  resolvedTarget: ResolvedTargetContext,
  architecture: ArchitectureOverview
): Promise<ChangeEvidence> {
  const targetId = resolvedTarget.node.id;
  const dependencies = getNodeDependencies(graph, targetId);
  const blastRadius = services.blastRadiusAnalyzer.analyze(graph, targetId, input.depth);
  const relatedNodeIds = collectRelatedNodeIds(targetId, dependencies, blastRadius);
  const structuralNodeIds = collectStructuralNodeIds(relatedNodeIds);
  const relevantPatterns = collectRelevantPatterns(
    services.patternDetectionAnalyzer.analyze(graph).patterns,
    relatedNodeIds,
    structuralNodeIds,
    MAX_RELATED_PATTERNS
  );
  const securityFindings = await collectRelatedSecurityFindings({
    graph,
    includeSecurityFindings: input.includeSecurityFindings,
    structuralNodeIds,
    maxFindings: MAX_RELATED_FINDINGS,
    securityScanner: services.securityScanner,
  });

  return {
    dependencies,
    blastRadius,
    relevantPatterns,
    securityFindings,
    targetViolations: collectTargetViolations(architecture, targetId),
    recommendedFilesToInspect: collectRecommendedFilesToInspect(
      targetId,
      dependencies,
      blastRadius
    ),
    decompositionCandidates: services.decompositionGuidanceService.prepareGuidance(graph, {
      limit: MAX_DECOMPOSITION_CANDIDATES,
      focusNodeIds: Array.from(structuralNodeIds),
    }).candidates,
  };
}
