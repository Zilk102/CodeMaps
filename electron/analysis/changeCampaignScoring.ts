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

export function getCampaignNodeTypePriority(type: string) {
  return CAMPAIGN_TYPE_PRIORITY.get(type) ?? 1;
}

export function scoreCampaignNodeMatch(node: GraphNode, rawQuery: string) {
  const score = scoreNodeTextMatch(node, rawQuery, CAMPAIGN_MATCH_WEIGHTS);
  return score === 0 ? 0 : score + getCampaignNodeTypePriority(node.type) * 10;
}
