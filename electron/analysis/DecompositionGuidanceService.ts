import * as path from 'path';
import { GraphData } from '../store';
import {
  analyzeModuleQuality,
  ModuleQualityMetric,
  SourceFunctionMetric,
} from './moduleQualityMetrics';
import { toStructuralNodeId, unique } from './AgentContextUtils';

export interface DecompositionCandidate {
  fileNodeId: string;
  targetNodeId: string;
  targetType: 'module' | 'class' | 'method';
  targetLabel: string;
  action:
    | 'extract_module'
    | 'split_responsibilities'
    | 'extract_class'
    | 'extract_method'
    | 'reduce_complexity';
  priority: 'high' | 'medium';
  score: number;
  reason: string;
  evidence: string[];
  lineRange?: {
    startLine: number;
    endLine: number;
  };
  metrics: {
    lineCount?: number;
    complexity?: number;
    branchCount?: number;
    maxNesting?: number;
    methodCount?: number;
    publicMethodCount?: number;
    designSmellScore?: number;
    responsibilityAxisCount?: number;
  };
}

export interface DecompositionGuidance {
  summary: {
    candidateCount: number;
    highPriorityCount: number;
    focusAreas: string[];
  };
  candidates: DecompositionCandidate[];
}

export interface PrepareDecompositionGuidanceInput {
  limit?: number;
  focusNodeIds?: string[];
}

const DEFAULT_LIMIT = 12;

export class DecompositionGuidanceService {
  prepareGuidance(
    graph: GraphData,
    input: PrepareDecompositionGuidanceInput = {}
  ): DecompositionGuidance {
    const quality = analyzeModuleQuality(graph);
    const focusStructuralIds = new Set(
      (input.focusNodeIds || []).map((nodeId) => toStructuralNodeId(nodeId))
    );
    const candidates = this.buildCandidates(quality.metrics)
      .filter(
        (candidate) =>
          focusStructuralIds.size === 0 ||
          focusStructuralIds.has(toStructuralNodeId(candidate.fileNodeId))
      )
      .sort(
        (left, right) =>
          right.score - left.score || left.targetLabel.localeCompare(right.targetLabel)
      )
      .slice(0, input.limit || DEFAULT_LIMIT);

    return {
      summary: {
        candidateCount: candidates.length,
        highPriorityCount: candidates.filter((candidate) => candidate.priority === 'high').length,
        focusAreas: unique(
          candidates.map((candidate) => toStructuralNodeId(candidate.fileNodeId))
        ).slice(0, 8),
      },
      candidates,
    };
  }

  private buildCandidates(metrics: ModuleQualityMetric[]): DecompositionCandidate[] {
    const candidates: DecompositionCandidate[] = [];

    for (const metric of metrics) {
      candidates.push(...this.createModuleCandidates(metric));
      candidates.push(...this.createClassCandidates(metric));
      candidates.push(...this.createMethodCandidates(metric));
    }

    return this.deduplicateCandidates(candidates);
  }

  private createModuleCandidates(metric: ModuleQualityMetric): DecompositionCandidate[] {
    const candidates: DecompositionCandidate[] = [];
    const fileLabel = path.basename(toStructuralNodeId(metric.node.id));

    if (metric.designSmellScore >= 55 || metric.mixedResponsibilities) {
      candidates.push({
        fileNodeId: metric.node.id,
        targetNodeId: metric.node.id,
        targetType: 'module',
        targetLabel: fileLabel,
        action: metric.mixedResponsibilities ? 'split_responsibilities' : 'extract_module',
        priority:
          metric.designSmellScore >= 75 || metric.responsibilityAxisCount >= 6 ? 'high' : 'medium',
        score:
          metric.designSmellScore +
          metric.responsibilityAxisCount * 4 +
          Math.min(20, metric.fanIn + metric.fanOut),
        reason: metric.mixedResponsibilities
          ? 'Module mixes multiple architectural responsibilities and should be split across clearer seams.'
          : 'Module has accumulated enough code and coupling that further edits should happen via extraction, not growth.',
        evidence: [
          `${fileLabel}: smell score ${metric.designSmellScore}, fan-in ${metric.fanIn}, fan-out ${metric.fanOut}.`,
          `${fileLabel}: responsibility axes ${metric.responsibilityAxisCount}, long methods ${metric.sourceMetrics.longMethods.length}, complex methods ${metric.sourceMetrics.complexMethods.length}.`,
        ],
        metrics: {
          lineCount: metric.lineCount || undefined,
          designSmellScore: metric.designSmellScore,
          responsibilityAxisCount: metric.responsibilityAxisCount,
        },
      });
    }

    return candidates;
  }

