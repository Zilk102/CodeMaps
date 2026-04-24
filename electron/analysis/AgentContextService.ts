import { GraphData, GraphLink, GraphNode } from '../store';
import {
  ArchitectureInsightService,
  ArchitectureNodeClassification,
  ArchitectureOverview,
  ArchitectureViolation,
} from './ArchitectureInsightService';
import { BlastRadiusAnalyzer, BlastRadiusResult } from './BlastRadiusAnalyzer';
import { HealthScoreAnalyzer, HealthScoreResult } from './HealthScoreAnalyzer';
import { DetectedPattern, PatternDetectionAnalyzer } from './PatternDetectionAnalyzer';
import { SecurityFinding, SecurityScanner } from './SecurityScanner';

export type ChangeTaskMode = 'bugfix' | 'feature' | 'refactor' | 'explore';
export type ReviewTaskMode = 'review' | 'architecture' | 'security' | 'stabilization';

export interface PrepareChangeContextInput {
  target: string;
  changeIntent?: string;
  type?: string;
  depth?: number;
  includeSecurityFindings?: boolean;
  taskMode?: ChangeTaskMode;
}

export interface PrepareReviewContextInput {
  focusQuery?: string;
  type?: string;
  limit?: number;
  includeSecurityFindings?: boolean;
  includeClassifications?: boolean;
  taskMode?: ReviewTaskMode;
}

export interface ResolvedTargetContext {
  query: string;
  exactMatch: boolean;
  node: GraphNode;
  alternatives: GraphNode[];
  resolutionReason: string;
}

export interface ChangeContextResult {
  graphSummary: {
    projectRoot: string;
    nodesCount: number;
    linksCount: number;
    nodeTypes: Record<string, number>;
  };
  taskMode: ChangeTaskMode;
  target: ResolvedTargetContext;
  changeIntent: string | null;
  targetClassification: ArchitectureNodeClassification;
  architecture: {
    summary: ArchitectureOverview['summary'];
    dominantLayerDependencies: ArchitectureOverview['dependencies'];
    targetViolations: ArchitectureViolation[];
  };
  dependencies: {
    outgoingLinks: GraphLink[];
    incomingLinks: GraphLink[];
    outgoingNodes: GraphNode[];
    incomingNodes: GraphNode[];
    relatedAdrNodes: GraphNode[];
  };
  blastRadius: {
    summary: Pick<BlastRadiusResult, 'rootNodeId' | 'depthLimit' | 'maxDepth' | 'confidence'>;
    directDependents: GraphNode[];
    affectedNodes: GraphNode[];
    affectedLinksCount: number;
  };
  relevantPatterns: DetectedPattern[];
  relatedSecurityFindings: SecurityFinding[];
  recommendedFilesToInspect: string[];
  risks: string[];
  autopilotPlan: {
    primaryGoal: string;
    whyThisTarget: string;
    preferredNextAction: 'inspect_code' | 'review_dependencies' | 'check_security' | 'verify_architecture';
    shouldFallbackToLowLevelTools: boolean;
  };
  nextSteps: string[];
}

export interface ReviewPriority {
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  reason: string;
  nodeIds: string[];
}

