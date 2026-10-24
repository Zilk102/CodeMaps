// Entry point that picks the hierarchy or dependency layout and re-exports the layout types and
// ELK builders.
import type { GraphData, GraphFilters, LayoutMode } from '../types/graph';
import { runDependencyLayout } from './layout/dependencyLayout';
import { runHierarchyLayout } from './layout/hierarchyLayout';
import type { LayoutResult } from './layout/layoutTypes';

export type { LayoutEdge, LayoutNode, LayoutResult } from './layout/layoutTypes';
export { buildElkHierarchy, flattenElkTree } from './layout/hierarchyLayout';
export { buildDependencyElkGraph } from './layout/dependencyLayout';

/**
 * Lays the filtered graph out with ELK in the requested mode; selectedNodeId only matters for the
 * dependency view, where it narrows the result to the selection's neighbours.
 */
export const runLayout = async (
  graphData: GraphData,
  filters: GraphFilters,
  layoutMode: LayoutMode,
  selectedNodeId?: string
): Promise<LayoutResult> => {
  if (layoutMode === 'dependencies') {
    return runDependencyLayout(graphData, filters, selectedNodeId);
  }

  return runHierarchyLayout(graphData, filters);
};
