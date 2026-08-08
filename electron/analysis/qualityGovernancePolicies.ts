import { GraphData } from '../store';
import { toStructuralNodeId, unique } from './AgentContextUtils';
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

export function buildQualityBudget(input: BuildQualityGovernanceInput): QualityBudget {
  const architectureScore = Math.max(
    0,
    Math.min(
      100,
      100 -
        input.health.summary.architectureViolations * 8 -
        input.health.summary.unknownLayerNodes * 0.2 -
        input.patterns.filter((pattern) => pattern.id === 'layer_violations').length * 15
    )
  );
  const operabilityScore = Math.max(
    0,
    Math.min(
      100,
      100 -
        (input.health.summary.refreshPipelineDegraded ? 25 : 0) -
        input.health.summary.avgRefreshLatencyMs * 0.4 -
        input.health.summary.refreshSkipRate * 30
    )
  );

  const dimensions: QualityBudgetDimension[] = [
    {
      name: 'maintainability',
      score: input.health.summary.maintainabilityScore,
      status: toStatus(input.health.summary.maintainabilityScore, 75, 55),
      rationale:
        'Reflects oversized modules, long/complex methods, design smell density, and safe refactoring cost.',
    },
    {
      name: 'solid',
      score: input.health.summary.solidScore,
      status: toStatus(input.health.summary.solidScore, 80, 60),
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

  const overallScore = Math.round(
    dimensions.reduce((sum, dimension) => sum + dimension.score, 0) / dimensions.length
  );
  const highSeverityIssues = input.health.issues
    .filter((issue) => issue.severity === 'high')
    .map((issue) => issue.code);
  const severePatterns = input.patterns
    .filter((pattern) => pattern.severity === 'high')
    .map((pattern) => pattern.id);
  const decompositionPressure = input.decompositionGuidance.summary.highPriorityCount;
  const blockingIssueCodes = unique([...highSeverityIssues, ...severePatterns]).slice(0, 12);

  const overallStatus =
    dimensions.some((dimension) => dimension.status === 'critical') ||
    decompositionPressure >= 3 ||
    blockingIssueCodes.length >= 4
      ? 'critical'
      : dimensions.some((dimension) => dimension.status === 'warning') ||
          blockingIssueCodes.length > 0
        ? 'warning'
        : 'healthy';

  const recommendedPolicy =
    overallStatus === 'critical'
      ? 'freeze_growth'
      : overallStatus === 'warning'
        ? 'refactor_before_growth'
        : 'allow_targeted_changes';

  return {
    overallScore,
    overallStatus,
    recommendedPolicy,
    blockingIssueCodes,
    dimensions,
  };
}

export function buildRefactoringWaves(
  graph: GraphData,
  decompositionGuidance: DecompositionGuidance,
  limitPerWave = 5
): RefactoringWave[] {
  const waveSpecs: Array<{
    id: string;
    title: string;
    goal: string;
    include: (candidate: DecompositionCandidate) => boolean;
  }> = [
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

  const collapsed = buildCollapsedFileGraph(graph);
  const producedWaves: RefactoringWave[] = [];

  for (const wave of waveSpecs) {
    const candidates = decompositionGuidance.candidates
      .filter(wave.include)
      .sort(
        (left, right) =>
          scoreCandidateDependencyPressure(right, collapsed) -
            scoreCandidateDependencyPressure(left, collapsed) ||
          right.score - left.score ||
          left.targetLabel.localeCompare(right.targetLabel)
      )
      .slice(0, limitPerWave);

    if (candidates.length === 0) {
      continue;
    }

    const fileIds = unique(candidates.map((candidate) => candidate.fileNodeId));
    const previousWaveFiles = producedWaves.flatMap((item) => item.fileIds);
    producedWaves.push({
      id: wave.id,
      title: wave.title,
      goal: wave.goal,
      candidateIds: candidates.map((candidate) => candidate.targetNodeId),
      targetLabels: candidates.map((candidate) => candidate.targetLabel),
      fileIds,
      blockingFileIds: unique(previousWaveFiles).slice(0, 12),
      priorityScore: Math.round(
        candidates.reduce(
          (sum, candidate) =>
            sum + candidate.score + scoreCandidateDependencyPressure(candidate, collapsed),
          0
        ) / candidates.length
      ),
      exitCriteria: createExitCriteria(wave.id, candidates),
    });
  }

  return producedWaves;
}

export function buildQualityDashboard(
  budget: QualityBudget,
  decompositionGuidance: DecompositionGuidance,
  refactoringWaves: RefactoringWave[]
): QualityDashboard {
  const gates: QualityGate[] = [
    {
      id: 'gate-quality-budget',
      title: 'Quality Budget',
      status:
        budget.recommendedPolicy === 'freeze_growth'
          ? 'block'
          : budget.recommendedPolicy === 'refactor_before_growth'
            ? 'warning'
            : 'pass',
      rationale: summarizeBudgetForStep(budget),
    },
    {
      id: 'gate-high-priority-extractions',
      title: 'High-Priority Extractions',
      status:
        decompositionGuidance.summary.highPriorityCount >= 3
          ? 'block'
          : decompositionGuidance.summary.highPriorityCount > 0
            ? 'warning'
            : 'pass',
      rationale: `High-priority extraction candidates: ${decompositionGuidance.summary.highPriorityCount}.`,
    },
    {
      id: 'gate-wave-readiness',
      title: 'Wave Readiness',
      status:
        refactoringWaves.length === 0
          ? 'pass'
          : refactoringWaves[0].blockingFileIds.length > 0
            ? 'warning'
            : 'pass',
      rationale:
        refactoringWaves.length === 0
          ? 'No refactoring waves are required right now.'
          : `Current first wave is "${refactoringWaves[0].title}" with ${refactoringWaves[0].targetLabels.length} ranked targets.`,
    },
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
  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();

  for (const link of graph.links) {
    const source = toStructuralNodeId(link.source);
    const target = toStructuralNodeId(link.target);
    if (source === target) {
      continue;
    }
    outgoing.set(source, unique([...(outgoing.get(source) || []), target]));
    incoming.set(target, unique([...(incoming.get(target) || []), source]));
  }

  return { outgoing, incoming };
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
