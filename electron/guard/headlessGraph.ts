/**
 * Builds the project graph in memory without Electron, worker threads or Kuzu, for the headless
 * guard that runs in a project's CI. It drives the very same `ProjectIndexer`, `GraphBuilder`,
 * import resolution and stack enrichment as the desktop app; the only difference is that files are
 * parsed in this process instead of in a worker pool, so a CI job needs nothing but Node.
 */
import * as path from 'path';
import { StackGraphEnrichmentService } from '../oracle/StackGraphEnrichmentService';
import { GraphBuilder } from '../oracle/GraphBuilder';
import { getOraclePerformanceConfig } from '../oracle/performanceConfig';
import { ProjectIndexer } from '../oracle/ProjectIndexer';
import { normalizePath } from '../oracle/shared';
import { parseFile } from '../parsing/parseFile';
import type { ParseWorkerInput } from '../parsing/types';
import { ImportResolutionService } from '../resolution/ImportResolutionService';
import { oracleStore, runWithIsolatedStore, type GraphData } from '../store';

/**
 * Stand-in for the worker pool: `ProjectIndexer` only ever calls `run`, so parsing in-process is
 * a matter of handing it the worker's own function. Keeping the indexer means the guard cannot
 * drift from the app in what it discovers or ignores.
 */
const inProcessPool = { run: (input: ParseWorkerInput) => parseFile(input) };

/** Result of a headless build: the graph and how many source files were discovered. */
export interface HeadlessGraph {
  graph: GraphData;
  fileCount: number;
}

/**
 * Indexes the project at `root` into a private in-memory store and returns its graph, so it is safe
 * inside the desktop app: the open project, its graph, caches, watcher and recent projects are
 * never touched. Throws when the folder holds no indexable files. Nothing is written to disk and
 * git history (churn) is not read.
 */
export const buildHeadlessGraph = (root: string): Promise<HeadlessGraph> =>
  runWithIsolatedStore(() => indexIntoActiveStore(root));

/** Runs the indexer, import resolution and stack enrichment against whichever store is active (the private one when called through `buildHeadlessGraph`). */
const indexIntoActiveStore = async (root: string): Promise<HeadlessGraph> => {
  const baseDir = normalizePath(path.resolve(root));
  const store = oracleStore.getState();
  store.clear();
  store.setBaseDir(baseDir);

  const graphBuilder = new GraphBuilder();
  const indexer = new ProjectIndexer(
    inProcessPool as unknown as ConstructorParameters<typeof ProjectIndexer>[0],
    graphBuilder,
    getOraclePerformanceConfig()
  );
  const indexed = await indexer.indexProject(baseDir, null);
  await new ImportResolutionService().resolveAll();
  await new StackGraphEnrichmentService(graphBuilder).rebuild(
    oracleStore.getState().getValidGraph()
  );

  return { graph: oracleStore.getState().getValidGraph(), fileCount: indexed.filePaths.length };
};
