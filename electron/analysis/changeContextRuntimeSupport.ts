import type { GraphData } from '../store';
import type {
  ArchitectureInsightService,
  ArchitectureNodeClassification,
  ArchitectureOverview,
} from './ArchitectureInsightService';
import { toStructuralNodeId } from './AgentContextUtils';
import { resolveSecurityScan } from './contextSupport';
import type { ResolvedTargetContext } from './ChangeContextService';
import type { SecurityFinding, SecurityScanner } from './SecurityScanner';

export type ChangeTaskMode = 'bugfix' | 'feature' | 'refactor' | 'explore';

const CHANGE_TASK_MODES: ChangeTaskMode[] = ['bugfix', 'feature', 'refactor', 'explore'];

export function normalizeChangeTaskMode(taskMode?: ChangeTaskMode): ChangeTaskMode {
  return CHANGE_TASK_MODES.includes(taskMode || 'bugfix') ? taskMode || 'bugfix' : 'bugfix';
}

export function resolveTargetClassification(args: {
  architecture: ArchitectureOverview;
  resolvedTarget: ResolvedTargetContext;
  graphProjectRoot: string;
  architectureInsightService: Pick<
    ArchitectureInsightService,
    'classifyNode' | 'getActiveRules'
  >;
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

export function collectStructuralNodeIds(nodeIds: Iterable<string>) {
  return new Set(Array.from(nodeIds, (nodeId) => toStructuralNodeId(nodeId)));
}

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
