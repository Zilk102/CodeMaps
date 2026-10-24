/**
 * Assembles the public change context result from the resolved target and the collected evidence.
 */
import type { GraphData } from '../store/types';
import { createGraphSummary } from './AgentContextUtils';
import {
  buildChangeAutopilotPlan,
  buildChangeNextSteps,
  buildChangeRisks,
} from './changeContextPolicies';
import { MAX_RELATED_NODES } from './changeContextEvidence';
import { buildBlastRadiusView, buildDependenciesView } from './changeContextSupport';
import type {
  ChangeAssemblyContext,
  ChangeContextResult,
  PrepareChangeContextInput,
} from './changeContextTypes';

/** Turns the resolved target and its evidence into the public change context result. */
export function assembleChangeContextResult(
  graph: GraphData,
  input: PrepareChangeContextInput,
  ctx: ChangeAssemblyContext
): ChangeContextResult {
  const { taskMode, resolvedTarget, architecture, targetClassification, dependencies } = ctx;
  const { blastRadius, relevantPatterns, securityFindings, targetViolations } = ctx;
  const { recommendedFilesToInspect, decompositionCandidates } = ctx;

  return {
    graphSummary: createGraphSummary(graph),
    taskMode,
    target: resolvedTarget,
    changeIntent: input.changeIntent || null,
    targetClassification,
    architecture: {
      summary: architecture.summary,
      dominantLayerDependencies: architecture.dependencies.slice(0, 10),
      targetViolations,
    },
    dependencies: buildDependenciesView(dependencies, MAX_RELATED_NODES),
    blastRadius: buildBlastRadiusView(blastRadius, MAX_RELATED_NODES),
    relevantPatterns,
    relatedSecurityFindings: securityFindings,
    recommendedFilesToInspect,
    decompositionCandidates,
    autopilotPlan: buildChangeAutopilotPlan({
      taskMode,
      changeIntent: input.changeIntent,
      resolvedTarget,
      targetClassification,
      blastRadius,
      runtimeContractLinks: dependencies.runtimeContractLinks,
      contractBindingLinks: dependencies.contractBindingLinks,
      securityFindings,
    }),
    risks: buildChangeRisks({
      target: resolvedTarget.node,
      targetClassification,
      blastRadius,
      runtimeContractNodes: dependencies.runtimeContractNodes,
      contractBindingNodes: dependencies.contractBindingNodes,
      targetViolations,
      relevantPatterns,
      securityFindings,
    }),
    nextSteps: buildChangeNextSteps({
      changeIntent: input.changeIntent,
      target: resolvedTarget.node,
      targetClassification,
      recommendedFilesToInspect,
      blastRadius,
      runtimeContractNodes: dependencies.runtimeContractNodes,
      contractBindingNodes: dependencies.contractBindingNodes,
      securityFindings,
      decompositionCandidates,
    }),
  };
}
