/**
 * The operations on a baseline that tools call: create it from the current findings, load the
 * ratchet for a validation, and shrink it after code got better.
 *
 * `createProjectBaseline` is the entry point for a setup tool: it measures the whole project
 * itself (waiting for the clone and documentation indexes) and writes
 * `<project>/.codemaps/baseline.json`.
 */
import type { GraphData } from '../../store/types';
import { ArchitectureInsightService } from '../ArchitectureInsightService';
import { cloneIndex } from '../clones/CloneIndex';
import { documentationIndex } from '../documentation';
import { analyzeModuleQuality } from '../moduleQualityMetrics';
import { loadProjectConfig } from '../projectConfig/configLoader';
import {
  baselineFromFindings,
  readBaseline,
  shrinkBaseline,
  writeBaseline,
  type ShrinkResult,
} from './baselineFile';
import { collectFindings, type FindingSources } from './collectFindings';
import { summarizeKinds } from './legacyDebt';
import { buildRatchetContext, type RatchetContext } from './ratchet';
import type { Baseline, KindCounts } from './types';

/** What `createBaseline` wrote: the baseline, its file and a count per finding kind. */
export interface BaselineCreation {
  baseline: Baseline;
  path: string;
  total: number;
  byKind: KindCounts;
}

/**
 * Records every current finding of the project as accepted debt and writes the baseline file,
 * replacing an existing one. Needs a project root; throws when the graph has none.
 */
export const createBaseline = (sources: FindingSources): BaselineCreation => {
  const root = sources.graph.projectRoot;
  if (!root) throw new Error('Cannot create a baseline without a project root.');
  const findings = collectFindings(sources);
  const baseline = baselineFromFindings(findings);
  return {
    baseline,
    path: writeBaseline(root, baseline),
    total: findings.length,
    byKind: summarizeKinds(findings),
  };
};

/**
 * The ratchet of the project, or null when it does not apply: the project runs in strict mode,
 * or has no baseline yet. Without a ratchet every finding counts.
 */
export const loadRatchet = (sources: FindingSources): RatchetContext | null => {
  const root = sources.graph.projectRoot ?? '';
  if (loadProjectConfig(root).config.mode !== 'ratchet') return null;
  const baseline = readBaseline(root);
  return baseline ? buildRatchetContext(baseline, collectFindings(sources)) : null;
};

/** Lowers the baseline to the current findings (see `shrinkBaseline`); never adds an entry. */
export const refreshBaseline = (sources: FindingSources): ShrinkResult => {
  const root = sources.graph.projectRoot;
  return root
    ? shrinkBaseline(root, collectFindings(sources))
    : { removed: 0, tightened: 0, remaining: 0 };
};

/**
 * Measures a whole project from scratch: refreshes the clone and documentation indexes, then runs
 * the quality and architecture analyses. The sources are what the other functions here consume.
 */
export const measureProject = async (graph: GraphData): Promise<FindingSources> => {
  const documentation = await documentationIndex.refreshFor(graph);
  await cloneIndex.refreshFor(graph);
  return {
    graph,
    quality: analyzeModuleQuality(graph),
    architecture: new ArchitectureInsightService().analyze(graph),
    documentation,
  };
};

/**
 * Setup entry point: measures the project and writes its baseline. Call it once when strict rules
 * are switched on in an existing codebase; afterwards only new or worsened findings block.
 */
export const createProjectBaseline = async (graph: GraphData): Promise<BaselineCreation> =>
  createBaseline(await measureProject(graph));
