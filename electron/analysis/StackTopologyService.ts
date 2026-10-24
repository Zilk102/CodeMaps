/**
 * Runs the stack adapters that apply to a project and collects their framework and build-system
 * structure (routes, modules, workspace packages, contract links).
 */
import { GraphData } from '../store/types';
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

/** Structural insights of a project split by what they describe: frameworks or build systems. */
export interface StackTopologyResult {
  frameworkInsights: StackStructuralInsight[];
  buildInsights: StackStructuralInsight[];
}

/**
 * Derives structural relationships (for example route to handler) from the detected stack by running adapters.
 */
export class StackTopologyService {
  constructor(private readonly adapters: StackAdapter[] = BUILTIN_STACK_ADAPTERS) {}

  /**
   * Runs every adapter whose `supports` accepts the project; adapters that find nothing return null and
   * are dropped. `stackProfile` is the already detected stack that adapters use to decide relevance.
   */
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
