import * as path from 'path';
import { GraphData } from '../../store/types';
import { toStructuralNodeId } from '../AgentContextUtils';
import { planSplit } from './clusterSymbols';
import { extractSymbolGraph } from './extractSymbolGraph';
import type { SplitPlan } from './types';

const relativeTo = (root: string | undefined, file: string) => {
  if (!root) return file;
  const normalizedRoot = root.replace(/\\/g, '/').replace(/\/$/, '');
  return file.startsWith(`${normalizedRoot}/`) ? file.slice(normalizedRoot.length + 1) : file;
};

export class SymbolClusterService {
  async planFile(filePath: string, projectRoot?: string): Promise<SplitPlan | null> {
    try {
      const graph = await extractSymbolGraph(filePath);
      return graph ? planSplit(graph, relativeTo(projectRoot, filePath.replace(/\\/g, '/'))) : null;
    } catch {
      // An unreadable or unparsable file simply has no plan.
      return null;
    }
  }

  /** Plans for the given graph nodes (files or symbols), at most `limit` distinct files. */
  async planFiles(graph: GraphData, nodeIds: string[], limit = 3): Promise<SplitPlan[]> {
    const fileIds = [...new Set(nodeIds.map((id) => toStructuralNodeId(id)))]
      .filter((id) => graph.nodes.some((node) => node.id === id && node.type === 'file'))
      .slice(0, limit);
    const plans: SplitPlan[] = [];
    for (const fileId of fileIds) {
      const plan = await this.planFile(path.normalize(fileId), graph.projectRoot);
      if (plan) plans.push(plan);
    }
    return plans;
  }
}
