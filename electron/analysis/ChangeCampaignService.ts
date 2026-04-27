import { GraphData, GraphNode } from '../store';
import {
  ArchitectureInsightService,
  ArchitectureLayer,
  ArchitectureNodeClassification,
  ArchitectureOverview,
  ArchitectureViolation,
} from './ArchitectureInsightService';
import { BlastRadiusAnalyzer } from './BlastRadiusAnalyzer';
import { ChangeTaskMode } from './ChangeContextService';
import { DetectedPattern, PatternDetectionAnalyzer } from './PatternDetectionAnalyzer';
import { SecurityFinding, SecurityScanner } from './SecurityScanner';

export interface PrepareChangeCampaignInput {
  userRequest: string;
  candidateQueries: string[];
  seedNodeIds?: string[];
  taskMode?: ChangeTaskMode;
  depth?: number;
  maxSeeds?: number;
  maxFiles?: number;
  includeSecurityFindings?: boolean;
}

export interface ChangeCampaignResult {
  graphSummary: {
    projectRoot: string;
    nodesCount: number;
    linksCount: number;
    nodeTypes: Record<string, number>;
  };
  taskMode: ChangeTaskMode;
  userRequest: string;
  scope: {
    candidateQueries: string[];
    seedTargets: GraphNode[];
    directlyMatchedFiles: GraphNode[];
    affectedFiles: GraphNode[];
    breadth: 'small' | 'medium' | 'large';
  };
  architecture: {
    summary: ArchitectureOverview['summary'];
    layersInvolved: Array<{ layer: ArchitectureLayer; count: number }>;
    campaignViolations: ArchitectureViolation[];
  };
  blastRadius: {
    seeds: Array<{
      nodeId: string;
      confidence: 'high' | 'medium' | 'low';
      affectedFiles: string[];
    }>;
    totalAffectedFiles: number;
  };
  patterns: DetectedPattern[];
  security: {
    summary: {
      total: number;
      critical: number;
      high: number;
      medium: number;
      low: number;
    };
    findings: SecurityFinding[];
  };
  executionPlan: {
    preferredExecutionMode: 'multi_target_campaign';
    waves: Array<{
      id: string;
      title: string;
      goal: string;
      layer: ArchitectureLayer | 'mixed';
      fileIds: string[];
    }>;
    shouldFallbackToLowLevelTools: boolean;
  };
  risks: string[];
  nextSteps: string[];
}

const DEFAULT_MAX_SEEDS = 8;
const DEFAULT_MAX_FILES = 30;
const MAX_PATTERN_RESULTS = 10;
const MAX_SECURITY_FINDINGS = 12;
const CAMPAIGN_NODE_TYPES = ['file', 'class', 'function'];

const toStructuralNodeId = (nodeId: string) => nodeId.split('#')[0];
const unique = <T>(items: T[]) => Array.from(new Set(items));

export class ChangeCampaignService {
  constructor(
    private readonly architectureInsightService = new ArchitectureInsightService(),
    private readonly blastRadiusAnalyzer = new BlastRadiusAnalyzer(),
    private readonly patternDetectionAnalyzer = new PatternDetectionAnalyzer(),
    private readonly securityScanner = new SecurityScanner()
  ) {}

