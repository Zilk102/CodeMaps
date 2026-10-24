/**
 * Detects which package managers, build systems and frameworks a project uses by evaluating the
 * catalog's detection rules against the graph's files.
 */
import { GraphData } from '../store/types';
import {
  BUILTIN_STACK_DEFINITIONS,
  StackCategory,
  StackConfidence,
  StackDefinition,
} from './stackCatalog';
import { StackDetectionContext } from './stackDetectionContext';
import { evaluateStackRule } from './stackRuleEvaluation';

/** A stack found in the project, with the file or manifest evidence that triggered the rules. */
export interface DetectedStack {
  id: string;
  displayName: string;
  category: StackCategory;
  ecosystem: string;
  confidence: StackConfidence;
  evidence: string[];
}

/** Detected stacks of a project, grouped by category and sorted by display name. */
export interface StackInsightResult {
  packageManagers: DetectedStack[];
  buildSystems: DetectedStack[];
  frameworks: DetectedStack[];
}

/** Matches stack definitions (the built-in catalog by default) against a project's files. */
export class StackInsightService {
  constructor(private readonly definitions: StackDefinition[] = BUILTIN_STACK_DEFINITIONS) {}

  /** Evaluates every definition against the graph and returns the matches grouped by category. */
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

  /**
   * Matches one definition: with `matchMode` 'all' every rule must produce evidence, otherwise one
   * rule is enough. Returns null when it does not match; evidence is deduplicated across rules.
   */
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
