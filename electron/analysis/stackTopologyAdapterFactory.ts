/**
 * Factories that build stack topology adapters from a short description, so each adapter only states
 * what it finds and the stack check, evidence and insight creation are shared.
 */
import {
  createInsight,
  toRelativeList,
  type StackAdapter,
  type StackAdapterCategory,
  type StackAdapterContext,
  type StackStructuralInsight,
} from './stackTopologySupport';
import { filesWithNameIn, loadSources, type AdapterSources } from './stackTopologySources';
import { configEntryLinks } from './stackTopologyLinks';

type InsightDetails = Partial<
  Omit<StackStructuralInsight, 'adapterId' | 'displayName' | 'category' | 'summary'>
>;

/**
 * What an adapter found: a summary line and the structure details (routes, modules, links, ...).
 */
export interface AdapterFindings {
  /** The summary line. */
  summary: string;
  /** The structure found (evidence is added by the adapter). */
  details: InsightDetails;
}

interface ConfiguredFindings {
  summary: string;
  entryFiles: string[];
  /** Config files that are each linked to every entry file with the `configReason`. */
  configFiles: string[];
  configReason: string;
  /** Files listed as configuration besides the linked `configFiles`. */
  otherConfigFiles?: string[];
  /** The rest of the structure found; the config links are appended to its relationships. */
  details: InsightDetails;
}

/** Findings of a framework whose configuration files point at its entry files. */
export const configuredFindings = (
  sources: AdapterSources,
  found: ConfiguredFindings
): AdapterFindings => ({
  summary: found.summary,
  details: {
    ...found.details,
    entryFiles: found.entryFiles,
    configFiles: toRelativeList(sources.context, [
      ...found.configFiles,
      ...(found.otherConfigFiles ?? []),
    ]),
    relationships: [
      ...(found.details.relationships ?? []),
      ...configEntryLinks(sources, found.configFiles, found.entryFiles, found.configReason),
    ],
  },
});

interface AdapterSpec {
  id: string;
  displayName: string;
  category: StackAdapterCategory;
  /** The detected stack the adapter belongs to; its evidence is reported. */
  stackId: string;
  /** Further detected stacks whose evidence is reported too. */
  alsoEvidence?: string[];
  /** Defaults to "the stack was detected". */
  supports?: StackAdapter['supports'];
  find: (context: StackAdapterContext) => Promise<AdapterFindings | null> | AdapterFindings | null;
}

/** An adapter states what it finds; the stack check, the evidence and the insight are shared. */
export const defineAdapter = (spec: AdapterSpec): StackAdapter => ({
  id: spec.id,
  displayName: spec.displayName,
  category: spec.category,
  supports: spec.supports ?? ((context) => !!context.getDetectedStack(spec.stackId)),
  analyze: async (context) => {
    const found = await spec.find(context);
    if (!found) return null;
    const evidence = [spec.stackId, ...(spec.alsoEvidence ?? [])].flatMap(
      (stackId) => context.getDetectedStack(stackId)?.evidence || []
    );
    return createInsight(spec.id, spec.displayName, spec.category, found.summary, {
      evidence,
      ...found.details,
    });
  },
});

interface SourceAdapterSpec {
  id: string;
  displayName: string;
  stackId: string;
  /** Source files the adapter reads. */
  extensions: RegExp;
  /** File names of the tool's configuration; the matching sources are handed to `describe`. */
  configBasenames?: ReadonlySet<string>;
  describe: (sources: AdapterSources, configFiles: string[]) => AdapterFindings;
}

/** An adapter that reads the project files with the given extensions and describes them. */
export const defineSourceAdapter = (category: StackAdapterCategory, spec: SourceAdapterSpec) =>
  defineAdapter({
    id: spec.id,
    displayName: spec.displayName,
    category,
    stackId: spec.stackId,
    find: async (context) => {
      const sources = await loadSources(context, spec.extensions);
      const configFiles = filesWithNameIn(sources.entries, spec.configBasenames ?? new Set());
      return spec.describe(sources, configFiles);
    },
  });

/** A framework adapter reads the sources and describes the structure found in them. */
export const defineFrameworkAdapter = (spec: SourceAdapterSpec): StackAdapter =>
  defineSourceAdapter('framework', spec);