export interface ReviewContextResult {
  graphSummary: {
    projectRoot: string;
    nodesCount: number;
    linksCount: number;
    nodeTypes: Record<string, number>;
  };
  taskMode: ReviewTaskMode;
  health: HealthScoreResult;
  architecture: {
    summary: ArchitectureOverview['summary'];
    layers: ArchitectureOverview['layers'];
    dependencies: ArchitectureOverview['dependencies'];
    violations: ArchitectureOverview['violations'];
    classifications?: ArchitectureOverview['classifications'];
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
  focus: null | {
    query: string;
    matches: GraphNode[];
    classifications: ArchitectureNodeClassification[];
    relatedPatterns: DetectedPattern[];
    relatedViolations: ArchitectureViolation[];
  };
  reviewPriorities: ReviewPriority[];
  autopilotPlan: {
    primaryGoal: string;
    preferredOrder: Array<'security' | 'architecture' | 'patterns' | 'health' | 'focused_area'>;
    shouldFallbackToLowLevelTools: boolean;
  };
  nextSteps: string[];
}

const MAX_ALTERNATIVES = 5;
const MAX_RELATED_NODES = 12;
const MAX_RELATED_PATTERNS = 8;
const MAX_RELATED_FINDINGS = 10;
const MAX_REVIEW_PATTERNS = 12;
const MAX_REVIEW_FINDINGS = 20;

const toStructuralNodeId = (nodeId: string) => nodeId.split('#')[0];
const NORMALIZED_CODE_NODE_TYPES = ['file', 'class', 'function', 'adr'];
const CHANGE_TASK_MODES: ChangeTaskMode[] = ['bugfix', 'feature', 'refactor', 'explore'];
const REVIEW_TASK_MODES: ReviewTaskMode[] = ['review', 'architecture', 'security', 'stabilization'];

const unique = <T,>(items: T[]) => Array.from(new Set(items));

export class AgentContextService {
  constructor(
    private readonly architectureInsightService = new ArchitectureInsightService(),
    private readonly blastRadiusAnalyzer = new BlastRadiusAnalyzer(),
    private readonly healthScoreAnalyzer = new HealthScoreAnalyzer(),
    private readonly patternDetectionAnalyzer = new PatternDetectionAnalyzer(),
    private readonly securityScanner = new SecurityScanner(),
  ) {}

