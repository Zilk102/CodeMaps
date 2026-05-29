import * as path from 'path';
import { getLanguageByExtension } from '../parsing/languageRegistry';
import { GraphData } from '../store';
import type { ArchitectureOverview } from './ArchitectureInsightService';
import { toStructuralNodeId, unique } from './AgentContextUtils';
import { DecompositionGuidance } from './DecompositionGuidanceService';
import { HealthScoreResult } from './HealthScoreAnalyzer';
import { isDesignSmellPattern } from './patternPolicies';
import type { ProjectInsightResult } from './ProjectInsightService';
import { DetectedPattern } from './PatternDetectionAnalyzer';
import { QualityBudget, RefactoringWave } from './QualityGovernanceService';
import { SecurityFinding } from './SecurityScanner';
import { DetectedStack } from './StackInsightService';
import { StackStructuralInsight } from './StackTopologyService';

const TECHNOLOGY_ALIASES: Array<{ match: RegExp; label: string }> = [
  { match: /\.tsx?$/u, label: 'TypeScript' },
  { match: /\.jsx?$/u, label: 'JavaScript' },
  { match: /\.json$/u, label: 'JSON' },
  { match: /\.css$/u, label: 'CSS' },
  { match: /\.md$/u, label: 'Markdown' },
];

export function buildProjectProfile(
  graph: GraphData,
  architecture: ArchitectureOverview,
  health: HealthScoreResult,
  stackProfile: {
    packageManagers: DetectedStack[];
    buildSystems: DetectedStack[];
    frameworks: DetectedStack[];
  },
  stackTopology: {
    frameworkInsights: StackStructuralInsight[];
    buildInsights: StackStructuralInsight[];
  }
): ProjectInsightResult['projectProfile'] {
  return {
    primaryTechnologies: detectPrimaryTechnologies(graph),
    languageSupportSummary: detectLanguageSupportSummary(graph),
    stackProfile,
    stackTopology,
    projectShape: describeProjectShape(architecture),
    architectureMaturity: getArchitectureMaturity(health, architecture),
  };
}

export function buildProjectAutopilotPlan(
  architecture: ArchitectureOverview,
  health: HealthScoreResult,
  patterns: DetectedPattern[],
  mentalModel: ProjectInsightResult['mentalModel']
): ProjectInsightResult['autopilotPlan'] {
  const preferredSequence: ProjectInsightResult['autopilotPlan']['preferredSequence'] = [
    'survey_project',
  ];

  if (architecture.summary.violationCount > 0 || architecture.summary.unknownNodes > 0) {
    preferredSequence.push('review_architecture');
  }

  if (patterns.length > 0 || health.issues.length > 0) {
    preferredSequence.push('inspect_hotspots');
  }

  preferredSequence.push('prepare_change', 'prepare_review');

  return {
    primaryGoal:
      'Form a working architectural mental model of the project for the agent before starting changes or reviews.',
    preferredSequence,
    recommendedStartingNodes: unique([
      ...mentalModel.entryPoints.map((node) => node.id),
      ...mentalModel.coreOrchestrators.map((node) => node.id),
      ...mentalModel.runtimeCompositionRoots.map((node) => node.id),
      ...mentalModel.contractSurfaces.map((node) => node.id),
    ]).slice(0, 10),
    shouldFallbackToLowLevelTools:
      architecture.summary.unknownNodes > 0 || mentalModel.entryPoints.length === 0,
  };
}

