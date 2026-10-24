/** Creates normalized stack insights, so equal findings always serialize in the same order. */
import { StackAdapterCategory, StackStructuralInsight } from './stackTopologyTypes';

/**
 * Builds an insight whose lists are deduplicated and sorted; relationships are deduplicated on
 * source, target, type and reason and sorted by the same keys.
 */
export const createInsight = (
  adapterId: string,
  displayName: string,
  category: StackAdapterCategory,
  summary: string,
  {
    evidence = [],
    entryFiles = [],
    configFiles = [],
    components = [],
    routes = [],
    modules = [],
    relationships = [],
  }: Partial<
    Omit<StackStructuralInsight, 'adapterId' | 'displayName' | 'category' | 'summary'>
  > = {}
): StackStructuralInsight => ({
  adapterId,
  displayName,
  category,
  summary,
  evidence: Array.from(new Set(evidence)).sort(),
  entryFiles: Array.from(new Set(entryFiles)).sort(),
  configFiles: Array.from(new Set(configFiles)).sort(),
  components: Array.from(new Set(components)).sort(),
  routes: Array.from(new Set(routes)).sort(),
  modules: Array.from(new Set(modules)).sort(),
  relationships: relationships
    .filter(
      (relationship, index, all) =>
        all.findIndex(
          (candidate) =>
            candidate.source === relationship.source &&
            candidate.target === relationship.target &&
            candidate.type === relationship.type &&
            candidate.reason === relationship.reason
        ) === index
    )
    .sort(
      (a, b) =>
        a.source.localeCompare(b.source) ||
        a.target.localeCompare(b.target) ||
        a.type.localeCompare(b.type) ||
        a.reason.localeCompare(b.reason)
    ),
});
