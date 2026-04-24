import { GraphData, GraphNode } from '../store';
import { buildGraphAdjacency, getHierarchyDepth, hasKnownParent } from './graphAnalysisUtils';

export interface DetectedPattern {
  id: string;
  severity: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  nodeIds: string[];
}

export interface PatternDetectionResult {
  patterns: DetectedPattern[];
}

export class PatternDetectionAnalyzer {
  analyze(graph: GraphData): PatternDetectionResult {
    const { nodeById, incomingByTarget, outgoingBySource, childrenByParentId } = buildGraphAdjacency(graph);
    const patterns: DetectedPattern[] = [];

    const highFanInNodes = graph.nodes
      .filter((node) => ['file', 'class', 'function'].includes(node.type))
      .map((node) => ({ node, fanIn: (incomingByTarget.get(node.id) || []).length }))
      .filter(({ fanIn }) => fanIn >= 8)
      .sort((a, b) => b.fanIn - a.fanIn)
      .slice(0, 10);

    if (highFanInNodes.length > 0) {
      patterns.push({
        id: 'hub_nodes',
        severity: highFanInNodes.some(({ fanIn }) => fanIn >= 15) ? 'high' : 'medium',
        title: 'Hub Nodes',
        description: 'Узлы с чрезмерно высоким fan-in могут стать bottleneck и точкой массового влияния.',
        nodeIds: highFanInNodes.map(({ node }) => node.id),
      });
    }

    const highFanOutFiles = graph.nodes
      .filter((node) => node.type === 'file')
      .map((node) => ({ node, fanOut: (outgoingBySource.get(node.id) || []).length }))
      .filter(({ fanOut }) => fanOut >= 12)
      .sort((a, b) => b.fanOut - a.fanOut)
      .slice(0, 10);

    if (highFanOutFiles.length > 0) {
      patterns.push({
        id: 'high_fan_out_files',
        severity: highFanOutFiles.some(({ fanOut }) => fanOut >= 20) ? 'high' : 'medium',
        title: 'High Fan-Out Files',
        description: 'Файлы с большим количеством исходящих зависимостей перегружены ответственностью.',
        nodeIds: highFanOutFiles.map(({ node }) => node.id),
      });
    }

    const deepNestedNodes = graph.nodes
      .filter((node) => node.type === 'file' || node.type === 'directory')
      .filter((node) => getHierarchyDepth(node, nodeById) >= 5)
      .slice(0, 20);

    if (deepNestedNodes.length > 0) {
      patterns.push({
        id: 'deep_nesting',
        severity: deepNestedNodes.length > 10 ? 'medium' : 'low',
        title: 'Deep Nesting',
        description: 'Слишком глубокая вложенность каталогов усложняет навигацию и ownership.',
        nodeIds: deepNestedNodes.map((node) => node.id),
      });
    }

    const churnHotspots = graph.nodes
      .filter((node) => node.type === 'file' && node.churn >= 10)
      .sort((a, b) => b.churn - a.churn)
      .slice(0, 10);

    if (churnHotspots.length > 0) {
      patterns.push({
        id: 'churn_hotspots',
        severity: churnHotspots.some((node) => node.churn >= 25) ? 'high' : 'medium',
        title: 'Churn Hotspots',
        description: 'Файлы с высоким churn обычно содержат нестабильную или перегруженную бизнес-логику.',
        nodeIds: churnHotspots.map((node) => node.id),
      });
    }

    const adrLinkedFiles = new Map<string, Set<string>>();
    graph.links
      .filter((link) => link.type === 'adr')
      .forEach((link) => {
        const bucket = adrLinkedFiles.get(link.target) || new Set<string>();
        bucket.add(link.source);
        adrLinkedFiles.set(link.target, bucket);
      });

    const overlyBroadAdr = Array.from(adrLinkedFiles.entries())
      .filter(([, fileIds]) => fileIds.size >= 12)
      .map(([adrId]) => adrId);

    if (overlyBroadAdr.length > 0) {
      patterns.push({
        id: 'broad_adr_impact',
        severity: 'low',
        title: 'Broad ADR Impact',
        description: 'ADR связан с большим количеством файлов, стоит проверить granular ownership и traceability.',
        nodeIds: overlyBroadAdr,
      });
    }

    const isolatedFiles = graph.nodes
      .filter((node) => node.type === 'file')
      .filter((node) => {
        const fanIn = (incomingByTarget.get(node.id) || []).length;
        const fanOut = (outgoingBySource.get(node.id) || []).length;
        const hasKnownHierarchy = hasKnownParent(node, nodeById) || (childrenByParentId.get(node.id) || []).length > 0;
        return fanIn === 0 && fanOut === 0 && !hasKnownHierarchy;
      })
      .slice(0, 10);

    if (isolatedFiles.length >= 3) {
      patterns.push({
        id: 'isolated_files',
        severity: isolatedFiles.length >= 8 ? 'medium' : 'low',
        title: 'Isolated Files',
        description: 'Файлы не участвуют ни в зависимостях, ни в иерархических группах; проверьте игнор-листы, парсинг или фактическую связность проекта.',
        nodeIds: isolatedFiles.map((node) => node.id),
      });
    }

    return { patterns };
  }
}
