import { GraphData, GraphNode } from '../store';

export type ArchitectureLayer =
  | 'presentation'
  | 'application'
  | 'domain'
  | 'analysis'
  | 'parsing'
  | 'integration'
  | 'state'
  | 'shared'
  | 'configuration'
  | 'unknown';

export interface ArchitectureNodeClassification {
  nodeId: string;
  layer: ArchitectureLayer;
  reason: string;
}

export interface ArchitectureLayerSummary {
  layer: ArchitectureLayer;
  count: number;
  sampleNodeIds: string[];
}

export interface LayerDependencySummary {
  sourceLayer: ArchitectureLayer;
  targetLayer: ArchitectureLayer;
  count: number;
}

export interface ArchitectureViolation {
  sourceId: string;
  targetId: string;
  sourceLayer: ArchitectureLayer;
  targetLayer: ArchitectureLayer;
  reason: string;
}

export interface ArchitectureOverview {
  classifications: ArchitectureNodeClassification[];
  layers: ArchitectureLayerSummary[];
  dependencies: LayerDependencySummary[];
  violations: ArchitectureViolation[];
  summary: {
    classifiedNodes: number;
    unknownNodes: number;
    crossLayerDependencies: number;
    violationCount: number;
    dominantLayer: ArchitectureLayer;
  };
}

const ALL_LAYERS: ArchitectureLayer[] = [
  'presentation',
  'application',
  'domain',
  'analysis',
  'parsing',
  'integration',
  'state',
  'shared',
  'configuration',
  'unknown',
];

const toStructuralNodeId = (nodeId: string) => nodeId.split('#')[0];

const normalizeNodePath = (node: GraphNode) => node.id.replace(/\\/g, '/').toLowerCase();

export class ArchitectureInsightService {
  analyze(graph: GraphData): ArchitectureOverview {
    const classifications = graph.nodes.map((node) => this.classifyNode(node));
    const layerByNodeId = new Map(classifications.map((record) => [record.nodeId, record.layer]));

    const layers = ALL_LAYERS.map((layer) => {
      const matching = classifications.filter((record) => record.layer === layer);
      return {
        layer,
        count: matching.length,
        sampleNodeIds: matching.slice(0, 5).map((record) => record.nodeId),
      };
    }).filter((summary) => summary.count > 0);

    const dependencyCounts = new Map<string, number>();
    const dedupedImportEdges = new Map<string, { sourceId: string; targetId: string }>();

    for (const link of graph.links) {
      if (link.type !== 'import') {
        continue;
      }

      const sourceId = toStructuralNodeId(link.source);
      const targetId = toStructuralNodeId(link.target);
      if (!sourceId || !targetId || sourceId === targetId) {
        continue;
      }

      const dedupeKey = `${sourceId}->${targetId}`;
      if (!dedupedImportEdges.has(dedupeKey)) {
        dedupedImportEdges.set(dedupeKey, { sourceId, targetId });
      }
    }

    const violations: ArchitectureViolation[] = [];

    for (const { sourceId, targetId } of dedupedImportEdges.values()) {
      const sourceLayer = layerByNodeId.get(sourceId) || 'unknown';
      const targetLayer = layerByNodeId.get(targetId) || 'unknown';
      const dependencyKey = `${sourceLayer}->${targetLayer}`;
      dependencyCounts.set(dependencyKey, (dependencyCounts.get(dependencyKey) || 0) + 1);

      const violationReason = this.getViolationReason(sourceLayer, targetLayer);
      if (violationReason) {
        violations.push({
          sourceId,
          targetId,
          sourceLayer,
          targetLayer,
          reason: violationReason,
        });
      }
    }

    const dependencies = Array.from(dependencyCounts.entries())
      .map(([key, count]) => {
        const [sourceLayer, targetLayer] = key.split('->') as [ArchitectureLayer, ArchitectureLayer];
        return { sourceLayer, targetLayer, count };
      })
      .sort((a, b) => b.count - a.count || a.sourceLayer.localeCompare(b.sourceLayer) || a.targetLayer.localeCompare(b.targetLayer));

    const dominantLayer = layers
      .slice()
      .sort((a, b) => b.count - a.count)[0]?.layer || 'unknown';

    return {
      classifications,
      layers,
      dependencies,
      violations,
      summary: {
        classifiedNodes: classifications.length,
        unknownNodes: classifications.filter((record) => record.layer === 'unknown').length,
        crossLayerDependencies: dependencies.filter((entry) => entry.sourceLayer !== entry.targetLayer).reduce((sum, entry) => sum + entry.count, 0),
        violationCount: violations.length,
        dominantLayer,
      },
    };
  }

