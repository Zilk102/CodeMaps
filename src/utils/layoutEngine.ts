import type { GraphData, GraphFilters, LayoutMode } from '../types/graph';
import { runDependencyLayout } from './layout/dependencyLayout';
import { runHierarchyLayout } from './layout/hierarchyLayout';
import type { LayoutResult } from './layout/layoutTypes';

export type { LayoutEdge, LayoutNode, LayoutResult } from './layout/layoutTypes';
export { buildElkHierarchy, flattenElkTree } from './layout/hierarchyLayout';
export { buildDependencyElkGraph } from './layout/dependencyLayout';

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