  async prepareContext(
    graph: GraphData,
    input: PrepareChangeCampaignInput
  ): Promise<ChangeCampaignResult> {
    const taskMode = input.taskMode || 'refactor';
    const architecture = this.architectureInsightService.analyze(graph);
    const layerByNodeId = new Map(
      architecture.classifications.map((record) => [record.nodeId, record])
    );
    const seedTargets = this.resolveSeedTargets(graph, input, architecture);
    const directlyMatchedFiles = this.collectMatchedFiles(
      graph,
      seedTargets,
      input.candidateQueries,
      input.maxSeeds || DEFAULT_MAX_SEEDS
    );
    const affectedFiles = this.expandAffectedFiles(
      graph,
      directlyMatchedFiles,
      input.depth || 2,
      input.maxFiles || DEFAULT_MAX_FILES
    );
    const blastRadius = this.buildCampaignBlastRadius(
      graph,
      directlyMatchedFiles,
      input.depth || 2,
      input.maxFiles || DEFAULT_MAX_FILES
    );
    const campaignStructuralIds = new Set(affectedFiles.map((node) => toStructuralNodeId(node.id)));
    const patterns = this.patternDetectionAnalyzer
      .analyze(graph)
      .patterns.filter((pattern) =>
        pattern.nodeIds.some((nodeId) => campaignStructuralIds.has(toStructuralNodeId(nodeId)))
      )
      .slice(0, MAX_PATTERN_RESULTS);
    const securityScan =
      input.includeSecurityFindings === false
        ? {
            summary: { total: 0, critical: 0, high: 0, medium: 0, low: 0 },
            findings: [] as SecurityFinding[],
          }
        : await this.securityScanner.analyze(graph);
    const securityFindings = securityScan.findings
      .filter((finding) => campaignStructuralIds.has(toStructuralNodeId(finding.nodeId)))
      .slice(0, MAX_SECURITY_FINDINGS);
    const layersInvolved = this.buildLayersInvolved(affectedFiles, layerByNodeId);
    const campaignViolations = architecture.violations.filter(
      (violation) =>
        campaignStructuralIds.has(toStructuralNodeId(violation.sourceId)) ||
        campaignStructuralIds.has(toStructuralNodeId(violation.targetId))
    );
    const waves = this.buildExecutionWaves(affectedFiles, layerByNodeId);

    return {
      graphSummary: this.createGraphSummary(graph),
      taskMode,
      userRequest: input.userRequest,
      scope: {
        candidateQueries: input.candidateQueries,
        seedTargets,
        directlyMatchedFiles,
        affectedFiles,
        breadth: this.getBreadth(affectedFiles.length),
      },
      architecture: {
        summary: architecture.summary,
        layersInvolved,
        campaignViolations,
      },
      blastRadius,
      patterns,
      security: {
        summary: {
          total: securityFindings.length,
          critical: securityFindings.filter((finding) => finding.severity === 'critical').length,
          high: securityFindings.filter((finding) => finding.severity === 'high').length,
          medium: securityFindings.filter((finding) => finding.severity === 'medium').length,
          low: securityFindings.filter((finding) => finding.severity === 'low').length,
        },
        findings: securityFindings,
      },
      executionPlan: {
        preferredExecutionMode: 'multi_target_campaign',
        waves,
        shouldFallbackToLowLevelTools: directlyMatchedFiles.length === 0,
      },
      risks: this.buildRisks(
        affectedFiles,
        layersInvolved,
        campaignViolations,
        patterns,
        securityFindings
      ),
      nextSteps: this.buildNextSteps(
        taskMode,
        directlyMatchedFiles,
        affectedFiles,
        waves,
        securityFindings.length > 0
      ),
    };
  }

  private resolveSeedTargets(
    graph: GraphData,
    input: PrepareChangeCampaignInput,
    architecture: ArchitectureOverview
  ) {
    const seedNodes = new Map<string, GraphNode>();
    const maxSeeds = input.maxSeeds || DEFAULT_MAX_SEEDS;

    for (const seedNodeId of input.seedNodeIds || []) {
      const exact = graph.nodes.find((node) => node.id === seedNodeId);
      if (exact) {
        seedNodes.set(exact.id, exact);
      }
    }

    const candidates = graph.nodes
      .filter((node) => CAMPAIGN_NODE_TYPES.includes(node.type))
      .map((node) => ({
        node,
        score: input.candidateQueries.reduce(
          (max, query) => Math.max(max, this.scoreNodeMatch(node, query)),
          0
        ),
      }))
      .filter(({ score }) => score > 0)
      .sort(
        (a, b) =>
          b.score - a.score ||
          this.getNodeTypePriority(b.node.type) - this.getNodeTypePriority(a.node.type) ||
          a.node.label.localeCompare(b.node.label)
      )
      .slice(0, maxSeeds * 3);

    for (const { node } of candidates) {
      seedNodes.set(node.id, node);
      if (seedNodes.size >= maxSeeds) {
        break;
      }
    }

    // If no explicit file-level matches were found, include top orchestrators from likely impacted layers
    if (seedNodes.size === 0) {
      const fallback = architecture.classifications
        .filter((record) => ['application', 'integration', 'analysis'].includes(record.layer))
        .slice(0, maxSeeds)
        .map((record) => graph.nodes.find((node) => node.id === record.nodeId))
        .filter((node): node is GraphNode => Boolean(node));
      for (const node of fallback) {
        seedNodes.set(node.id, node);
      }
    }

    return Array.from(seedNodes.values()).slice(0, maxSeeds);
  }