  async prepareChangeContext(graph: GraphData, input: PrepareChangeContextInput): Promise<ChangeContextResult> {
    const taskMode = this.normalizeChangeTaskMode(input.taskMode);
    const resolvedTarget = this.resolveTarget(graph, input.target, input.type);
    const architecture = this.architectureInsightService.analyze(graph);
    const targetClassification = architecture.classifications.find((record) => record.nodeId === resolvedTarget.node.id)
      || this.architectureInsightService.classifyNode(resolvedTarget.node);
    const dependencies = this.getNodeDependencies(graph, resolvedTarget.node.id);
    const blastRadius = this.blastRadiusAnalyzer.analyze(graph, resolvedTarget.node.id, input.depth);
    const patternResult = this.patternDetectionAnalyzer.analyze(graph);
    const relatedNodeIds = new Set<string>([
      resolvedTarget.node.id,
      ...dependencies.outgoingNodes.map((node) => node.id),
      ...dependencies.incomingNodes.map((node) => node.id),
      ...blastRadius.directDependents.map((node) => node.id),
      ...blastRadius.affectedNodes.map((node) => node.id),
    ]);
    const structuralNodeIds = new Set(Array.from(relatedNodeIds, (nodeId) => toStructuralNodeId(nodeId)));
    const relevantPatterns = patternResult.patterns
      .filter((pattern) => pattern.nodeIds.some((nodeId) =>
        relatedNodeIds.has(nodeId) || structuralNodeIds.has(toStructuralNodeId(nodeId))
      ))
      .slice(0, MAX_RELATED_PATTERNS);
    const securityFindings = input.includeSecurityFindings === false
      ? []
      : (await this.securityScanner.analyze(graph)).findings
        .filter((finding) => structuralNodeIds.has(toStructuralNodeId(finding.nodeId)))
        .slice(0, MAX_RELATED_FINDINGS);

    const targetViolations = architecture.violations.filter((violation) =>
      toStructuralNodeId(violation.sourceId) === toStructuralNodeId(resolvedTarget.node.id)
      || toStructuralNodeId(violation.targetId) === toStructuralNodeId(resolvedTarget.node.id)
    );

    const recommendedFilesToInspect = unique([
      toStructuralNodeId(resolvedTarget.node.id),
      ...dependencies.outgoingNodes.map((node) => toStructuralNodeId(node.id)),
      ...dependencies.incomingNodes.map((node) => toStructuralNodeId(node.id)),
      ...blastRadius.directDependents.map((node) => toStructuralNodeId(node.id)),
      ...blastRadius.affectedNodes.map((node) => toStructuralNodeId(node.id)),
    ]).slice(0, 15);

    return {
      graphSummary: this.createGraphSummary(graph),
      taskMode,
      target: resolvedTarget,
      changeIntent: input.changeIntent || null,
      targetClassification,
      architecture: {
        summary: architecture.summary,
        dominantLayerDependencies: architecture.dependencies.slice(0, 10),
        targetViolations,
      },
      dependencies: {
        outgoingLinks: dependencies.outgoingLinks.slice(0, MAX_RELATED_NODES),
        incomingLinks: dependencies.incomingLinks.slice(0, MAX_RELATED_NODES),
        outgoingNodes: dependencies.outgoingNodes.slice(0, MAX_RELATED_NODES),
        incomingNodes: dependencies.incomingNodes.slice(0, MAX_RELATED_NODES),
        relatedAdrNodes: dependencies.relatedAdrNodes.slice(0, MAX_RELATED_NODES),
      },
      blastRadius: {
        summary: {
          rootNodeId: blastRadius.rootNodeId,
          depthLimit: blastRadius.depthLimit,
          maxDepth: blastRadius.maxDepth,
          confidence: blastRadius.confidence,
        },
        directDependents: blastRadius.directDependents.slice(0, MAX_RELATED_NODES),
        affectedNodes: blastRadius.affectedNodes.slice(0, MAX_RELATED_NODES),
        affectedLinksCount: blastRadius.affectedLinks.length,
      },
      relevantPatterns,
      relatedSecurityFindings: securityFindings,
      recommendedFilesToInspect,
      autopilotPlan: this.buildChangeAutopilotPlan({
        taskMode,
        changeIntent: input.changeIntent,
        resolvedTarget,
        targetClassification,
        blastRadius,
        securityFindings,
      }),
      risks: this.buildChangeRisks({
        target: resolvedTarget.node,
        targetClassification,
        blastRadius,
        targetViolations,
        relevantPatterns,
        securityFindings,
      }),
      nextSteps: this.buildChangeNextSteps({
        changeIntent: input.changeIntent,
        target: resolvedTarget.node,
        targetClassification,
        recommendedFilesToInspect,
        blastRadius,
        securityFindings,
      }),
    };
  }

  async prepareReviewContext(graph: GraphData, input: PrepareReviewContextInput): Promise<ReviewContextResult> {
    const taskMode = this.normalizeReviewTaskMode(input.taskMode);
    const architecture = this.architectureInsightService.analyze(graph);
    const health = this.healthScoreAnalyzer.analyze(graph);
    const patterns = this.patternDetectionAnalyzer.analyze(graph).patterns.slice(0, input.limit || MAX_REVIEW_PATTERNS);
    const security = input.includeSecurityFindings === false
      ? {
        findings: [],
        summary: {
          total: 0,
          critical: 0,
          high: 0,
          medium: 0,
          low: 0,
        },
      }
      : await this.securityScanner.analyze(graph);
    const focus = this.prepareFocusContext(graph, architecture, patterns, input);

    return {
      graphSummary: this.createGraphSummary(graph),
      taskMode,
      health,
      architecture: {
        summary: architecture.summary,
        layers: architecture.layers,
        dependencies: architecture.dependencies.slice(0, input.limit || MAX_REVIEW_PATTERNS),
        violations: architecture.violations.slice(0, input.limit || MAX_REVIEW_PATTERNS),
        classifications: input.includeClassifications ? architecture.classifications : undefined,
      },
      patterns,
      security: {
        summary: security.summary,
        findings: security.findings.slice(0, MAX_REVIEW_FINDINGS),
      },
      focus,
      reviewPriorities: this.buildReviewPriorities(health, architecture, patterns, security.findings, focus),
      autopilotPlan: this.buildReviewAutopilotPlan(taskMode, security.findings, architecture, focus),
      nextSteps: this.buildReviewNextSteps(health, architecture, patterns, security.findings, Boolean(focus)),
    };
  }

