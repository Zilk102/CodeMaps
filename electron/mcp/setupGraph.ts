/**
 * Supplies the graph `setup_project` measures its baseline from, without ever changing which
 * project the CodeMaps window has open.
 */
import * as path from 'path';
import { buildHeadlessGraph } from '../guard/headlessGraph';
import { oracle } from '../oracle';
import { oracleStore, type GraphData } from '../store';

const comparable = (value: string) => {
  const normalized = path.resolve(value).replace(/\\/g, '/').replace(/\/+$/, '');
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
};

/** Whether `root` is the project the app currently has open. */
const isOpenProject = (root: string): boolean => {
  const { baseDir } = oracleStore.getState();
  return Boolean(baseDir) && comparable(baseDir) === comparable(root);
};

/**
 * The graph of the project at `root`: the app's existing in-memory graph when that project is the
 * open one (no re-index), otherwise a graph built in a private store by the headless indexer the CI
 * guard uses. The open project, its graph, caches, watcher and recent projects stay untouched.
 */
export const graphForSetup = async (root: string): Promise<GraphData> =>
  isOpenProject(root) ? oracle.getGraph() : (await buildHeadlessGraph(root)).graph;