  private collectMatchedFiles(
    graph: GraphData,
    seedTargets: GraphNode[],
    candidateQueries: string[],
    maxSeeds: number
  ) {
    const fileNodes = new Map<string, GraphNode>();

    for (const target of seedTargets) {
      const structuralId = toStructuralNodeId(target.id);
      const fileNode = graph.nodes.find((node) => node.id === structuralId && node.type === 'file');
      if (fileNode) {
        fileNodes.set(fileNode.id, fileNode);
      }
    }

    if (fileNodes.size === 0) {
      for (const node of graph.nodes) {
        if (node.type !== 'file') {
          continue;
        }
        const matched = candidateQueries.some((query) => this.scoreNodeMatch(node, query) > 0);
        if (matched) {
          fileNodes.set(node.id, node);
        }
        if (fileNodes.size >= maxSeeds) {
          break;
        }
      }
    }

    return Array.from(fileNodes.values()).slice(0, maxSeeds);
  }

  private expandAffectedFiles(
    graph: GraphData,
    files: GraphNode[],
    depth: number,
    maxFiles: number
  ) {
    const collapsed = this.buildCollapsedFileGraph(graph);
    const queue = files.map((node) => ({ id: node.id, depth: 0 }));
    const visited = new Set(queue.map((entry) => entry.id));
    const results = new Set(queue.map((entry) => entry.id));

    while (queue.length > 0 && results.size < maxFiles) {
      const current = queue.shift()!;
      if (current.depth >= depth) {
        continue;
      }

      const neighbors = [
        ...(collapsed.outgoing.get(current.id) || []),
        ...(collapsed.incoming.get(current.id) || []),
      ];

      for (const neighbor of neighbors) {
        if (visited.has(neighbor)) {
          continue;
        }
        visited.add(neighbor);
        results.add(neighbor);
        queue.push({ id: neighbor, depth: current.depth + 1 });
        if (results.size >= maxFiles) {
          break;
        }
      }
    }

    return Array.from(results)
      .map((id) => graph.nodes.find((node) => node.id === id))
      .filter((node): node is GraphNode => Boolean(node))
      .slice(0, maxFiles);
  }

  private buildCampaignBlastRadius(
    graph: GraphData,
    files: GraphNode[],
    depth: number,
    maxFiles: number
  ): ChangeCampaignResult['blastRadius'] {
    const seeds = files.map((file) => {
      const blast = this.blastRadiusAnalyzer.analyze(graph, file.id, depth);
      const affectedFiles = unique([
        file.id,
        ...blast.directDependents.map((node) => toStructuralNodeId(node.id)),
        ...blast.affectedNodes.map((node) => toStructuralNodeId(node.id)),
      ]).slice(0, maxFiles);

      return {
        nodeId: file.id,
        confidence: blast.confidence,
        affectedFiles,
      };
    });

    return {
      seeds,
      totalAffectedFiles: unique(seeds.flatMap((seed) => seed.affectedFiles)).length,
    };
  }

