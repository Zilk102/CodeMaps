import { GraphData } from '../store/types';
import type { HealthScoreResult } from './HealthScoreAnalyzer';
import { isContractSemanticLink, isDiRuntimeLink, isStackAwareLink } from './graphAnalysisUtils';
import {
  collectLinkedNodeIds,
  collectStructuralLinkedNodeIds,
  createPriority,
  type PriorityBuilder,
} from './reviewPriorityShared';

interface LinkPrioritySpec {
  count: (summary: HealthScoreResult['summary']) => number;
  highFrom: number;
  title: string;
  reason: string;
  collect: (graph: GraphData) => string[];
}

/** A priority that exists while the health summary counts links of one kind, high from a threshold. */
function linkPriority(spec: LinkPrioritySpec): PriorityBuilder {
  return ({ graph, health }) => {
    const count = spec.count(health.summary);
    if (count <= 0) return null;
    return createPriority({
      severity: count >= spec.highFrom ? 'high' : 'medium',
      title: spec.title,
      reason: spec.reason,
      nodeIds: spec.collect(graph),
    });
  };
}

export const stackAwarePriority = linkPriority({
  count: (summary) => summary.stackAwareLinks,
  highFrom: 12,
  title: 'Stack-Aware Runtime Paths',
  reason:
    'Framework/build enrichment exposed runtime and assembly paths that should be reviewed together with direct imports.',
  collect: (graph) => collectLinkedNodeIds(graph, isStackAwareLink),
});

export const diRuntimePriority = linkPriority({
  count: (summary) => summary.diRuntimeLinks,
  highFrom: 8,
  title: 'DI Runtime Contracts',
  reason:
    'Provider bindings, bean factories, and service registrations define runtime wiring that may bypass plain import-based dependency intuition.',
  collect: (graph) => collectLinkedNodeIds(graph, isDiRuntimeLink),
});

export const contractBindingPriority = linkPriority({
  count: (summary) => summary.contractSemanticLinks,
  highFrom: 10,
  title: 'Contract Runtime Bindings',
  reason:
    'OpenAPI/protobuf schemas, generated clients, and runtime handlers/servers are linked structurally, so contract changes should be reviewed beyond plain imports.',
  collect: (graph) => collectStructuralLinkedNodeIds(graph, isContractSemanticLink),
});
