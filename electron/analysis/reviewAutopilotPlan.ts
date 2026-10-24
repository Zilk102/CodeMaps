import type { ArchitectureOverview } from './ArchitectureInsightService';
import type { ReviewContextResult, ReviewTaskMode } from './ReviewContextService';
import type { SecurityFinding } from './SecurityScanner';
import { unique } from './AgentContextUtils';

type ReviewStage = 'security' | 'architecture' | 'patterns' | 'health' | 'focused_area';

interface AutopilotSignals {
  taskMode: ReviewTaskMode;
  hasSecurityFindings: boolean;
  hasViolations: boolean;
  hasStackAwareLinks: boolean;
  hasOperationalRefreshSignals: boolean;
}

/** Stages that apply, each paired with the condition that puts it ahead of the defaults. */
function leadingStages(signals: AutopilotSignals): ReviewStage[] {
  const candidates: Array<[boolean, ReviewStage]> = [
    [signals.taskMode === 'security' || signals.hasSecurityFindings, 'security'],
    [signals.taskMode === 'architecture' || signals.hasViolations, 'architecture'],
    [signals.hasStackAwareLinks, 'patterns'],
    [signals.hasOperationalRefreshSignals, 'health'],
  ];
  return candidates.filter(([applies]) => applies).map(([, stage]) => stage);
}

function describeReviewModeGoal(taskMode: ReviewTaskMode) {
  switch (taskMode) {
    case 'architecture':
      return 'Check architectural boundaries, layers, and module responsibilities.';
    case 'security':
      return 'Find and prioritize security risks and unsafe patterns.';
    case 'stabilization':
      return 'Identify points of structural instability and maintainability degradation.';
    case 'review':
    default:
      return 'Gather architectural and qualitative context for a meaningful review.';
  }
}

export function buildReviewAutopilotPlan(
  taskMode: ReviewTaskMode,
  securityFindings: SecurityFinding[],
  architecture: ArchitectureOverview,
  focus: ReviewContextResult['focus'],
  hasStackAwareLinks?: boolean,
  hasOperationalRefreshSignals?: boolean
) {
  const hasFocusMatches = Boolean(focus?.matches.length);
  const preferredOrder: ReviewStage[] = [
    ...leadingStages({
      taskMode,
      hasSecurityFindings: securityFindings.length > 0,
      hasViolations: architecture.violations.length > 0,
      hasStackAwareLinks: Boolean(hasStackAwareLinks),
      hasOperationalRefreshSignals: Boolean(hasOperationalRefreshSignals),
    }),
    'patterns',
    'health',
    ...(hasFocusMatches ? (['focused_area'] as const) : []),
  ];

  return {
    primaryGoal: describeReviewModeGoal(taskMode),
    preferredOrder: unique(preferredOrder),
    shouldFallbackToLowLevelTools: Boolean(
      hasFocusMatches && !focus?.relatedPatterns.length && !focus?.relatedViolations.length
    ),
  };
}