  private buildCollapsedFileGraph(graph: GraphData) {
    const outgoing = new Map<string, string[]>();
    const incoming = new Map<string, string[]>();

    for (const link of graph.links) {
      const source = toStructuralNodeId(link.source);
      const target = toStructuralNodeId(link.target);

      if (source === target) {
        continue;
      }

      const sourceNode = graph.nodes.find((node) => node.id === source);
      const targetNode = graph.nodes.find((node) => node.id === target);
      if (sourceNode?.type !== 'file' || targetNode?.type !== 'file') {
        continue;
      }

      outgoing.set(source, unique([...(outgoing.get(source) || []), target]));
      incoming.set(target, unique([...(incoming.get(target) || []), source]));
    }

    return { outgoing, incoming };
  }

  private buildLayersInvolved(
    affectedFiles: GraphNode[],
    layerByNodeId: Map<string, ArchitectureNodeClassification>
  ) {
    const counts = new Map<ArchitectureLayer, number>();

    for (const node of affectedFiles) {
      const record = layerByNodeId.get(node.id);
      if (!record) {
        continue;
      }
      counts.set(record.layer, (counts.get(record.layer) || 0) + 1);
    }

    return Array.from(counts.entries())
      .map(([layer, count]) => ({ layer, count }))
      .sort((a, b) => b.count - a.count || a.layer.localeCompare(b.layer));
  }

  private buildExecutionWaves(
    affectedFiles: GraphNode[],
    layerByNodeId: Map<string, ArchitectureNodeClassification>
  ) {
    const groups = new Map<
      string,
      { layer: ArchitectureLayer | 'mixed'; title: string; goal: string; fileIds: string[] }
    >();

    const waveDefinition: Array<{
      key: string;
      layers: ArchitectureLayer[];
      title: string;
      goal: string;
    }> = [
      {
        key: 'wave-foundation',
        layers: ['shared', 'state', 'configuration'],
        title: 'Wave 1: Foundations',
        goal: 'Сначала стабилизировать общие контракты, shared-типы и конфигурационные точки интеграции.',
      },
      {
        key: 'wave-core',
        layers: ['application', 'analysis', 'parsing'],
        title: 'Wave 2: Core Logic',
        goal: 'Потом перевести основную оркестрацию и бизнес/analysis ядро на новую модель.',
      },
      {
        key: 'wave-edge',
        layers: ['integration', 'presentation'],
        title: 'Wave 3: Edge Integration',
        goal: 'В конце адаптировать входные точки, UI и integration-слой к уже обновлённым контрактам.',
      },
    ];

    for (const wave of waveDefinition) {
      groups.set(wave.key, {
        layer: wave.layers[0],
        title: wave.title,
        goal: wave.goal,
        fileIds: [],
      });
    }

    for (const file of affectedFiles) {
      const layer = layerByNodeId.get(file.id)?.layer;
      const wave = waveDefinition.find((entry) => layer && entry.layers.includes(layer));
      if (wave) {
        groups.get(wave.key)!.fileIds.push(file.id);
      } else {
        const fallback = groups.get('wave-core');
        if (fallback) {
          fallback.fileIds.push(file.id);
          fallback.layer = 'mixed';
        }
      }
    }

    return Array.from(groups.entries())
      .map(([id, group]) => ({
        id,
        title: group.title,
        goal: group.goal,
        layer: group.layer,
        fileIds: unique(group.fileIds).slice(0, 15),
      }))
      .filter((wave) => wave.fileIds.length > 0);
  }

  private buildRisks(
    affectedFiles: GraphNode[],
    layersInvolved: Array<{ layer: ArchitectureLayer; count: number }>,
    campaignViolations: ArchitectureViolation[],
    patterns: DetectedPattern[],
    securityFindings: SecurityFinding[]
  ) {
    const risks: string[] = [];

    if (affectedFiles.length >= 20) {
      risks.push(
        `Кампания затрагивает ${affectedFiles.length} файлов; высок риск частичных несовместимых изменений между волнами.`
      );
    }
    if (layersInvolved.length >= 3) {
      risks.push(
        'Затронуто несколько архитектурных слоёв; нужно удержать границы и не смешать foundation/core/edge изменения.'
      );
    }
    if (campaignViolations.length > 0) {
      risks.push(
        'Часть файлов кампании уже вовлечена в layer violations; миграция может закрепить smell, если не поправить границы сразу.'
      );
    }
    if (
      patterns.some((pattern) => pattern.id === 'hub_nodes' || pattern.id === 'high_fan_out_files')
    ) {
      risks.push(
        'Кампания пересекается с high fan-out / hub areas; blast radius может быть больше, чем видно по именам файлов.'
      );
    }
    if (securityFindings.length > 0) {
      risks.push(
        'В области кампании есть security findings; миграцию нужно сверять с безопасностью токенов, cookies и API contracts.'
      );
    }
    if (risks.length === 0) {
      risks.push(
        'Явных structural red flags не найдено, но массовую миграцию всё равно нужно выполнять по фазам и с post-wave validation.'
      );
    }

    return risks;
  }