  private resolveTarget(graph: GraphData, query: string, type?: string): ResolvedTargetContext {
    const normalizedQuery = query.trim().toLowerCase();
    const exactIdMatch = graph.nodes.find((node) => node.id.toLowerCase() === normalizedQuery && (!type || node.type === type));
    if (exactIdMatch) {
      return {
        query,
        exactMatch: true,
        node: exactIdMatch,
        alternatives: [],
        resolutionReason: 'exact_id_match',
      };
    }

    const matches = this.searchGraph(graph, query, type, MAX_ALTERNATIVES + 1);
    if (matches.length === 0) {
      throw new Error(`Node not found for query: ${query}`);
    }

    const promotedMatch = this.promoteCodeTarget(matches, normalizedQuery);
    if (promotedMatch) {
      const remaining = matches.filter((node) => node.id !== promotedMatch.id);
      matches.splice(0, matches.length, promotedMatch, ...remaining);
    }

    const exactMatch = this.isExactNodeMatch(matches[0], normalizedQuery);
    return {
      query,
      exactMatch,
      node: matches[0],
      alternatives: matches.slice(1, MAX_ALTERNATIVES + 1),
      resolutionReason: this.describeMatchReason(matches[0], normalizedQuery),
    };
  }

  private searchGraph(graph: GraphData, query: string, type?: string, limit = 20) {
    const normalizedQuery = query.trim().toLowerCase();
    return graph.nodes
      .filter((node) => {
        if (type && node.type !== type) return false;
        if (!normalizedQuery) return true;
        return node.label.toLowerCase().includes(normalizedQuery) || node.id.toLowerCase().includes(normalizedQuery);
      })
      .map((node) => ({
        node,
        score: this.scoreNodeMatch(node, normalizedQuery),
      }))
      .filter(({ score }) => score > 0)
      .sort((a, b) =>
        b.score - a.score
        || this.getNodeTypePriority(b.node.type) - this.getNodeTypePriority(a.node.type)
        || a.node.label.localeCompare(b.node.label)
      )
      .slice(0, limit)
      .map(({ node }) => node);
  }

  private getNodeDependencies(graph: GraphData, nodeId: string) {
    const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
    const outgoingLinks = graph.links.filter((link) => link.source === nodeId);
    const incomingLinks = graph.links.filter((link) => link.target === nodeId);
    const outgoingNodes = outgoingLinks
      .map((link) => nodeById.get(link.target))
      .filter((node): node is GraphNode => Boolean(node));
    const incomingNodes = incomingLinks
      .map((link) => nodeById.get(link.source))
      .filter((node): node is GraphNode => Boolean(node));
    const relatedAdrNodes = graph.links
      .filter((link) =>
        link.type === 'adr' && (link.source === nodeId || link.target === nodeId || toStructuralNodeId(link.source) === toStructuralNodeId(nodeId))
      )
      .flatMap((link) => [nodeById.get(link.source), nodeById.get(link.target)])
      .filter((node): node is GraphNode => node !== undefined && node.type === 'adr');

    return {
      outgoingLinks,
      incomingLinks,
      outgoingNodes,
      incomingNodes,
      relatedAdrNodes: unique(relatedAdrNodes),
    };
  }

