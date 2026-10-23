import { GraphData } from '../store/types';
import {
  BUILTIN_STACK_DEFINITIONS,
  StackCategory,
  StackConfidence,
  StackDefinition,
} from './stackCatalog';
import { StackDetectionContext } from './stackDetectionContext';
import { evaluateStackRule } from './stackRuleEvaluation';

export interface DetectedStack {
  id: string;
  displayName: string;
  category: StackCategory;
  ecosystem: string;
  confidence: StackConfidence;
  evidence: string[];
}

export interface StackInsightResult {
  packageManagers: DetectedStack[];
  buildSystems: DetectedStack[];
  frameworks: DetectedStack[];
}

export class StackInsightService {
  constructor(private readonly definitions: StackDefinition[] = BUILTIN_STACK_DEFINITIONS) {}

  async analyze(graph: GraphData): Promise<StackInsightResult> {
    const context = new StackDetectionContext(graph);
    const detected = (
      await Promise.all(
        this.definitions.map((definition) => this.detectDefinition(context, definition))
      )
    ).filter((entry): entry is DetectedStack => !!entry);

    return {
      packageManagers: this.sortStacks(
        detected.filter((entry) => entry.category === 'package_manager')
      ),
      buildSystems: this.sortStacks(detected.filter((entry) => entry.category === 'build_system')),
      frameworks: this.sortStacks(detected.filter((entry) => entry.category === 'framework')),
    };
  }

  private sortStacks(entries: DetectedStack[]) {
    return entries.sort(
      (a, b) => a.displayName.localeCompare(b.displayName) || a.id.localeCompare(b.id)
    );
  }

  private async detectDefinition(
    context: StackDetectionContext,
    definition: StackDefinition
  ): Promise<DetectedStack | null> {
    const evidences = await Promise.all(
      definition.rules.map((rule) => evaluateStackRule(context, rule))
    );
    const matchedEvidence = evidences.flat();
    const matchedCount = evidences.filter((items) => items.length > 0).length;
    const shouldMatch =
      definition.matchMode === 'all' ? matchedCount === definition.rules.length : matchedCount > 0;

    if (!shouldMatch) {
      return null;
    }

    return {
      id: definition.id,
      displayName: definition.displayName,
      category: definition.category,
      ecosystem: definition.ecosystem,
      confidence: definition.confidence,
      evidence: Array.from(new Set(matchedEvidence)),
    };
  }
}
