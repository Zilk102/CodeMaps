import type { GraphNode } from '../store/types';
import { toStructuralNodeId } from './AgentContextUtils';

/** A weight that is the same for every node type, or one weight for files and one for the rest. */
type MatchWeight = number | { file: number; other: number };

export interface NodeMatchWeights {
  labelEquals: MatchWeight;
  basenameEquals: MatchWeight;
  stemEquals: MatchWeight;
  labelStarts: MatchWeight;
  basenameStarts: MatchWeight;
  stemStarts: MatchWeight;
  labelIncludes: MatchWeight;
  idIncludes: MatchWeight;
}

interface MatchSubject {
  label: string;
  id: string;
  basename: string;
  stem: string;
}

type MatchRule = [keyof NodeMatchWeights, (subject: MatchSubject, query: string) => boolean];

const MATCH_RULES: MatchRule[] = [
  ['labelEquals', (s, q) => s.label === q],
  ['basenameEquals', (s, q) => s.basename === q],
  ['stemEquals', (s, q) => s.stem === q],
  ['labelStarts', (s, q) => s.label.startsWith(q)],
  ['basenameStarts', (s, q) => s.basename.startsWith(q)],
  ['stemStarts', (s, q) => s.stem.startsWith(q)],
  ['labelIncludes', (s, q) => s.label.includes(q)],
  ['idIncludes', (s, q) => s.id.includes(q)],
];

const toSubject = (node: GraphNode): MatchSubject => {
  const id = node.id.toLowerCase();
  const structuralId = toStructuralNodeId(id);
  const basename = structuralId.split('/').pop() || structuralId;
  return {
    label: node.label.toLowerCase(),
    id,
    basename,
    stem: basename.replace(/\.[^.]+$/u, ''),
  };
};

const resolveWeight = (weight: MatchWeight, isFile: boolean) =>
  typeof weight === 'number' ? weight : isFile ? weight.file : weight.other;

/**
 * Sums the weights of every textual rule the node satisfies for the query.
 * Returns 0 for an empty query or when nothing matches.
 */
export function scoreNodeTextMatch(node: GraphNode, rawQuery: string, weights: NodeMatchWeights) {
  const query = rawQuery.trim().toLowerCase();
  if (!query) {
    return 0;
  }

  const subject = toSubject(node);
  const isFile = node.type === 'file';
  let score = 0;
  for (const [key, matches] of MATCH_RULES) {
    if (matches(subject, query)) {
      score += resolveWeight(weights[key], isFile);
    }
  }
  return score;
}
