/**
 * Small helpers for the change context service: task mode normalization, target classification and
 * related security findings.
 */
import type { GraphData } from '../store/types';
import type {
  ArchitectureInsightService,
  ArchitectureNodeClassification,
  ArchitectureOverview,
} from './ArchitectureInsightService';
import { toStructuralNodeId } from './AgentContextUtils';
import { resolveSecurityScan } from './contextSupport';
import type { ResolvedTargetContext } from './ChangeContextService';
import type { SecurityFinding, SecurityScanner } from './SecurityScanner';

/** What kind of change is planned; it only changes the wording of the guidance. */
export type ChangeTaskMode = 'bugfix' | 'feature' | 'refactor' | 'explore';

const CHANGE_TASK_MODES: ChangeTaskMode[] = ['bugfix', 'feature', 'refactor', 'explore'];

/** Returns the given task mode, or 'bugfix' when it is missing or not a known mode. */
export function normalizeChangeTaskMode(taskMode?: ChangeTaskMode): ChangeTaskMode {
  return CHANGE_TASK_MODES.includes(taskMode || 'bugfix') ? taskMode || 'bugfix' : 'bugfix';
}

/**
 * Looks up the target's layer in the architecture result; if it is not there, classifies the node
 * directly with the project's active rules.
 */
export function resolveTargetClassification(args: {
  architecture: ArchitectureOverview;
  resolvedTarget: ResolvedTargetContext;
  graphProjectRoot: string;
  architectureInsightService: Pick<ArchitectureInsightService, 'classifyNode' | 'getActiveRules'>;
}): ArchitectureNodeClassification {
  return (
    args.architecture.classifications.find(
      (record) => record.nodeId === args.resolvedTarget.node.id
    ) ||
    args.architectureInsightService.classifyNode(
      args.resolvedTarget.node,
      args.architectureInsightService.getActiveRules(args.graphProjectRoot)
    )
  );
}

/** Maps node ids to the ids of the files that contain them, without duplicates. */
export function collectStructuralNodeIds(nodeIds: Iterable<string>) {
  return new Set(Array.from(nodeIds, (nodeId) => toStructuralNodeId(nodeId)));
}

/**
 * Runs (or reuses) the security scan and returns up to `maxFindings` findings located in the given
 * files. The scan is skipped when `includeSecurityFindings` is false.
 */
export async function collectRelatedSecurityFindings(args: {
  graph: GraphData;
  includeSecurityFindings: boolean | undefined;
  structuralNodeIds: Set<string>;
  maxFindings: number;
  securityScanner: Pick<SecurityScanner, 'analyze'>;
}): Promise<SecurityFinding[]> {
  return (
    await resolveSecurityScan(
      args.graph,
      args.includeSecurityFindings,
      args.securityScanner as SecurityScanner
    )
  ).findings
    .filter((finding) => args.structuralNodeIds.has(toStructuralNodeId(finding.nodeId)))
    .slice(0, args.maxFindings);
}