  private prepareFocusContext(
    graph: GraphData,
    architecture: ArchitectureOverview,
    patterns: DetectedPattern[],
    input: PrepareReviewContextInput,
  ): ReviewContextResult['focus'] {
    if (!input.focusQuery?.trim()) {
      return null;
    }

    const normalizedQuery = input.focusQuery.trim().toLowerCase();
    const matches = this.searchGraph(graph, input.focusQuery, input.type, MAX_ALTERNATIVES);
    if (matches.length === 0) {
      return {
        query: input.focusQuery,
        matches: [],
        classifications: [],
        relatedPatterns: [],
        relatedViolations: [],
      };
    }

    const promotedMatch = this.promoteCodeTarget(matches, normalizedQuery);
    if (promotedMatch) {
      const remaining = matches.filter((node) => node.id !== promotedMatch.id);
      matches.splice(0, matches.length, promotedMatch, ...remaining);
    }

    const focusIds = new Set(matches.map((node) => node.id));
    const focusStructuralIds = new Set(matches.map((node) => toStructuralNodeId(node.id)));

    return {
      query: input.focusQuery,
      matches,
      classifications: architecture.classifications.filter((record) =>
        focusIds.has(record.nodeId) || focusStructuralIds.has(toStructuralNodeId(record.nodeId))
      ),
      relatedPatterns: patterns.filter((pattern) =>
        pattern.nodeIds.some((nodeId) => focusIds.has(nodeId) || focusStructuralIds.has(toStructuralNodeId(nodeId)))
      ),
      relatedViolations: architecture.violations.filter((violation) =>
        focusStructuralIds.has(toStructuralNodeId(violation.sourceId))
        || focusStructuralIds.has(toStructuralNodeId(violation.targetId))
      ),
    };
  }

  private buildReviewPriorities(
    health: HealthScoreResult,
    architecture: ArchitectureOverview,
    patterns: DetectedPattern[],
    securityFindings: SecurityFinding[],
    focus: ReviewContextResult['focus'],
  ): ReviewPriority[] {
    const priorities: ReviewPriority[] = [];

    if (securityFindings.some((finding) => finding.severity === 'critical')) {
      priorities.push({
        severity: 'critical',
        title: 'Security Findings',
        reason: 'В проекте есть критичные security findings; их нужно разобрать раньше любой архитектурной косметики.',
        nodeIds: unique(securityFindings.filter((finding) => finding.severity === 'critical').map((finding) => finding.nodeId)).slice(0, 10),
      });
    }

    if (architecture.violations.length > 0) {
      priorities.push({
        severity: architecture.violations.length > 10 ? 'high' : 'medium',
        title: 'Architecture Violations',
        reason: 'Нарушения межслоевых зависимостей бьют по maintainability и делают impact analysis менее предсказуемым.',
        nodeIds: unique(architecture.violations.slice(0, 10).flatMap((violation) => [violation.sourceId, violation.targetId])),
      });
    }

    const severePatterns = patterns.filter((pattern) => pattern.severity === 'high');
    if (severePatterns.length > 0) {
      priorities.push({
        severity: 'high',
        title: 'High-Severity Patterns',
        reason: 'Граф содержит hotspot-ы и anti-pattern candidates, которые повышают blast radius и churn risk.',
        nodeIds: unique(severePatterns.flatMap((pattern) => pattern.nodeIds)).slice(0, 10),
      });
    }

    if (health.issues.length > 0) {
      priorities.push({
        severity: health.grade === 'F' || health.grade === 'D' ? 'high' : 'medium',
        title: 'Health Issues',
        reason: 'Health score уже сигнализирует о структурных потерях: review должен покрыть эти деградации явно.',
        nodeIds: [],
      });
    }

    if (focus && focus.matches.length > 0) {
      priorities.push({
        severity: 'low',
        title: 'Focused Review Scope',
        reason: `Есть явный focus-запрос "${focus.query}", поэтому стоит дополнительно проверить локальные зависимости и слой целевой области.`,
        nodeIds: focus.matches.map((node) => node.id),
      });
    }

    return priorities.slice(0, 6);
  }

