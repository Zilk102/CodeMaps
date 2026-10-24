import { GraphData, GraphNode } from '../store/types';
import { compareScoredNodes, toStructuralNodeId } from './AgentContextUtils';
import type { ProjectInsightResult } from './projectInsightTypes';
import {
  CAMPAIGN_HINTS,
  hasDiRuntimeSignals,
  hasOperationalRefreshSignals,
  isChangeIntent,
} from './taskIntelligenceIntent';
import { NodeMatchWeights, scoreNodeTextMatch } from './nodeMatchScoring';
import type { TaskIntentInference } from './taskIntelligenceTypes';

const MAX_CANDIDATES = 6;

const OPERATIONAL_NODE_PATTERN =
  /(filewatcher|stackgraphenrichmentservice|graphrepository|projectindexer|cachemanager)/i;

/** Extra score for the runtime roots and refresh services a request is about. */
const createCandidateBonus = (normalizedRequest: string, runtimeRootIds: Set<string>) => {
  const wantsRuntimeRoots = hasDiRuntimeSignals(normalizedRequest);
  const wantsRefreshServices = hasOperationalRefreshSignals(normalizedRequest);
  return (node: GraphNode) =>
    (wantsRuntimeRoots && runtimeRootIds.has(toStructuralNodeId(node.id)) ? 120 : 0) +
    (wantsRefreshServices && OPERATIONAL_NODE_PATTERN.test(node.id) ? 140 : 0);
};

export function findTargetCandidates(
  graph: GraphData,
  candidateQueries: string[],
  projectContext: ProjectInsightResult,
  userRequest: string
) {
  const scored = new Map<string, { node: GraphNode; score: number }>();
  const runtimeRootIds = new Set(
    projectContext.mentalModel.runtimeCompositionRoots.map((node) => toStructuralNodeId(node.id))
  );
  const bonusFor = createCandidateBonus(userRequest.toLowerCase(), runtimeRootIds);

  for (const query of candidateQueries) {
    for (const node of graph.nodes) {
      const score = scoreNodeMatch(node, query) + bonusFor(node);
      const current = scored.get(node.id);
      if (score > 0 && (!current || score > current.score)) scored.set(node.id, { node, score });
    }
  }

  return Array.from(scored.values())
    .sort(compareScoredNodes(getNodeTypePriority))
    .slice(0, MAX_CANDIDATES)
    .map(({ node }) => node);
}

const BROAD_RUNTIME_SCOPE =
  /(services|providers|registrations|bindings|contracts|modules|сервисы|провайдер|регистрац|контракт|модули)/u;
const EXPLICIT_FILE_MENTION = /[\p{L}\p{N}_./-]+\.(?:ts|tsx|js|jsx|json|css|md|cs|java|kt)/u;

export function shouldUseCampaignContext(
  userRequest: string,
  inferredIntent: TaskIntentInference,
  targetCandidates: GraphNode[],
  projectContext: ProjectInsightResult
) {
  const normalized = userRequest.toLowerCase();
  const isChange = isChangeIntent(inferredIntent.taskKind);
  const hasBroadRuntimeScope = BROAD_RUNTIME_SCOPE.test(normalized);

  if (pointsAtOneFile(normalized, targetCandidates, hasBroadRuntimeScope)) return false;
  if (hasCampaignHints(normalized) && (isChange || inferredIntent.taskKind === 'explore')) {
    return true;
  }
  if (!isChange) return false;

  const candidateCount = targetCandidates.length;
  return (
    wiresRuntime(normalized, projectContext, hasBroadRuntimeScope, candidateCount) ||
    (inferredIntent.taskKind === 'refactor' && candidateCount >= 3)
  );
}

const wiresRuntime = (
  normalized: string,
  projectContext: ProjectInsightResult,
  hasBroadRuntimeScope: boolean,
  candidateCount: number
) =>
  hasDiRuntimeSignals(normalized) &&
  hasRuntimeRoots(projectContext) &&
  (hasBroadRuntimeScope || candidateCount >= 2);

const hasRuntimeRoots = (projectContext: ProjectInsightResult) =>
  projectContext.mentalModel.runtimeCompositionRoots.length > 0;

const hasCampaignHints = (normalized: string) =>
  CAMPAIGN_HINTS.some((hint) => normalized.includes(hint));

/** The request names a file and the best match is that file, not a broad scope. */
const pointsAtOneFile = (
  normalized: string,
  targetCandidates: GraphNode[],
  hasBroadRuntimeScope: boolean
) =>
  EXPLICIT_FILE_MENTION.test(normalized) &&
  targetCandidates[0]?.type === 'file' &&
  !hasBroadRuntimeScope;

const TASK_MATCH_WEIGHTS: NodeMatchWeights = {
  labelEquals: 160,
  basenameEquals: { file: 180, other: 90 },
  stemEquals: { file: 220, other: 100 },
  labelStarts: 90,
  basenameStarts: { file: 100, other: 50 },
  stemStarts: { file: 120, other: 60 },
  labelIncludes: 40,
  idIncludes: { file: 35, other: 20 },
};

const NODE_TYPE_PRIORITY = new Map([
  ['function', 6],
  ['class', 5],
  ['file', 4],
  ['adr', 3],
  ['directory', 1],
]);

function scoreNodeMatch(node: GraphNode, rawQuery: string) {
  const textScore = scoreNodeTextMatch(node, rawQuery, TASK_MATCH_WEIGHTS);
  return textScore === 0 ? 0 : textScore + getNodeTypePriority(node.type) * 10;
}

function getNodeTypePriority(type: string) {
  return NODE_TYPE_PRIORITY.get(type) ?? 2;
}