  private createClassCandidates(metric: ModuleQualityMetric): DecompositionCandidate[] {
    return metric.sourceMetrics.godClasses.map((item) => ({
      fileNodeId: metric.node.id,
      targetNodeId: `${metric.node.id}#${item.name}`,
      targetType: 'class' as const,
      targetLabel: item.name,
      action: 'extract_class' as const,
      priority:
        item.lineCount >= 280 || item.methodCount >= 12 || item.maxMethodComplexity >= 14
          ? 'high'
          : 'medium',
      score:
        item.lineCount +
        item.methodCount * 12 +
        item.publicMethodCount * 8 +
        item.maxMethodComplexity * 6 +
        metric.designSmellScore,
      reason:
        'Class exposes too much surface area or internal complexity and should be split into narrower collaborators.',
      evidence: [
        `${item.name}: ${item.lineCount} LOC, ${item.methodCount} methods, ${item.publicMethodCount} public methods.`,
        `${item.name}: long methods ${item.longMethodCount}, complex methods ${item.complexMethodCount}, max complexity ${item.maxMethodComplexity}.`,
      ],
      lineRange:
        item.startLine > 0 && item.endLine >= item.startLine
          ? { startLine: item.startLine, endLine: item.endLine }
          : undefined,
      metrics: {
        lineCount: item.lineCount,
        methodCount: item.methodCount,
        publicMethodCount: item.publicMethodCount,
        complexity: item.maxMethodComplexity,
        designSmellScore: metric.designSmellScore,
      },
    }));
  }

  private createMethodCandidates(metric: ModuleQualityMetric): DecompositionCandidate[] {
    const byName = new Map<string, SourceFunctionMetric>();
    for (const item of metric.sourceMetrics.longMethods) {
      byName.set(item.name, item);
    }
    for (const item of metric.sourceMetrics.complexMethods) {
      const existing = byName.get(item.name);
      if (!existing) {
        byName.set(item.name, item);
        continue;
      }

      byName.set(item.name, {
        ...existing,
        lineCount: Math.max(existing.lineCount, item.lineCount),
        startLine: existing.startLine || item.startLine,
        endLine: Math.max(existing.endLine, item.endLine),
        complexity: Math.max(existing.complexity, item.complexity),
        branchCount: Math.max(existing.branchCount, item.branchCount),
        maxNesting: Math.max(existing.maxNesting, item.maxNesting),
      });
    }

    return Array.from(byName.values()).map((item) => ({
      fileNodeId: metric.node.id,
      targetNodeId: `${metric.node.id}#${item.name}`,
      targetType: 'method' as const,
      targetLabel: item.name,
      action:
        item.complexity >= 10 || item.maxNesting >= 4 ? 'reduce_complexity' : 'extract_method',
      priority:
        item.lineCount >= 100 || item.complexity >= 14 || item.maxNesting >= 5 ? 'high' : 'medium',
      score:
        item.lineCount +
        item.complexity * 10 +
        item.branchCount * 2 +
        item.maxNesting * 6 +
        Math.round(metric.designSmellScore / 2),
      reason:
        item.complexity >= 10 || item.maxNesting >= 4
          ? 'Method is too complex to remain a stable unit and should be split into smaller decision blocks.'
          : 'Method is too long and should be broken into intention-revealing steps.',
      evidence: [
        `${item.name}: ${item.lineCount} LOC, complexity ${item.complexity}, branches ${item.branchCount}.`,
        `${item.name}: max nesting ${item.maxNesting}.`,
      ],
      lineRange:
        item.startLine > 0 && item.endLine >= item.startLine
          ? { startLine: item.startLine, endLine: item.endLine }
          : undefined,
      metrics: {
        lineCount: item.lineCount,
        complexity: item.complexity,
        branchCount: item.branchCount,
        maxNesting: item.maxNesting,
        designSmellScore: metric.designSmellScore,
      },
    }));
  }

  private deduplicateCandidates(candidates: DecompositionCandidate[]): DecompositionCandidate[] {
    const deduplicated = new Map<string, DecompositionCandidate>();

    for (const candidate of candidates) {
      const key = `${candidate.targetType}:${candidate.targetNodeId}:${candidate.action}`;
      const existing = deduplicated.get(key);
      if (!existing || candidate.score > existing.score) {
        deduplicated.set(key, candidate);
      }
    }

    return Array.from(deduplicated.values());
  }
}