  private buildReviewNextSteps(
    health: HealthScoreResult,
    architecture: ArchitectureOverview,
    patterns: DetectedPattern[],
    securityFindings: SecurityFinding[],
    hasFocus: boolean,
  ) {
    const nextSteps = [
      'Начать review с узлов, попавших в top architecture violations и severe patterns.',
      'Проверить, не скрывают ли high fan-in/high fan-out узлы избыточную ответственность и неправильные границы модуля.',
    ];

    if (securityFindings.length > 0) {
      nextSteps.unshift('Сначала разобрать security findings, особенно критичные и high severity.');
    }

    if (health.issues.length > 0) {
      nextSteps.push('Сверить health issues с фактическим кодом и определить, что является реальной проблемой, а что эвристическим шумом.');
    }

    if (architecture.summary.unknownNodes > 0) {
      nextSteps.push('Уточнить правила классификации слоёв для unknown nodes, чтобы агент и review опирались на более точную модель.');
    }

    if (patterns.length === 0) {
      nextSteps.push('Явных structural patterns не найдено; review стоит сфокусировать на кодовых контрактах и runtime-поведении.');
    }

    if (hasFocus) {
      nextSteps.push('После общего обзора сделать отдельный локальный review для focus-области и проверить её blast radius вручную.');
    }

    return nextSteps;
  }

  private buildChangeAutopilotPlan(args: {
    taskMode: ChangeTaskMode;
    changeIntent?: string;
    resolvedTarget: ResolvedTargetContext;
    targetClassification: ArchitectureNodeClassification;
    blastRadius: BlastRadiusResult;
    securityFindings: SecurityFinding[];
  }): ChangeContextResult['autopilotPlan'] {
    const targetKind = `${args.resolvedTarget.node.type}:${args.resolvedTarget.node.label}`;
    const preferredNextAction: ChangeContextResult['autopilotPlan']['preferredNextAction'] = args.securityFindings.length > 0
      ? 'check_security'
      : args.blastRadius.affectedNodes.length > 0
        ? 'review_dependencies'
        : args.targetClassification.layer === 'shared' || args.targetClassification.layer === 'domain'
          ? 'verify_architecture'
          : 'inspect_code';

    return {
      primaryGoal: args.changeIntent || this.describeChangeModeGoal(args.taskMode),
      whyThisTarget: `${targetKind} выбран по причине ${args.resolvedTarget.resolutionReason}.`,
      preferredNextAction,
      shouldFallbackToLowLevelTools: args.resolvedTarget.alternatives.length > 0 && !args.resolvedTarget.exactMatch,
    };
  }

  private buildReviewAutopilotPlan(
    taskMode: ReviewTaskMode,
    securityFindings: SecurityFinding[],
    architecture: ArchitectureOverview,
    focus: ReviewContextResult['focus'],
  ) {
    const preferredOrder: Array<'security' | 'architecture' | 'patterns' | 'health' | 'focused_area'> = [];

    if (taskMode === 'security' || securityFindings.length > 0) {
      preferredOrder.push('security');
    }
    if (taskMode === 'architecture' || architecture.violations.length > 0) {
      preferredOrder.push('architecture');
    }
    preferredOrder.push('patterns', 'health');
    if (focus?.matches.length) {
      preferredOrder.push('focused_area');
    }

    return {
      primaryGoal: this.describeReviewModeGoal(taskMode),
      preferredOrder: unique(preferredOrder),
      shouldFallbackToLowLevelTools: Boolean(focus?.matches.length && !focus.relatedPatterns.length && !focus.relatedViolations.length),
    };
  }

