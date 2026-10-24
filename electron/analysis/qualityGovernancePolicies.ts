/**
 * Rules for the quality budget, the refactoring waves and the dashboard gates, kept apart from the
 * service so they can be tested alone.
 */

import { GraphData } from '../store/types';
import { buildCollapsedAdjacency, toStructuralNodeId, unique } from './AgentContextUtils';
import { DecompositionCandidate, DecompositionGuidance } from './DecompositionGuidanceService';
import {
  BuildQualityGovernanceInput,
  QualityBudget,
  QualityBudgetDimension,
  QualityDashboard,
  QualityGate,
  RefactoringWave,
} from './qualityGovernanceTypes';

function toStatus(score: number, warningThreshold: number, criticalThreshold: number) {
  if (score <= criticalThreshold) return 'critical' as const;
  if (score <= warningThreshold) return 'warning' as const;
  return 'healthy' as const;
}

const clampScore = (value: number) => Math.max(0, Math.min(100, value));

function computeArchitectureScore(input: BuildQualityGovernanceInput) {
  return clampScore(
    100 -
      input.health.summary.architectureViolations * 8 -
      input.health.summary.unknownLayerNodes * 0.2 -
      input.patterns.filter((pattern) => pattern.id === 'layer_violations').length * 15
  );
}

function computeOperabilityScore(input: BuildQualityGovernanceInput) {
  return clampScore(
    100 -
      (input.health.summary.refreshPipelineDegraded ? 25 : 0) -
      input.health.summary.avgRefreshLatencyMs * 0.4 -
      input.health.summary.refreshSkipRate * 30
  );
}

/**
 * Scores the four dimensions and gives each a status. Maintainability needs 75 for healthy and 55
 * to avoid critical, SOLID 80 and 60, architecture and operability 80 and 60.
 */
function buildBudgetDimensions(input: BuildQualityGovernanceInput): QualityBudgetDimension[] {
  const { maintainabilityScore, solidScore } = input.health.summary;
  const architectureScore = computeArchitectureScore(input);
  const operabilityScore = computeOperabilityScore(input);

  return [
    {
      name: 'maintainability',
      score: maintainabilityScore,
      status: toStatus(maintainabilityScore, 75, 55),
      rationale:
        'Reflects oversized modules, long/complex methods, design smell density, and safe refactoring cost.',
    },
    {
      name: 'solid',
      score: solidScore,
      status: toStatus(solidScore, 80, 60),
      rationale:
        'Reflects SRP pressure, responsibility concentration, and architectural boundary erosion.',
    },
    {
      name: 'architecture',
      score: architectureScore,
      status: toStatus(architectureScore, 80, 60),
      rationale:
        'Reflects explicit layer violations, unknown classifications, and structural boundary predictability.',
    },
    {
      name: 'operability',
      score: operabilityScore,
      status: toStatus(operabilityScore, 80, 60),
      rationale:
        'Reflects refresh-pipeline stability, latency, skip rate, and operational resilience of the graph pipeline.',
    },
  ];
}

/**
 * Combines dimensions and counts into one status: critical when any dimension is critical, 3 or
 * more high-priority extractions or 4 or more blocking issues exist; warning when any dimension is
 * in warning or any blocking issue exists; otherwise healthy.
 */
function deriveOverallStatus(
  dimensions: QualityBudgetDimension[],
  decompositionPressure: number,
  blockingIssueCount: number
): QualityBudget['overallStatus'] {
  if (
    dimensions.some((dimension) => dimension.status === 'critical') ||
    decompositionPressure >= 3 ||
    blockingIssueCount >= 4
  ) {
    return 'critical';
  }
  if (dimensions.some((dimension) => dimension.status === 'warning') || blockingIssueCount > 0) {
    return 'warning';
  }
  return 'healthy';
}

const POLICY_BY_STATUS: Record<QualityBudget['overallStatus'], QualityBudget['recommendedPolicy']> =
  {
    critical: 'freeze_growth',
    warning: 'refactor_before_growth',
    healthy: 'allow_targeted_changes',
  };

/**
 * Builds the quality budget: the average of the dimension scores, the overall status, the policy
 * that goes with it (freeze growth, refactor first or targeted changes) and up to 12 blocking
 * issue codes (high-severity health issues and patterns).
 */
