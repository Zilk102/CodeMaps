import { GraphData } from '../store/types';
import { ArchitectureInsightService } from './ArchitectureInsightService';
import { BlastRadiusAnalyzer } from './BlastRadiusAnalyzer';
import { PatternDetectionAnalyzer } from './PatternDetectionAnalyzer';
import { SecurityScanner } from './SecurityScanner';
import { DecompositionGuidanceService } from './DecompositionGuidanceService';
import { resolveTarget } from './changeContextSupport';
import {
  normalizeChangeTaskMode,
  resolveTargetClassification,
} from './changeContextRuntimeSupport';
import { createChangeContextServices, ChangeContextServices } from './changeContextServices';
import { collectChangeEvidence } from './changeContextEvidence';
import { assembleChangeContextResult } from './changeContextAssembly';
import type { ChangeContextResult, PrepareChangeContextInput } from './changeContextTypes';

export type {
  ChangeContextResult,
  ChangeTaskMode,
  PrepareChangeContextInput,
  ResolvedTargetContext,
} from './changeContextTypes';

/** Orchestrates target resolution, evidence gathering and result assembly for one change. */
export class ChangeContextService {
  private readonly services: ChangeContextServices;

  constructor(
    architectureInsightService?: ArchitectureInsightService,
    blastRadiusAnalyzer?: BlastRadiusAnalyzer,
    patternDetectionAnalyzer?: PatternDetectionAnalyzer,
    securityScanner?: SecurityScanner,
    decompositionGuidanceService?: DecompositionGuidanceService
  ) {
    this.services = createChangeContextServices(
      withoutUndefined({
        architectureInsightService,
        blastRadiusAnalyzer,
        patternDetectionAnalyzer,
        securityScanner,
        decompositionGuidanceService,
      })
    );
  }

  async prepareChangeContext(
    graph: GraphData,
    input: PrepareChangeContextInput
  ): Promise<ChangeContextResult> {
    const resolvedTarget = resolveTarget(graph, input.target, input.type);
    const architecture = this.services.architectureInsightService.analyze(graph);
    const targetClassification = resolveTargetClassification({
      architecture,
      resolvedTarget,
      graphProjectRoot: graph.projectRoot,
      architectureInsightService: this.services.architectureInsightService,
    });
    const evidence = await collectChangeEvidence(
      this.services,
      graph,
      input,
      resolvedTarget,
      architecture
    );

    return assembleChangeContextResult(graph, input, {
      taskMode: normalizeChangeTaskMode(input.taskMode),
      resolvedTarget,
      architecture,
      targetClassification,
      ...evidence,
    });
  }
}

function withoutUndefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined)
  ) as Partial<T>;
}
