/**
 * Match scoring for change campaigns: ranks graph nodes against the words of a request, preferring
 * files.
 */
import type { GraphNode } from '../store/types';
import { NodeMatchWeights, scoreNodeTextMatch } from './nodeMatchScoring';

const CAMPAIGN_MATCH_WEIGHTS: NodeMatchWeights = {
  labelEquals: 160,
  basenameEquals: { file: 200, other: 100 },
  stemEquals: { file: 240, other: 120 },
  labelStarts: 90,
  basenameStarts: { file: 110, other: 50 },
  stemStarts: { file: 130, other: 60 },
  labelIncludes: 45,
  idIncludes: { file: 40, other: 20 },
};

const CAMPAIGN_TYPE_PRIORITY = new Map([
  ['file', 5],
  ['class', 4],
  ['function', 3],
]);

/**
 * Tie-break weight of a node type for campaigns: files first, then classes, functions, everything
 * else last.
 */
export function getCampaignNodeTypePriority(type: string) {
  return CAMPAIGN_TYPE_PRIORITY.get(type) ?? 1;
}

/**
 * Scores how well a node matches a request word with campaign weights; 0 means no match. A match
 * gets a bonus from the node type, so a file outranks a function with the same match.
 */
export function scoreCampaignNodeMatch(node: GraphNode, rawQuery: string) {
  const score = scoreNodeTextMatch(node, rawQuery, CAMPAIGN_MATCH_WEIGHTS);
  return score === 0 ? 0 : score + getCampaignNodeTypePriority(node.type) * 10;
}
