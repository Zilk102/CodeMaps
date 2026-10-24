/**
 * Helpers of the review context: focus resolution, task mode normalization and the security view.
 */

import type { GraphData, GraphNode } from '../store/types';
import { summarizeSecurityFindings } from './securityFindingSummary';
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

/**
 * What the review is for: a general review, or one centered on architecture, security or
 * stabilization.
 */
export type ReviewTaskMode = (typeof REVIEW_TASK_MODES)[number];

/**
 * The area the reviewer asked to look at: the nodes matching the query, their layers, and the
 * patterns and violations that involve them.
 */
export interface ReviewFocusContext {
  query: string;
  matches: GraphNode[];
  classifications: ArchitectureNodeClassification[];
  relatedPatterns: DetectedPattern[];
  relatedViolations: ArchitectureViolation[];
}

/**
 * Looks up the nodes matching the focus query (up to 5, with code nodes ranked above a directory
 * of the same name) together with their classifications, patterns and violations. Returns null
 * without a query; with no match, an empty focus.
 */
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

/** Returns the given review mode, or 'review' when it is missing or unknown. */
export function normalizeReviewTaskMode(taskMode?: ReviewTaskMode): ReviewTaskMode {
  return REVIEW_TASK_MODES.includes(taskMode || 'review') ? taskMode || 'review' : 'review';
}

/** Security part of the review: summary counts and the first 20 findings. */
export function buildReviewSecurityView(findings: SecurityFinding[]) {
  return {
    summary: summarizeSecurityFindings(findings),
    findings: findings.slice(0, MAX_REVIEW_FINDINGS),
  };
}