export function buildProjectNextSteps(
  health: HealthScoreResult,
  architecture: ArchitectureOverview,
  patterns: DetectedPattern[],
  securityFindings: SecurityFinding[],
  mentalModel: ProjectInsightResult['mentalModel'],
  operationalTelemetry: ProjectInsightResult['operationalTelemetry'],
  decompositionGuidance: DecompositionGuidance,
  qualityBudget: QualityBudget,
  refactoringWaves: RefactoringWave[],
  summarizeBudgetForStep: (budget: QualityBudget) => string
) {
  const nextSteps = [
    'First read entry points and core orchestrators to fix real control flows across the project.',
    'After a general overview, use prepare_change_context for any non-trivial change and prepare_review_context for audit/validation.',
  ];

  if (mentalModel.sharedFoundations.length > 0) {
    nextSteps.push(
      'Separately check shared foundations: these are nodes with high reuse and potentially wide blast radius.'
    );
  }

  if (mentalModel.runtimeCompositionRoots.length > 0) {
    nextSteps.push(
      'Review runtime composition roots separately: these files wire provider bindings, bean factories, or service registrations and often hide non-import architectural coupling.'
    );
  }

  if (mentalModel.contractSurfaces.length > 0) {
    nextSteps.push(
      'Inspect API contract surfaces separately: schema roots and generated/runtime bindings often widen impact beyond direct imports and file-local edits.'
    );
  }

  if (operationalTelemetry.watcher.coalescedFlushes > 0) {
    nextSteps.push(
      'Validate watcher batching metrics and keep hot edit bursts coalesced, otherwise incremental refresh will waste cycles on repeated graph updates.'
    );
  }

  if (operationalTelemetry.enrichment.runtimePriorityRebuilds > 0) {
    nextSteps.push(
      'Inspect runtime-priority rebuild paths and keep composition roots explicit, because they dominate incremental stack enrichment cost.'
    );
  }

  if (patterns.length > 0) {
    nextSteps.push(
      'Analyze hotspot patterns and understand which are real architectural risks and which are acceptable coordination centers.'
    );
  }

  if (patterns.some(isDesignSmellPattern)) {
    nextSteps.push(
      'Prioritize decomposition of design-smell hotspots: split oversized modules, extract god classes, shorten long methods, and separate orchestration from contracts/helpers before adding more responsibilities.'
    );
  }

  if (decompositionGuidance.candidates.length > 0) {
    nextSteps.push(
      'Use decomposition guidance as a concrete extraction queue: start with the highest-score class/method candidates instead of growing already overloaded hotspots.'
    );
  }

  if (refactoringWaves.length > 0) {
    nextSteps.push(
      `Execute architectural cleanup in waves: start with "${refactoringWaves[0].title}" before deeper class/method simplification.`
    );
  }

  nextSteps.push(summarizeBudgetForStep(qualityBudget));

  if (securityFindings.length > 0) {
    nextSteps.unshift(
      'Before making changes, review security findings and eliminate unsafe practices with processes, files, and user input.'
    );
  }

  if (health.issues.length > 0) {
    nextSteps.push(
      'Compare health issues with the actual project structure and adjust heuristics where they are noisy.'
    );
  }

  if (health.summary.maintainabilityScore < 85 || health.summary.solidScore < 85) {
    nextSteps.push(
      `Treat design debt as delivery risk: maintainability=${health.summary.maintainabilityScore.toFixed(1)}, solid=${health.summary.solidScore.toFixed(1)}. Prefer extraction and boundary cleanup before adding more orchestration logic.`
    );
  }

  if (architecture.summary.violationCount > 0 || architecture.summary.unknownNodes > 0) {
    nextSteps.push(
      'Close architectural gaps in layer classification and boundary rules, otherwise the agent autopilot will be less accurate.'
    );
  }

  return nextSteps;
}

function detectPrimaryTechnologies(graph: GraphData) {
  const counts = new Map<string, number>();
  for (const node of graph.nodes) {
    if (node.type !== 'file' && node.type !== 'adr') {
      continue;
    }

    const normalizedId = toStructuralNodeId(node.id).toLowerCase();
    const alias = TECHNOLOGY_ALIASES.find((candidate) => candidate.match.test(normalizedId));
    const label = alias?.label || 'Other';
    counts.set(label, (counts.get(label) || 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([name, fileCount]) => ({ name, fileCount }))
    .sort((a, b) => b.fileCount - a.fileCount || a.name.localeCompare(b.name))
    .slice(0, 5);
}

function detectLanguageSupportSummary(
  graph: GraphData
): ProjectInsightResult['projectProfile']['languageSupportSummary'] {
  const counts = new Map<
    string,
    {
      id: string;
      displayName: string;
      supportTier: 'semantic' | 'structural' | 'limited' | 'metadata';
      fileCount: number;
    }
  >();

  for (const node of graph.nodes) {
    if (node.type !== 'file') {
      continue;
    }

    const definition = getLanguageByExtension(path.extname(toStructuralNodeId(node.id)).toLowerCase());
    if (!definition) {
      continue;
    }

    const existing = counts.get(definition.id);
    if (existing) {
      existing.fileCount += 1;
      continue;
    }

    counts.set(definition.id, {
      id: definition.id,
      displayName: definition.displayName,
      supportTier: definition.supportTier,
      fileCount: 1,
    });
  }

  return Array.from(counts.values())
    .sort((a, b) => b.fileCount - a.fileCount || a.displayName.localeCompare(b.displayName))
    .slice(0, 10);
}

function describeProjectShape(architecture: ArchitectureOverview) {
  const layers = new Set(architecture.layers.map((entry) => entry.layer));
  if (
    layers.has('presentation') &&
    layers.has('application') &&
    layers.has('analysis') &&
    layers.has('parsing')
  ) {
    return 'Multi-layered system with distinct UI, orchestration, analysis, and parsing zones.';
  }
  if (layers.has('presentation') && layers.has('application')) {
    return 'Application with a clear separation of UI and orchestration.';
  }
  if (layers.has('analysis') || layers.has('parsing')) {
    return 'Tooling/analytical project with a dominant backend/analysis core.';
  }
  return 'Project structure is partially recognized; consider deepening the classification and entry points.';
}

function getArchitectureMaturity(
  health: HealthScoreResult,
  architecture: ArchitectureOverview
): 'strong' | 'fair' | 'weak' {
  if (
    health.score >= 90 &&
    architecture.summary.violationCount === 0 &&
    architecture.summary.unknownNodes === 0
  ) {
    return 'strong';
  }
  if (health.score >= 75 && architecture.summary.violationCount <= 5) {
    return 'fair';
  }
  return 'weak';
}
