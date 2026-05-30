import type { GraphData, GraphNode } from '../store';
import type {
  ArchitectureNodeClassification,
  ArchitectureOverview,
  ArchitectureViolation,
} from './ArchitectureInsightService';
import { promoteCodeTarget, searchGraph, toStructuralNodeId } from './AgentContextUtils';
import type { DetectedPattern } from './PatternDetectionAnalyzer';
import type { SecurityFinding } from './SecurityScanner';

const MAX_ALTERNATIVES = 5;
const MAX_REVIEW_FINDINGS = 20;
const REVIEW_TASK_MODES = ['review', 'architecture', 'security', 'stabilization'] as const;

export type ReviewTaskMode = (typeof REVIEW_TASK_MODES)[number];

export interface ReviewFocusContext {
  query: string;
  matches: GraphNode[];
  classifications: ArchitectureNodeClassification[];
  relatedPatterns: DetectedPattern[];
  relatedViolations: ArchitectureViolation[];
}

export function prepareReviewFocusContext(
  graph: GraphData,
  architecture: ArchitectureOverview,
  patterns: DetectedPattern[],
  focusQuery?: string,
  type?: string
): ReviewFocusContext | null {
  if (!focusQuery?.trim()) {
    return null;
  }

  const normalizedQuery = focusQuery.trim().toLowerCase();
  const matches = searchGraph(graph, focusQuery, type, MAX_ALTERNATIVES);
  if (matches.length === 0) {
    return {
      query: focusQuery,
      matches: [],
      classifications: [],
      relatedPatterns: [],
      relatedViolations: [],
    };
  }

  const promotedMatch = promoteCodeTarget(matches, normalizedQuery);
  if (promotedMatch) {
    const remaining = matches.filter((node) => node.id !== promotedMatch.id);
    matches.splice(0, matches.length, promotedMatch, ...remaining);
  }

  const focusIds = new Set(matches.map((node) => node.id));
  const focusStructuralIds = new Set(matches.map((node) => toStructuralNodeId(node.id)));

  return {
    query: focusQuery,
    matches,
    classifications: architecture.classifications.filter(
      (record) =>
        focusIds.has(record.nodeId) || focusStructuralIds.has(toStructuralNodeId(record.nodeId))
    ),
    relatedPatterns: patterns.filter((pattern) =>
      pattern.nodeIds.some(
        (nodeId) => focusIds.has(nodeId) || focusStructuralIds.has(toStructuralNodeId(nodeId))
      )
    ),
    relatedViolations: architecture.violations.filter(
      (violation) =>
        focusStructuralIds.has(toStructuralNodeId(violation.sourceId)) ||
        focusStructuralIds.has(toStructuralNodeId(violation.targetId))
    ),
  };
}

export function normalizeReviewTaskMode(taskMode?: ReviewTaskMode): ReviewTaskMode {
  return REVIEW_TASK_MODES.includes(taskMode || 'review') ? taskMode || 'review' : 'review';
}

export function buildReviewSecurityView(findings: SecurityFinding[]) {
  return {
    summary: {
      total: findings.length,
      critical: findings.filter((finding) => finding.severity === 'critical').length,
      high: findings.filter((finding) => finding.severity === 'high').length,
      medium: findings.filter((finding) => finding.severity === 'medium').length,
      low: findings.filter((finding) => finding.severity === 'low').length,
    },
    findings: findings.slice(0, MAX_REVIEW_FINDINGS),
  };
}