export function buildQualityBudget(input: BuildQualityGovernanceInput): QualityBudget {
  const dimensions = buildBudgetDimensions(input);
  const overallScore = Math.round(
    dimensions.reduce((sum, dimension) => sum + dimension.score, 0) / dimensions.length
  );
  const highSeverityIssues = input.health.issues
    .filter((issue) => issue.severity === 'high')
    .map((issue) => issue.code);
  const severePatterns = input.patterns
    .filter((pattern) => pattern.severity === 'high')
    .map((pattern) => pattern.id);
  const blockingIssueCodes = unique([...highSeverityIssues, ...severePatterns]).slice(0, 12);

  const overallStatus = deriveOverallStatus(
    dimensions,
    input.decompositionGuidance.summary.highPriorityCount,
    blockingIssueCodes.length
  );

  return {
    overallScore,
    overallStatus,
    recommendedPolicy: POLICY_BY_STATUS[overallStatus],
    blockingIssueCodes,
    dimensions,
  };
}

interface WaveSpec {
  id: string;
  title: string;
  goal: string;
  include: (candidate: DecompositionCandidate) => boolean;
}

const WAVE_SPECS: WaveSpec[] = [
  {
    id: 'wave-boundaries',
    title: 'Wave 1: Boundary Split',
    goal: 'Split mixed-responsibility modules first so later extractions happen inside clearer seams.',
    include: (candidate) =>
      candidate.targetType === 'module' ||
      candidate.action === 'split_responsibilities' ||
      candidate.action === 'extract_module',
  },
  {
    id: 'wave-classes',
    title: 'Wave 2: Class Extraction',
    goal: 'Extract god classes into narrower collaborators before touching downstream orchestration logic.',
    include: (candidate) => candidate.targetType === 'class',
  },
  {
    id: 'wave-methods',
    title: 'Wave 3: Method Simplification',
    goal: 'Reduce long/complex methods last, once module and class boundaries are stable enough to reveal clean helper seams.',
    include: (candidate) => candidate.targetType === 'method',
  },
];

type CollapsedFileGraph = ReturnType<typeof buildCollapsedFileGraph>;

/**
 * Builds one wave from its candidates. Priority is the average of the candidate score and the
 * dependency pressure of its file; blocking files are the files of earlier waves (up to 12).
 */
function buildWave(
  spec: WaveSpec,
  candidates: DecompositionCandidate[],
  previousWaves: RefactoringWave[],
  collapsed: CollapsedFileGraph
): RefactoringWave {
  const previousWaveFiles = previousWaves.flatMap((item) => item.fileIds);
  return {
    id: spec.id,
    title: spec.title,
    goal: spec.goal,
    candidateIds: candidates.map((candidate) => candidate.targetNodeId),
    targetLabels: candidates.map((candidate) => candidate.targetLabel),
    fileIds: unique(candidates.map((candidate) => candidate.fileNodeId)),
    blockingFileIds: unique(previousWaveFiles).slice(0, 12),
    priorityScore: Math.round(
      candidates.reduce(
        (sum, candidate) =>
          sum + candidate.score + scoreCandidateDependencyPressure(candidate, collapsed),
        0
      ) / candidates.length
    ),
    exitCriteria: createExitCriteria(spec.id, candidates),
  };
}

/**
 * Builds up to three ordered waves: boundary splits, class extraction, then method simplification.
 * In each wave the candidates with the most connected files come first, and each wave keeps at
 * most `limitPerWave` of them.
 */
export function buildRefactoringWaves(
  graph: GraphData,
  decompositionGuidance: DecompositionGuidance,
  limitPerWave = 5
): RefactoringWave[] {
  const collapsed = buildCollapsedFileGraph(graph);
  const producedWaves: RefactoringWave[] = [];

  for (const spec of WAVE_SPECS) {
    const candidates = decompositionGuidance.candidates
      .filter(spec.include)
      .sort(
        (left, right) =>
          scoreCandidateDependencyPressure(right, collapsed) -
            scoreCandidateDependencyPressure(left, collapsed) ||
          right.score - left.score ||
          left.targetLabel.localeCompare(right.targetLabel)
      )
      .slice(0, limitPerWave);

    if (candidates.length > 0) {
      producedWaves.push(buildWave(spec, candidates, producedWaves, collapsed));
    }
  }

  return producedWaves;
}

/**
 * Gate for the quality budget: blocks when the policy is freeze_growth, warns for
 * refactor_before_growth and passes otherwise.
 */
const buildBudgetGate = (budget: QualityBudget): QualityGate => {
  const statusByPolicy: Record<string, QualityGate['status']> = {
    freeze_growth: 'block',
    refactor_before_growth: 'warning',
  };
  return {
    id: 'gate-quality-budget',
    title: 'Quality Budget',
    status: statusByPolicy[budget.recommendedPolicy] ?? 'pass',
    rationale: summarizeBudgetForStep(budget),
  };
};