  private buildChangeRisks(args: {
    target: GraphNode;
    targetClassification: ArchitectureNodeClassification;
    blastRadius: BlastRadiusResult;
    targetViolations: ArchitectureViolation[];
    relevantPatterns: DetectedPattern[];
    securityFindings: SecurityFinding[];
  }) {
    const risks: string[] = [];

    if (args.blastRadius.confidence === 'high' && args.blastRadius.affectedNodes.length > 0) {
      risks.push(`Изменение имеет подтверждённый impact на ${args.blastRadius.affectedNodes.length} зависимых узлов.`);
    }

    if (args.targetViolations.length > 0) {
      risks.push('Целевая область уже участвует в layer violations; локальная правка может закрепить архитектурный smell.');
    }

    if (args.relevantPatterns.some((pattern) => pattern.id === 'hub_nodes' || pattern.id === 'high_fan_out_files')) {
      risks.push('Цель лежит рядом с hotspot-узлами высокой связности; нужна осторожность с новыми зависимостями.');
    }

    if (args.securityFindings.length > 0) {
      risks.push('В смежных файлах уже есть security findings; изменение нужно сверять с безопасностью данных и API.');
    }

    if (args.targetClassification.layer === 'shared' || args.targetClassification.layer === 'domain') {
      risks.push(`Цель находится в слое ${args.targetClassification.layer}, поэтому blast radius может выходить далеко за локальный модуль.`);
    }

    if (risks.length === 0) {
      risks.push('Явных структурных red flags не найдено, но всё равно проверьте runtime-контракты и обратные зависимости.');
    }

    return risks;
  }

  private buildChangeNextSteps(args: {
    changeIntent?: string;
    target: GraphNode;
    targetClassification: ArchitectureNodeClassification;
    recommendedFilesToInspect: string[];
    blastRadius: BlastRadiusResult;
    securityFindings: SecurityFinding[];
  }) {
    const nextSteps = [
      `Сначала перечитать целевой узел ${args.target.id} и ближайшие файлы из recommendedFilesToInspect.`,
      'Проверить, не создаёт ли изменение новых layer violations и лишних import edges.',
    ];

    if (args.changeIntent) {
      nextSteps.unshift(`Уточнить change intent: ${args.changeIntent}.`);
    }

    if (args.blastRadius.affectedNodes.length > 0) {
      nextSteps.push('После правки перепроверить affected nodes из blast radius и убедиться, что контракты не деградировали.');
    }

    if (args.securityFindings.length > 0) {
      nextSteps.push('Отдельно перепроверить безопасную работу с секретами, shell/process APIs и browser storage.');
    }

    if (args.targetClassification.layer === 'application' || args.targetClassification.layer === 'integration') {
      nextSteps.push('Убедиться, что orchestration/integration код не начинает тянуть presentation детали или лишнее состояние.');
    }

    return nextSteps;
  }

  private normalizeChangeTaskMode(taskMode?: ChangeTaskMode): ChangeTaskMode {
    return CHANGE_TASK_MODES.includes(taskMode || 'bugfix') ? (taskMode || 'bugfix') : 'bugfix';
  }

  private normalizeReviewTaskMode(taskMode?: ReviewTaskMode): ReviewTaskMode {
    return REVIEW_TASK_MODES.includes(taskMode || 'review') ? (taskMode || 'review') : 'review';
  }

  private scoreNodeMatch(node: GraphNode, normalizedQuery: string) {
    const normalizedLabel = node.label.toLowerCase();
    const normalizedId = node.id.toLowerCase();
    const structuralId = toStructuralNodeId(normalizedId);
    const basename = structuralId.split('/').pop() || structuralId;
    const basenameWithoutExtension = basename.replace(/\.[^.]+$/u, '');
    const structuralLabel = normalizedLabel.replace(/\.[^.]+$/u, '');
    let score = 0;

    if (normalizedLabel === normalizedQuery) score += 140;
    if (basename === normalizedQuery) score += 180;
    if (basenameWithoutExtension === normalizedQuery) score += 220;
    if (structuralLabel === normalizedQuery) score += 160;
    if (normalizedId.endsWith(`/${normalizedQuery}`) || normalizedId.endsWith(`/${normalizedQuery}.ts`) || normalizedId.endsWith(`/${normalizedQuery}.tsx`)) {
      score += 160;
    }
    if (normalizedLabel.startsWith(normalizedQuery)) score += 60;
    if (basename.startsWith(normalizedQuery)) score += 80;
    if (basenameWithoutExtension.startsWith(normalizedQuery)) score += 100;
    if (normalizedLabel.includes(normalizedQuery)) score += 25;
    if (normalizedId.includes(`/${normalizedQuery}`)) score += 20;

    score += this.getNodeTypePriority(node.type) * 10;
    if (NORMALIZED_CODE_NODE_TYPES.includes(node.type)) {
      score += 20;
    }

    return score;
  }