  private buildNextSteps(
    taskMode: ChangeTaskMode,
    directlyMatchedFiles: GraphNode[],
    affectedFiles: GraphNode[],
    waves: ChangeCampaignResult['executionPlan']['waves'],
    hasSecurityFindings: boolean
  ) {
    const nextSteps = [
      `CodeMaps определил задачу как multi-target campaign в режиме "${taskMode}".`,
      `Сначала подтвердить seed-файлы кампании: ${
        directlyMatchedFiles
          .map((node) => node.id)
          .slice(0, 5)
          .join(', ') || 'явные seed-файлы не найдены'
      }.`,
      `После подтверждения выполнять миграцию волнами, а не пытаться править все ${affectedFiles.length} файлов за один проход.`,
    ];

    for (const wave of waves.slice(0, 3)) {
      nextSteps.push(`${wave.title}: ${wave.fileIds.length} файлов. Цель: ${wave.goal}`);
    }

    if (hasSecurityFindings) {
      nextSteps.unshift('До начала миграции разобрать security findings в затронутой области.');
    }

    return nextSteps;
  }

  private getBreadth(count: number): ChangeCampaignResult['scope']['breadth'] {
    if (count >= 20) return 'large';
    if (count >= 8) return 'medium';
    return 'small';
  }

  private scoreNodeMatch(node: GraphNode, rawQuery: string) {
    const normalizedQuery = rawQuery.trim().toLowerCase();
    if (!normalizedQuery) {
      return 0;
    }

    const normalizedLabel = node.label.toLowerCase();
    const normalizedId = node.id.toLowerCase();
    const structuralId = toStructuralNodeId(normalizedId);
    const basename = structuralId.split('/').pop() || structuralId;
    const basenameWithoutExtension = basename.replace(/\.[^.]+$/u, '');
    let score = 0;

    if (normalizedLabel === normalizedQuery) score += 160;
    if (basename === normalizedQuery) score += node.type === 'file' ? 200 : 100;
    if (basenameWithoutExtension === normalizedQuery) score += node.type === 'file' ? 240 : 120;
    if (normalizedLabel.startsWith(normalizedQuery)) score += 90;
    if (basename.startsWith(normalizedQuery)) score += node.type === 'file' ? 110 : 50;
    if (basenameWithoutExtension.startsWith(normalizedQuery))
      score += node.type === 'file' ? 130 : 60;
    if (normalizedLabel.includes(normalizedQuery)) score += 45;
    if (normalizedId.includes(normalizedQuery)) score += node.type === 'file' ? 40 : 20;

    if (score === 0) {
      return 0;
    }

    return score + this.getNodeTypePriority(node.type) * 10;
  }

  private getNodeTypePriority(type: string) {
    switch (type) {
      case 'file':
        return 5;
      case 'class':
        return 4;
      case 'function':
        return 3;
      default:
        return 1;
    }
  }

  private createGraphSummary(graph: GraphData) {
    return {
      projectRoot: graph.projectRoot,
      nodesCount: graph.nodes.length,
      linksCount: graph.links.length,
      nodeTypes: graph.nodes.reduce<Record<string, number>>((acc, node) => {
        acc[node.type] = (acc[node.type] || 0) + 1;
        return acc;
      }, {}),
    };
  }
}
