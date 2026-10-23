import type { GraphData } from '../store/types';
import { isContractSemanticLink, isDiRuntimeLink, isStackAwareLink } from './graphAnalysisUtils';
import type { DetectedPattern } from './patternDetectionTypes';

interface RuntimeHubSpec {
  id: string;
  title: string;
  description: string;
  isRelevantLink: (link: GraphData['links'][number]) => boolean;
  minDegree: number;
  highDegree: number;
}

const RUNTIME_HUB_SPECS: RuntimeHubSpec[] = [
  {
    id: 'stack_orchestration_hubs',
    title: 'Stack Orchestration Hubs',
    description:
      'Framework/build orchestration is concentrated in a few files, increasing coupling between runtime entrypoints and stack infrastructure.',
    isRelevantLink: (link) => isStackAwareLink(link),
    minDegree: 4,
    highDegree: 8,
  },
  {
    id: 'di_runtime_contract_hubs',
    title: 'DI Runtime Contract Hubs',
    description:
      'Runtime contracts are concentrated in a few composition roots, so provider bindings and service registrations deserve explicit architectural review.',
    isRelevantLink: (link) => isDiRuntimeLink(link),
    minDegree: 2,
    highDegree: 5,
  },
  {
    id: 'contract_runtime_binding_hubs',
    title: 'Contract Runtime Binding Hubs',
    description:
      'API contracts, generated artifacts, and runtime handlers/clients converge in a few files, so schema changes may propagate wider than import-based coupling suggests.',
    isRelevantLink: (link) => isContractSemanticLink(link),
    minDegree: 2,
    highDegree: 5,
  },
];

function buildRuntimeHubPattern(
  spec: RuntimeHubSpec,
  args: {
    graph: GraphData;
    incomingByTarget: Map<string, GraphData['links']>;
    outgoingBySource: Map<string, GraphData['links']>;
  }
): DetectedPattern | null {
  const { graph, incomingByTarget, outgoingBySource } = args;
  const hubs = graph.nodes
    .filter((node) => node.type === 'file')
    .map((node) => {
      const relatedLinks = [
        ...(incomingByTarget.get(node.id) || []),
        ...(outgoingBySource.get(node.id) || []),
      ].filter(spec.isRelevantLink);
      return { node, degree: relatedLinks.length };
    })
    .filter(({ degree }) => degree >= spec.minDegree)
    .sort((a, b) => b.degree - a.degree)
    .slice(0, 10);

  if (hubs.length === 0) return null;
  return {
    id: spec.id,
    severity: hubs.some(({ degree }) => degree >= spec.highDegree) ? 'high' : 'medium',
    title: spec.title,
    description: spec.description,
    nodeIds: hubs.map(({ node }) => node.id),
  };
}

export function buildRuntimePatterns(args: {
  graph: GraphData;
  incomingByTarget: Map<string, GraphData['links']>;
  outgoingBySource: Map<string, GraphData['links']>;
}): DetectedPattern[] {
  return RUNTIME_HUB_SPECS.map((spec) => buildRuntimeHubPattern(spec, args)).filter(
    (pattern): pattern is DetectedPattern => pattern !== null
  );
}