/**
 * Gate for high-priority extraction candidates: blocks at 3 or more, warns for 1 or 2, passes with
 * none.
 */
const buildExtractionGate = (decompositionGuidance: DecompositionGuidance): QualityGate => {
  const { highPriorityCount } = decompositionGuidance.summary;
  let status: QualityGate['status'] = 'pass';
  if (highPriorityCount >= 3) status = 'block';
  else if (highPriorityCount > 0) status = 'warning';
  return {
    id: 'gate-high-priority-extractions',
    title: 'High-Priority Extractions',
    status,
    rationale: `High-priority extraction candidates: ${highPriorityCount}.`,
  };
};

/**
 * Gate for the first refactoring wave: passes when there are no waves or the first has no blocking
 * files, otherwise warns.
 */
const buildWaveGate = (refactoringWaves: RefactoringWave[]): QualityGate => {
  const [firstWave] = refactoringWaves;
  if (!firstWave) {
    return {
      id: 'gate-wave-readiness',
      title: 'Wave Readiness',
      status: 'pass',
      rationale: 'No refactoring waves are required right now.',
    };
  }
  return {
    id: 'gate-wave-readiness',
    title: 'Wave Readiness',
    status: firstWave.blockingFileIds.length > 0 ? 'warning' : 'pass',
    rationale: `Current first wave is "${firstWave.title}" with ${firstWave.targetLabels.length} ranked targets.`,
  };
};

/**
 * Builds the dashboard from the three gates, the top blockers (blocking issue codes and blocking
 * files, at most 12) and the five best extraction candidates.
 */
export function buildQualityDashboard(
  budget: QualityBudget,
  decompositionGuidance: DecompositionGuidance,
  refactoringWaves: RefactoringWave[]
): QualityDashboard {
  const gates: QualityGate[] = [
    buildBudgetGate(budget),
    buildExtractionGate(decompositionGuidance),
    buildWaveGate(refactoringWaves),
  ];

  return {
    summary: {
      overallScore: budget.overallScore,
      overallStatus: budget.overallStatus,
      recommendedPolicy: budget.recommendedPolicy,
    },
    gates,
    topBlockers: unique([
      ...budget.blockingIssueCodes,
      ...refactoringWaves.flatMap((wave) => wave.blockingFileIds),
    ]).slice(0, 12),
    focusCandidates: decompositionGuidance.candidates.slice(0, 5).map((candidate) => ({
      targetLabel: candidate.targetLabel,
      action: candidate.action,
      priority: candidate.priority,
      score: candidate.score,
    })),
  };
}

/**
 * Gives one sentence of advice about the budget for use as a next step; unknown policies get the
 * healthy message.
 */
export function summarizeBudgetForStep(budget: QualityBudget) {
  switch (budget.recommendedPolicy) {
    case 'freeze_growth':
      return 'Quality budget is critical; stop additive growth and extract architectural seams first.';
    case 'refactor_before_growth':
      return 'Quality budget is under pressure; prefer targeted refactoring before adding new branches or adapters.';
    default:
      return 'Quality budget is healthy enough for targeted changes, but keep boundaries explicit.';
  }
}

function buildCollapsedFileGraph(graph: GraphData) {
  return buildCollapsedAdjacency(graph);
}

function scoreCandidateDependencyPressure(
  candidate: DecompositionCandidate,
  collapsed: { outgoing: Map<string, string[]>; incoming: Map<string, string[]> }
) {
  const fileId = toStructuralNodeId(candidate.fileNodeId);
  return (
    (collapsed.outgoing.get(fileId)?.length || 0) + (collapsed.incoming.get(fileId)?.length || 0)
  );
}

/**
 * Lists the checks that tell when a wave is done. The boundary and class waves have fixed
 * criteria; any other wave asks for the top methods (up to 3) to be simplified.
 */
function createExitCriteria(waveId: string, candidates: DecompositionCandidate[]) {
  switch (waveId) {
    case 'wave-boundaries':
      return [
        'Mixed-responsibility modules are split into narrower seams.',
        'New additive changes no longer target the original god modules directly.',
      ];
    case 'wave-classes':
      return [
        'Large classes expose smaller public APIs or extracted collaborators.',
        'Class-level responsibilities align with one architectural role.',
      ];
    default:
      return [
        `At least ${Math.min(3, candidates.length)} top-ranked methods are simplified or extracted.`,
        'Branching and nesting are reduced in the current hotspot set.',
      ];
  }
}