  classifyNode(node: GraphNode): ArchitectureNodeClassification {
    const normalizedPath = normalizeNodePath(node);
    const filePath = toStructuralNodeId(normalizedPath);

    if (this.isConfigurationNode(filePath)) {
      return { nodeId: node.id, layer: 'configuration', reason: 'config_or_script_path' };
    }

    if (filePath.endsWith('/electron') || filePath.includes('/electron/')) {
      if (filePath.endsWith('/electron/analysis')) {
        return { nodeId: node.id, layer: 'analysis', reason: 'analysis_directory_path' };
      }
      if (filePath.endsWith('/electron/parsing')) {
        return { nodeId: node.id, layer: 'parsing', reason: 'parsing_directory_path' };
      }
      if (filePath.endsWith('/electron/oracle')) {
        return { nodeId: node.id, layer: 'application', reason: 'application_directory_path' };
      }
      if (filePath.endsWith('/electron') && node.type === 'directory') {
        return { nodeId: node.id, layer: 'integration', reason: 'electron_root_directory' };
      }
    }

    if (filePath.endsWith('/src') && node.type === 'directory') {
      return { nodeId: node.id, layer: 'presentation', reason: 'frontend_root_directory' };
    }

    if (filePath.endsWith('/src/components') || filePath.includes('/src/components/')) {
      return { nodeId: node.id, layer: 'presentation', reason: 'ui_component_path' };
    }

    if (filePath.endsWith('/src/store') || filePath.includes('/src/store/')) {
      return { nodeId: node.id, layer: 'state', reason: 'state_store_path' };
    }

    if (filePath.endsWith('/src/utils') || filePath.includes('/src/utils/')) {
      return { nodeId: node.id, layer: 'shared', reason: 'shared_utility_path' };
    }

    if (filePath.endsWith('/src/types') || filePath.includes('/src/types/')) {
      return { nodeId: node.id, layer: 'shared', reason: 'shared_type_contract_path' };
    }

    if (filePath.endsWith('.css')) {
      return { nodeId: node.id, layer: 'presentation', reason: 'stylesheet_path' };
    }

    if (filePath.endsWith('.d.ts')) {
      return { nodeId: node.id, layer: 'shared', reason: 'type_declaration_path' };
    }

    if (filePath.includes('/src/components/') || filePath.includes('/src/app.') || filePath.includes('/src/main.')) {
      return { nodeId: node.id, layer: 'presentation', reason: 'ui_component_path' };
    }

    if (filePath.includes('/src/store/') || filePath.endsWith('/store.ts') || filePath.endsWith('/usestore.ts')) {
      return { nodeId: node.id, layer: 'state', reason: 'state_store_path' };
    }

    if (filePath.includes('/analysis/')) {
      return { nodeId: node.id, layer: 'analysis', reason: 'analysis_path' };
    }

    if (filePath.includes('/parsing/') || filePath.endsWith('/queries.ts') || filePath.endsWith('/worker.ts')) {
      return { nodeId: node.id, layer: 'parsing', reason: 'parsing_path' };
    }

    if (filePath.includes('/oracle/') || filePath.endsWith('/oracle.ts')) {
      return { nodeId: node.id, layer: 'application', reason: 'orchestration_path' };
    }

    if (filePath.endsWith('/mcp.ts') || filePath.endsWith('/main.ts') || filePath.endsWith('/preload.ts')) {
      return { nodeId: node.id, layer: 'integration', reason: 'entrypoint_or_adapter_path' };
    }

    if (filePath.includes('/domain/') || filePath.includes('/core/') || filePath.includes('/entities/') || filePath.includes('/models/')) {
      return { nodeId: node.id, layer: 'domain', reason: 'domain_path' };
    }

    if (filePath.includes('/shared/') || filePath.includes('/utils/') || filePath.endsWith('/shared.ts')) {
      return { nodeId: node.id, layer: 'shared', reason: 'shared_utility_path' };
    }

    if (filePath.endsWith('/test.ts') || filePath.includes('/test/')) {
      return { nodeId: node.id, layer: 'configuration', reason: 'test_or_support_path' };
    }

    return { nodeId: node.id, layer: 'unknown', reason: 'no_rule_matched' };
  }

  private isConfigurationNode(filePath: string) {
    if (filePath.endsWith('/scripts')) {
      return true;
    }

    return filePath.endsWith('/package.json')
      || filePath.endsWith('/tsconfig.json')
      || filePath.endsWith('/vite.config.ts')
      || filePath.endsWith('/index.html')
      || filePath.includes('/scripts/')
      || filePath.endsWith('/.env')
      || filePath.endsWith('/dockerfile')
      || filePath.endsWith('/docker-compose.yml');
  }

  private getViolationReason(sourceLayer: ArchitectureLayer, targetLayer: ArchitectureLayer) {
    if (sourceLayer === 'unknown' || targetLayer === 'unknown') {
      return null;
    }

    if (sourceLayer === targetLayer) {
      return null;
    }

    if (targetLayer === 'presentation' && sourceLayer !== 'presentation') {
      return 'Внутренний слой зависит от presentation-слоя.';
    }

    if (sourceLayer === 'domain' && !['domain', 'shared', 'configuration'].includes(targetLayer)) {
      return 'Domain-слой не должен зависеть от инфраструктурных или orchestration-слоёв.';
    }

    if (sourceLayer === 'shared' && !['shared', 'configuration', 'domain'].includes(targetLayer)) {
      return 'Shared-слой должен оставаться низкоуровневым и не зависеть от верхних слоёв.';
    }

    if (sourceLayer === 'state' && !['state', 'shared', 'configuration', 'domain'].includes(targetLayer)) {
      return 'State-слой не должен тянуть presentation/application/integration детали напрямую.';
    }

    if (sourceLayer === 'analysis' && ['presentation', 'integration'].includes(targetLayer)) {
      return 'Analysis-слой не должен зависеть от presentation/integration.';
    }

    if (sourceLayer === 'parsing' && ['presentation', 'integration'].includes(targetLayer)) {
      return 'Parsing-слой не должен зависеть от presentation/integration.';
    }

    if (sourceLayer === 'application' && targetLayer === 'presentation') {
      return 'Application-слой не должен зависеть от presentation.';
    }

    return null;
  }
}
