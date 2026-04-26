import * as fs from 'fs';
import * as path from 'path';
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

export interface ArchitectureRule {
  pattern: RegExp;
  layer: ArchitectureLayer;
  reason: string;
}

const DEFAULT_ARCHITECTURE_RULES: ArchitectureRule[] = [
  // Configuration, Automation, and Documentation
  { pattern: /\.(json|ya?ml|md|env.*|config\.[jt]s|rc)$/i, layer: 'configuration', reason: 'config_or_doc_file' },
  { pattern: /(^\/|\\|\/)(scripts|\.github|\.husky)\//i, layer: 'configuration', reason: 'automation_scripts' },
  { pattern: /(^\/|\\|\/)(test|__tests__|spec)\//i, layer: 'configuration', reason: 'test_or_support_path' },

  // Presentation / UI Layer
  { pattern: /(^\/|\\|\/)(components|views|pages|ui|screens|layouts|hooks|i18n|locales)\//i, layer: 'presentation', reason: 'ui_layer' },
  { pattern: /(^\/|\\|\/)(assets|public|static)\//i, layer: 'presentation', reason: 'static_assets' },
  { pattern: /\.(css|scss|sass|less|styl)$/i, layer: 'presentation', reason: 'stylesheet_path' },

  // State Management
  { pattern: /(^\/|\\|\/)(store|state|reducers|actions|context)\//i, layer: 'state', reason: 'state_management' },

  // Application / Services Layer
  { pattern: /(^\/|\\|\/)(services|usecases|application|features|controllers)\//i, layer: 'application', reason: 'application_logic' },

  // Domain / Core Layer
  { pattern: /(^\/|\\|\/)(domain|models|entities|core)\//i, layer: 'domain', reason: 'domain_logic' },

  // Infrastructure / Integration Layer
  { pattern: /(^\/|\\|\/)(infrastructure|db|database|api|clients|repositories|integration|bin)\//i, layer: 'integration', reason: 'infrastructure_integration' },
  { pattern: /(^\/|\\|\/)(electron|main|preload|mcp)\.ts$/i, layer: 'integration', reason: 'entrypoint_or_adapter_path' },

  // Shared / Utilities
  { pattern: /(^\/|\\|\/)(utils|shared|helpers|common|types|interfaces)\//i, layer: 'shared', reason: 'shared_utilities' },
  { pattern: /\.d\.ts$/i, layer: 'shared', reason: 'type_declaration_path' },
  
  // CodeMaps Specific Fallbacks (to maintain backward compatibility with its own internal structure)
  { pattern: /(^\/|\\|\/)(analysis)\//i, layer: 'analysis', reason: 'analysis_path' },
  { pattern: /(^\/|\\|\/)(parsing)\//i, layer: 'parsing', reason: 'parsing_path' },
  { pattern: /(^\/|\\|\/)(oracle)\//i, layer: 'application', reason: 'orchestration_path' },
];

const toStructuralNodeId = (nodeId: string) => nodeId.split('#')[0];

const normalizeNodePath = (node: GraphNode) => node.id.replace(/\\/g, '/').toLowerCase();

export class ArchitectureInsightService {
  private defaultRules: ArchitectureRule[];
  private cachedProjectRoot: string | null = null;
  private cachedCustomRules: ArchitectureRule[] | null = null;

  constructor(customRules?: ArchitectureRule[]) {
    this.defaultRules = customRules || DEFAULT_ARCHITECTURE_RULES;
  }

  getActiveRules(projectRoot: string): ArchitectureRule[] {
    if (this.cachedProjectRoot === projectRoot && this.cachedCustomRules) {
      return this.cachedCustomRules;
    }

    this.cachedProjectRoot = projectRoot;
    
    try {
      const configPath = path.join(projectRoot, '.codemaps', 'architecture.json');
      if (fs.existsSync(configPath)) {
        const configData = fs.readFileSync(configPath, 'utf-8');
        const parsed = JSON.parse(configData);
        if (parsed && Array.isArray(parsed.rules)) {
          this.cachedCustomRules = parsed.rules.map((r: any) => ({
            pattern: new RegExp(r.pattern, 'i'),
            layer: r.layer as ArchitectureLayer,
            reason: r.reason || 'custom_rule'
          }));
          return this.cachedCustomRules!;
        }
      }
    } catch (e) {
      console.error('[ArchitectureInsightService] Failed to load custom rules:', e);
    }

    this.cachedCustomRules = this.defaultRules;
    return this.defaultRules;
  }

  analyze(graph: GraphData): ArchitectureOverview {
    const activeRules = this.getActiveRules(graph.projectRoot);
    const classifications = graph.nodes.map((node) => this.classifyNode(node, activeRules));
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
        const [sourceLayer, targetLayer] = key.split('->') as [
          ArchitectureLayer,
          ArchitectureLayer,
        ];
        return { sourceLayer, targetLayer, count };
      })
      .sort(
        (a, b) =>
          b.count - a.count ||
          a.sourceLayer.localeCompare(b.sourceLayer) ||
          a.targetLayer.localeCompare(b.targetLayer)
      );

    const dominantLayer = layers.slice().sort((a, b) => b.count - a.count)[0]?.layer || 'unknown';

    return {
      classifications,
      layers,
      dependencies,
      violations,
      summary: {
        classifiedNodes: classifications.length,
        unknownNodes: classifications.filter((record) => record.layer === 'unknown').length,
        crossLayerDependencies: dependencies
          .filter((entry) => entry.sourceLayer !== entry.targetLayer)
          .reduce((sum, entry) => sum + entry.count, 0),
        violationCount: violations.length,
        dominantLayer,
      },
    };
  }

  classifyNode(node: GraphNode, activeRules: ArchitectureRule[]): ArchitectureNodeClassification {
    const normalizedPath = normalizeNodePath(node);
    const filePath = toStructuralNodeId(normalizedPath);

    // Apply the regex-based rules to determine the architecture layer
    for (const rule of activeRules) {
      if (rule.pattern.test(filePath)) {
        return { nodeId: node.id, layer: rule.layer, reason: rule.reason };
      }
    }

    return { nodeId: node.id, layer: 'unknown', reason: 'no_rule_matched' };
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

    if (
      sourceLayer === 'state' &&
      !['state', 'shared', 'configuration', 'domain'].includes(targetLayer)
    ) {
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
