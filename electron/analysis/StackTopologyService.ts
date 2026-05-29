import { GraphData } from '../store';
import { StackInsightResult } from './StackInsightService';
import {
  BUILTIN_STACK_ADAPTERS,
  ProjectFileContext,
  StackAdapter,
  StackStructuralInsight,
} from './stackTopologyAdapters';

export type {
  StackAdapter,
  StackAdapterCategory,
  StackAdapterContext,
  StackRelationshipType,
  StackStructuralInsight,
  StackStructuralRelationship,
} from './stackTopologyAdapters';

export interface StackTopologyResult {
  frameworkInsights: StackStructuralInsight[];
  buildInsights: StackStructuralInsight[];
}

export class StackTopologyService {
  constructor(private readonly adapters: StackAdapter[] = BUILTIN_STACK_ADAPTERS) {}

  async analyze(graph: GraphData, stackProfile: StackInsightResult): Promise<StackTopologyResult> {
    const context = new ProjectFileContext(graph, stackProfile);
    const insights = (
      await Promise.all(
        this.adapters
          .filter((adapter) => adapter.supports(context))
          .map((adapter) => adapter.analyze(context))
      )
    ).filter((entry): entry is StackStructuralInsight => !!entry);

    return {
      frameworkInsights: insights.filter((entry) => entry.category === 'framework'),
      buildInsights: insights.filter((entry) => entry.category === 'build'),
    };
  }
}