  private getNodeTypePriority(type: string) {
    switch (type) {
      case 'function':
        return 6;
      case 'class':
        return 5;
      case 'file':
        return 4;
      case 'adr':
        return 3;
      case 'directory':
        return 1;
      default:
        return 2;
    }
  }

  private isExactNodeMatch(node: GraphNode, normalizedQuery: string) {
    const normalizedLabel = node.label.toLowerCase();
    const structuralId = toStructuralNodeId(node.id.toLowerCase());
    const basename = structuralId.split('/').pop() || structuralId;
    const basenameWithoutExtension = basename.replace(/\.[^.]+$/u, '');
    return normalizedLabel === normalizedQuery || basename === normalizedQuery || basenameWithoutExtension === normalizedQuery;
  }

  private describeMatchReason(node: GraphNode, normalizedQuery: string) {
    const normalizedLabel = node.label.toLowerCase();
    const structuralId = toStructuralNodeId(node.id.toLowerCase());
    const basename = structuralId.split('/').pop() || structuralId;
    const basenameWithoutExtension = basename.replace(/\.[^.]+$/u, '');

    if (basenameWithoutExtension === normalizedQuery) {
      return 'basename_without_extension_match';
    }
    if (basename === normalizedQuery) {
      return 'basename_match';
    }
    if (normalizedLabel === normalizedQuery) {
      return 'label_match';
    }
    if (normalizedLabel.startsWith(normalizedQuery)) {
      return 'label_prefix_match';
    }
    return 'fuzzy_graph_match';
  }

  private promoteCodeTarget(matches: GraphNode[], normalizedQuery: string) {
    const current = matches[0];
    if (!current || current.type !== 'directory') {
      return null;
    }

    const preferred = matches.find((candidate) => {
      if (!NORMALIZED_CODE_NODE_TYPES.includes(candidate.type)) {
        return false;
      }

      const structuralId = toStructuralNodeId(candidate.id.toLowerCase());
      const basename = structuralId.split('/').pop() || structuralId;
      const basenameWithoutExtension = basename.replace(/\.[^.]+$/u, '');
      const normalizedLabel = candidate.label.toLowerCase();

      return basenameWithoutExtension === normalizedQuery
        || basename === normalizedQuery
        || normalizedLabel === normalizedQuery
        || normalizedLabel.startsWith(normalizedQuery);
    });

    return preferred || null;
  }

  private describeChangeModeGoal(taskMode: ChangeTaskMode) {
    switch (taskMode) {
      case 'feature':
        return 'Найти безопасную точку интеграции для новой функциональности.';
      case 'refactor':
        return 'Изменить структуру без регресса по зависимостям и слоям.';
      case 'explore':
        return 'Понять область изменений и собрать минимально достаточный контекст.';
      case 'bugfix':
      default:
        return 'Найти и исправить дефект с минимальным blast radius.';
    }
  }

  private describeReviewModeGoal(taskMode: ReviewTaskMode) {
    switch (taskMode) {
      case 'architecture':
        return 'Проверить архитектурные границы, слои и ответственность модулей.';
      case 'security':
        return 'Найти и приоритизировать security risks и небезопасные паттерны.';
      case 'stabilization':
        return 'Найти точки структурной нестабильности и деградации maintainability.';
      case 'review':
      default:
        return 'Собрать архитектурный и качественный контекст для осмысленного review.';
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
