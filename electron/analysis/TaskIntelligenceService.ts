import { GraphData, GraphNode } from '../store';
import {
  ChangeContextResult,
  ChangeTaskMode,
  ChangeContextService,
} from './ChangeContextService';
import {
  ReviewContextResult,
  ReviewTaskMode,
  ReviewContextService,
} from './ReviewContextService';
import {
  PrepareProjectContextInput,
  ProjectInsightResult,
  ProjectInsightService,
} from './ProjectInsightService';
import { ChangeCampaignResult, ChangeCampaignService } from './ChangeCampaignService';

export type RoutedTaskKind =
  | 'bugfix'
  | 'feature'
  | 'refactor'
  | 'review'
  | 'architecture'
  | 'security'
  | 'stabilization'
  | 'explore';

export interface PrepareTaskContextInput extends PrepareProjectContextInput {
  userRequest: string;
  depth?: number;
}

export interface TaskIntentInference {
  taskKind: RoutedTaskKind;
  confidence: 'high' | 'medium' | 'low';
  reasoning: string[];
  extractedKeywords: string[];
}

export interface TaskRoutePlan {
  initialTool: 'prepare_task_context';
  selectedCompositeTool:
    | 'prepare_project_context'
    | 'prepare_change_context'
    | 'prepare_change_campaign'
    | 'prepare_review_context';
  rationale: string;
  shouldInspectCodeImmediately: boolean;
  fallbackTools: string[];
}

export interface TaskContextResult {
  graphSummary: ProjectInsightResult['graphSummary'];
  userRequest: string;
  inferredIntent: TaskIntentInference;
  projectContext: ProjectInsightResult;
  focus: {
    candidateQueries: string[];
    targetCandidates: GraphNode[];
  };
  route: TaskRoutePlan;
  selectedContext:
    | { kind: 'campaign'; context: ChangeCampaignResult }
    | { kind: 'change'; context: ChangeContextResult }
    | { kind: 'review'; context: ReviewContextResult }
    | null;
  nextSteps: string[];
}

const MAX_KEYWORDS = 8;
const MAX_CANDIDATES = 6;
const STOP_WORDS = new Set([
  'и',
  'или',
  'но',
  'а',
  'не',
  'да',
  'как',
  'что',
  'это',
  'так',
  'для',
  'при',
  'про',
  'без',
  'если',
  'когда',
  'где',
  'почему',
  'надо',
  'нужно',
  'чтобы',
  'какой',
  'какая',
  'какие',
  'какого',
  'меня',
  'мой',
  'моя',
  'мои',
  'твой',
  'твоя',
  'его',
  'ее',
  'их',
  'наш',
  'ваш',
  'там',
  'тут',
  'очень',
  'просто',
  'после',
  'почему-то',
  'сломалось',
  'ломается',
  'ошибка',
  'проблема',
  'изменений',
  'проведи',
  'скажи',
  'найди',
  'причину',
  'где',
  'риски',
  'before',
  'after',
  'with',
  'from',
  'that',
  'this',
  'user',
  'users',
  'the',
  'and',
  'for',
  'why',
  'how',
  'when',
  'where',
  'not',
  'into',
]);

const BUGFIX_HINTS = [
  'ломается',
  'сломалось',
  'не работает',
  'ошибка',
  'баг',
  'crash',
  'broken',
  'fails',
  'failing',
  'issue',
  'problem',
  'debug',
];
const FEATURE_HINTS = [
  'добавь',
  'добавить',
  'реализуй',
  'реализовать',
  'поддержку',
  'support',
  'implement',
  'feature',
];
const REFACTOR_HINTS = [
  'рефактор',
  'refactor',
  'упрости',
  'почисти',
  'перестрой',
  'restructure',
  'cleanup',
  'переведи',
  'замени',
  'обнови',
  'миграц',
  'migration',
  'switch',
  'upgrade',
  'replace',
];
const REVIEW_HINTS = ['ревью', 'review', 'проверь', 'audit', 'аудит', 'оцени'];
const ARCHITECTURE_HINTS = ['архитектур', 'слой', 'границ', 'solid', 'dependency', 'design'];
const SECURITY_HINTS = [
  'security',
  'безопас',
  'xss',
  'csrf',
  'sql',
  'token',
  'cookie',
  'auth',
  'авторизац',
  'аутентификац',
];
const STABILIZATION_HINTS = [
  'нестабиль',
  'flaky',
  'memory leak',
  'утечк',
  'медленно',
  'slow',
  'performance',
  'hang',
  'зависает',
];
const DI_RUNTIME_HINTS = [
  'dependency injection',
  'di ',
  ' di',
  'inject',
  'injection',
  'provider',
  'binding',
  'bean',
  'registration',
  'container',
  'ioc',
  'wiring',
  'runtime contract',
  'внедрен',
  'инжект',
  'провайдер',
  'бин',
  'регистрац',
  'контракт',
];
const OPERATIONAL_REFRESH_HINTS = [
  'watcher',
  'refresh',
  'reindex',
  'incremental',
  'batch',
  'batching',
  'coalesc',
  'latency',
  'debounce',
  'stale graph',
  'graph update',
  'pipeline',
  'watch',
  'индексац',
  'обновлен',
  'обновля',
  'батч',
  'задержк',
  'латент',
  'пайплайн',
];
const CAMPAIGN_HINTS = [
  'все',
  'all',
  'массов',
  'миграц',
  'migration',
  'переведи',
  'замени',
  'replace',
  'switch',
  'upgrade',
  'across',
  'по всему',
  'повсюду',
  'несколько',
  'много',
  'сервисы',
  'service',
  'library',
  'библиотек',
];

const toStructuralNodeId = (nodeId: string) => nodeId.split('#')[0];

export class TaskIntelligenceService {
  constructor(
    private readonly projectInsightService = new ProjectInsightService(),
    private readonly changeContextService = new ChangeContextService(),
    private readonly reviewContextService = new ReviewContextService(),
    private readonly changeCampaignService = new ChangeCampaignService()
  ) {}

  async prepareContext(
    graph: GraphData,
    input: PrepareTaskContextInput
  ): Promise<TaskContextResult> {
    const inferredIntent = this.inferIntent(input.userRequest);
    const candidateQueries = this.extractCandidateQueries(input.userRequest);
    const projectContext = await this.projectInsightService.prepareContext(graph, input);
    const targetCandidates = this.findTargetCandidates(
      graph,
      candidateQueries,
      projectContext,
      input.userRequest
    );
    const selectedContext = await this.prepareSelectedContext(
      graph,
      inferredIntent,
      targetCandidates,
      candidateQueries,
      input,
      projectContext
    );
    const route = this.buildRoute(inferredIntent, targetCandidates, selectedContext, projectContext);

    return {
      graphSummary: projectContext.graphSummary,
      userRequest: input.userRequest,
      inferredIntent,
      projectContext,
      focus: {
        candidateQueries,
        targetCandidates,
      },
      route,
      selectedContext,
      nextSteps: this.buildNextSteps(inferredIntent, route, targetCandidates, selectedContext),
    };
  }

  private async prepareSelectedContext(
    graph: GraphData,
    inferredIntent: TaskIntentInference,
    targetCandidates: GraphNode[],
    candidateQueries: string[],
    input: PrepareTaskContextInput,
    projectContext: ProjectInsightResult
  ): Promise<TaskContextResult['selectedContext']> {
    if (
      this.shouldUseCampaignContext(
        input.userRequest,
        inferredIntent,
        targetCandidates,
        projectContext
      )
    ) {
      const context = await this.changeCampaignService.prepareContext(graph, {
        userRequest: input.userRequest,
        candidateQueries,
        seedNodeIds: targetCandidates.map((node) => node.id),
        taskMode: this.toChangeTaskMode(inferredIntent.taskKind),
        depth: input.depth,
        maxSeeds: Math.max(targetCandidates.length, 6),
        maxFiles: 30,
        includeSecurityFindings: input.includeSecurityFindings,
      });
      return { kind: 'campaign', context };
    }

    if (this.isChangeIntent(inferredIntent.taskKind) && targetCandidates.length > 0) {
      const context = await this.changeContextService.prepareChangeContext(graph, {
        target: targetCandidates[0].id,
        taskMode: this.toChangeTaskMode(inferredIntent.taskKind),
        changeIntent: input.userRequest,
        depth: input.depth,
        includeSecurityFindings: input.includeSecurityFindings,
      });
      return { kind: 'change', context };
    }

    if (this.isReviewIntent(inferredIntent.taskKind) || candidateQueries.length > 0) {
      const focusQuery = targetCandidates[0]?.label || candidateQueries[0];
      const context = await this.reviewContextService.prepareReviewContext(graph, {
        focusQuery,
        taskMode: this.toReviewTaskMode(inferredIntent.taskKind),
        limit: input.limit,
        includeSecurityFindings: input.includeSecurityFindings,
        includeClassifications: input.includeClassifications,
      });
      return { kind: 'review', context };
    }

    return null;
  }

  private buildRoute(
    inferredIntent: TaskIntentInference,
    targetCandidates: GraphNode[],
    selectedContext: TaskContextResult['selectedContext'],
    projectContext: ProjectInsightResult
  ): TaskRoutePlan {
    if (selectedContext?.kind === 'campaign') {
      return {
        initialTool: 'prepare_task_context',
        selectedCompositeTool: 'prepare_change_campaign',
        rationale:
          selectedContext.context.scope.runtimeCompositionRoots.length > 0
            ? 'The request affects runtime wiring and multiple composition roots, so the agent needs a campaign-level plan instead of a single-target edit.'
            : 'The request looks like a massive migration or major refactor, so the agent needs a campaign-level plan, not a single-target change context.',
        shouldInspectCodeImmediately: true,
        fallbackTools: ['search_graph', 'get_node_dependencies', 'get_blast_radius'],
      };
    }

    if (selectedContext?.kind === 'change') {
      return {
        initialTool: 'prepare_task_context',
        selectedCompositeTool: 'prepare_change_context',
        rationale:
          selectedContext.context.dependencies.runtimeContractLinks.length > 0
            ? 'The request maps to a specific code target that also participates in runtime DI wiring, so a focused change context is the safest starting point.'
            : selectedContext.context.dependencies.contractBindingLinks.length > 0
              ? 'The request maps to a specific code target that also participates in API contract/runtime bindings, so a focused change context is the safest starting point.'
            : 'The request looks like a modification or bugfix, and CodeMaps successfully linked it to a specific code target.',
        shouldInspectCodeImmediately: true,
        fallbackTools: ['get_node_dependencies', 'get_blast_radius', 'search_graph'],
      };
    }

    if (selectedContext?.kind === 'review') {
      return {
        initialTool: 'prepare_task_context',
        selectedCompositeTool: 'prepare_review_context',
        rationale:
          this.hasOperationalRefreshSignals(inferredIntent.extractedKeywords.join(' ')) &&
          (projectContext.operationalTelemetry.watcher.flushCount > 0 ||
            projectContext.operationalTelemetry.enrichment.runtimePriorityRebuilds > 0)
            ? 'The request targets incremental refresh behavior, so the agent should start with a review-style context focused on watcher batching, refresh latency, and rebuild hotspots.'
            : targetCandidates.length > 0
              ? 'The request requires diagnostics/audit, so it is more useful for the agent to start with a review-style context on the found focus area.'
              : 'The request could not be strictly linked to a single code target yet, so it is safer to start with a review-style context.',
        shouldInspectCodeImmediately: targetCandidates.length > 0,
        fallbackTools: ['search_graph', 'get_architecture_overview', 'detect_patterns'],
      };
    }

    return {
      initialTool: 'prepare_task_context',
      selectedCompositeTool: 'prepare_project_context',
      rationale:
        projectContext.mentalModel.runtimeCompositionRoots.length > 0 &&
        this.hasDiRuntimeSignals(inferredIntent.extractedKeywords.join(' '))
          ? 'The request mentions runtime wiring, but the scope is still too vague, so the agent should first load the broader project model and composition roots.'
          : this.hasOperationalRefreshSignals(inferredIntent.extractedKeywords.join(' ')) &&
              projectContext.operationalTelemetry.watcher.flushCount > 0
            ? 'The request points to refresh/incremental behavior, but the target area is still vague, so the agent should start with the broader project model and operational telemetry.'
          : 'The request is too general or not sufficiently tied to a code area, so the agent needs to start with a general mental model of the project.',
      shouldInspectCodeImmediately: false,
      fallbackTools: ['prepare_review_context', 'search_graph', 'get_graph_context'],
    };
  }

  private buildNextSteps(
    inferredIntent: TaskIntentInference,
    route: TaskRoutePlan,
    targetCandidates: GraphNode[],
    selectedContext: TaskContextResult['selectedContext']
  ) {
    const nextSteps = [
      `The agent has understood the intent as "${inferredIntent.taskKind}" and selected the primary composite tool "${route.selectedCompositeTool}".`,
    ];

    if (targetCandidates.length > 0) {
      nextSteps.push(`First target candidate: ${targetCandidates[0].id}.`);
    } else {
      nextSteps.push(
        'No clear code target found yet; use focus candidates and project mental model to refine the scope.'
      );
    }

    if (selectedContext?.kind === 'change') {
      nextSteps.push(
        'Next, the agent should read change-context risks, blast radius, and recommendedFilesToInspect before editing.'
      );
      if (selectedContext.context.decompositionCandidates.length > 0) {
        nextSteps.push(
          `Because the target already has decomposition candidates, prefer starting with ${selectedContext.context.decompositionCandidates[0].targetLabel} as the first extraction seam.`
        );
      }
      if (selectedContext.context.dependencies.runtimeContractLinks.length > 0) {
        nextSteps.push(
          'Because the target touches runtime DI wiring, the agent should verify composition roots and concrete registrations before modifying contracts.'
        );
      }
      if (selectedContext.context.dependencies.contractBindingLinks.length > 0) {
        nextSteps.push(
          'Because the target touches API contract/runtime bindings, the agent should verify schema roots, generated modules, and bound handlers/clients before editing the implementation.'
        );
      }
    } else if (selectedContext?.kind === 'campaign') {
      nextSteps.push(
        'Next, the agent should read execution waves, affected files, and campaign risks, then perform the migration in phases.'
      );
      nextSteps.push(
        'Review refactoring waves as the architectural cleanup track for the campaign, even if only a subset of files currently has ranked extraction candidates.'
      );
      if (selectedContext.context.scope.runtimeCompositionRoots.length > 0) {
        nextSteps.push(
          'Campaign scope includes runtime composition roots, so migration should start from DI wiring and only then move to dependent files.'
        );
      }
      if (selectedContext.context.executionPlan.refactoringWaves.length > 0) {
        nextSteps.push(
          `Campaign already includes refactoring waves; start with ${selectedContext.context.executionPlan.refactoringWaves[0].title} before broader rollout.`
        );
      }
      if (selectedContext.context.qualityDashboard.gates.some((gate) => gate.status === 'block')) {
        nextSteps.push(
          'Quality dashboard contains blocking gates, so campaign execution should stay in stabilization/refactoring mode until those gates are cleared.'
        );
      }
    } else if (selectedContext?.kind === 'review') {
      nextSteps.push(
        'Next, the agent should read review priorities, patterns, and architecture summary before diving deep into the code.'
      );
      if (
        this.hasOperationalRefreshSignals(route.rationale.toLowerCase()) ||
        selectedContext.context.reviewPriorities.some(
          (priority) => priority.title === 'Incremental Refresh Pipeline'
        )
      ) {
        nextSteps.push(
          'Because the focus includes incremental refresh behavior, the agent should inspect watcher batching, skipped refreshes, and runtime-priority rebuild latency before editing pipeline code.'
        );
      }
      if (
        selectedContext.context.reviewPriorities.some(
          (priority) => priority.title === 'Design Smells' || priority.title === 'Maintainability Budget'
        )
      ) {
        nextSteps.push(
          'Because the focus includes maintainability debt, the agent should prefer extraction boundaries and class/method decomposition over additive edits in already overloaded modules.'
        );
      }
      if (selectedContext.context.decompositionGuidance.candidates.length > 0) {
        nextSteps.push(
          `Use the review decomposition guidance as a ranked extraction queue; current top candidate: ${selectedContext.context.decompositionGuidance.candidates[0].targetLabel}.`
        );
      }
      if (selectedContext.context.qualityDashboard.gates.some((gate) => gate.status === 'block')) {
        nextSteps.push(
          'Because quality dashboard gates are blocking, the review should treat growth in hotspot areas as disallowed until the first remediation wave is complete.'
        );
      }
    } else {
      nextSteps.push(
        'Next, the agent should select a focusQuery from candidateQueries and then dive into the review/change context.'
      );
    }

    return nextSteps;
  }

  private inferIntent(userRequest: string): TaskIntentInference {
    const normalized = userRequest.trim().toLowerCase();
    const extractedKeywords = this.extractCandidateQueries(userRequest);
    const reasoning: string[] = [];

    const has = (hints: string[]) => hints.some((hint) => normalized.includes(hint));

    if (has(BUGFIX_HINTS)) {
      reasoning.push('Bugfix/incident signals detected.');
      if (has(SECURITY_HINTS) && !normalized.includes('ломает')) {
        reasoning.push('Security signals found in the request.');
        return { taskKind: 'security', confidence: 'medium', reasoning, extractedKeywords };
      }
      return { taskKind: 'bugfix', confidence: 'high', reasoning, extractedKeywords };
    }

    if (
      has(CAMPAIGN_HINTS) &&
      (has(REFACTOR_HINTS) ||
        has(FEATURE_HINTS) ||
        normalized.includes('нов') ||
        normalized.includes('библиотек'))
    ) {
      reasoning.push('Signals of massive migration or broad refactor change detected.');
      return { taskKind: 'refactor', confidence: 'high', reasoning, extractedKeywords };
    }

    if (has(REFACTOR_HINTS)) {
      reasoning.push('Refactoring signals detected.');
      return { taskKind: 'refactor', confidence: 'high', reasoning, extractedKeywords };
    }

    if (has(FEATURE_HINTS)) {
      reasoning.push('Feature request signals detected.');
      return { taskKind: 'feature', confidence: 'high', reasoning, extractedKeywords };
    }

    if (has(SECURITY_HINTS)) {
      reasoning.push('Security task signals detected.');
      return { taskKind: 'security', confidence: 'medium', reasoning, extractedKeywords };
    }

    if (has(ARCHITECTURE_HINTS)) {
      reasoning.push('Architecture analysis signals detected.');
      return { taskKind: 'architecture', confidence: 'medium', reasoning, extractedKeywords };
    }

    if (has(REVIEW_HINTS)) {
      reasoning.push('Review/audit task signals detected.');
      return { taskKind: 'review', confidence: 'medium', reasoning, extractedKeywords };
    }

    if (has(STABILIZATION_HINTS)) {
      reasoning.push('Stabilization/degradation signals detected.');
      return { taskKind: 'stabilization', confidence: 'medium', reasoning, extractedKeywords };
    }

    reasoning.push('No explicit task intent extracted, explore path selected.');
    return { taskKind: 'explore', confidence: 'low', reasoning, extractedKeywords };
  }

  private extractCandidateQueries(userRequest: string) {
    const normalized = userRequest.toLowerCase();
    const quoted = Array.from(normalized.matchAll(/["'`](.+?)["'`]/gu), (match) => match[1].trim());
    const fileLike = Array.from(
      normalized.matchAll(/[\p{L}\p{N}_./-]+\.(?:ts|tsx|js|jsx|json|css|md|cs|java|kt)/gu),
      (match) => match[0]
    );
    const tokens = Array.from(
      normalized.matchAll(/[\p{L}\p{N}_-]{3,}/gu),
      (match) => match[0]
    ).filter((token) => !STOP_WORDS.has(token));

    const expanded = new Set<string>([...quoted, ...fileLike, ...tokens]);
    if (normalized.includes('авторизац') || normalized.includes('auth')) {
      ['auth', 'authentication', 'login', 'token', 'cookie', 'session'].forEach((term) =>
        expanded.add(term)
      );
    }
    if (normalized.includes('логин')) {
      ['login', 'auth', 'session'].forEach((term) => expanded.add(term));
    }
    if (this.hasDiRuntimeSignals(normalized)) {
      ['program', 'module', 'provider', 'binding', 'bean', 'registration', 'inject', 'wiring'].forEach(
        (term) => expanded.add(term)
      );
    }
    if (this.hasOperationalRefreshSignals(normalized)) {
      [
        'filewatcher',
        'stackgraphenrichmentservice',
        'graphrepository',
        'projectindexer',
        'refresh',
        'watcher',
        'incremental',
        'latency',
        'batching',
      ].forEach((term) => expanded.add(term));
    }

    return Array.from(expanded).filter(Boolean).slice(0, MAX_KEYWORDS);
  }

  private findTargetCandidates(
    graph: GraphData,
    candidateQueries: string[],
    projectContext: ProjectInsightResult,
    userRequest: string
  ) {
    const scored = new Map<string, { node: GraphNode; score: number }>();
    const runtimeRootIds = new Set(
      projectContext.mentalModel.runtimeCompositionRoots.map((node) => toStructuralNodeId(node.id))
    );
    const hasDiRuntimeSignals = this.hasDiRuntimeSignals(userRequest.toLowerCase());
    const hasOperationalRefreshSignals = this.hasOperationalRefreshSignals(userRequest.toLowerCase());

    for (const query of candidateQueries) {
      for (const node of graph.nodes) {
        let score = this.scoreNodeMatch(node, query);
        if (hasDiRuntimeSignals && runtimeRootIds.has(toStructuralNodeId(node.id))) {
          score += 120;
        }
        if (
          hasOperationalRefreshSignals &&
          /(filewatcher|stackgraphenrichmentservice|graphrepository|projectindexer|cachemanager)/i.test(
            node.id
          )
        ) {
          score += 140;
        }
        if (score <= 0) {
          continue;
        }

        const current = scored.get(node.id);
        if (!current || score > current.score) {
          scored.set(node.id, { node, score });
        }
      }
    }

    return Array.from(scored.values())
      .sort(
        (a, b) =>
          b.score - a.score ||
          this.getNodeTypePriority(b.node.type) - this.getNodeTypePriority(a.node.type) ||
          a.node.label.localeCompare(b.node.label)
      )
      .slice(0, MAX_CANDIDATES)
      .map(({ node }) => node);
  }

  private isChangeIntent(taskKind: RoutedTaskKind) {
    return taskKind === 'bugfix' || taskKind === 'feature' || taskKind === 'refactor';
  }

  private shouldUseCampaignContext(
    userRequest: string,
    inferredIntent: TaskIntentInference,
    targetCandidates: GraphNode[],
    projectContext: ProjectInsightResult
  ) {
    const normalized = userRequest.toLowerCase();
    const hasCampaignHints = CAMPAIGN_HINTS.some((hint) => normalized.includes(hint));
    const hasDiRuntimeSignals = this.hasDiRuntimeSignals(normalized);
    const hasExplicitFileMention =
      /[\p{L}\p{N}_./-]+\.(?:ts|tsx|js|jsx|json|css|md|cs|java|kt)/u.test(normalized);
    const hasBroadRuntimeScope =
      /(services|providers|registrations|bindings|contracts|modules|сервисы|провайдер|регистрац|контракт|модули)/u.test(
        normalized
      );

    if (
      hasExplicitFileMention &&
      targetCandidates.length > 0 &&
      targetCandidates[0].type === 'file' &&
      !hasBroadRuntimeScope
    ) {
      return false;
    }

    if (
      hasCampaignHints &&
      (this.isChangeIntent(inferredIntent.taskKind) || inferredIntent.taskKind === 'explore')
    ) {
      return true;
    }

    if (!this.isChangeIntent(inferredIntent.taskKind)) {
      return false;
    }

    if (
      hasDiRuntimeSignals &&
      projectContext.mentalModel.runtimeCompositionRoots.length > 0 &&
      (hasBroadRuntimeScope || targetCandidates.length >= 2)
    ) {
      return true;
    }

    return inferredIntent.taskKind === 'refactor' && targetCandidates.length >= 3;
  }

  private hasDiRuntimeSignals(text: string) {
    return DI_RUNTIME_HINTS.some((hint) => text.includes(hint));
  }

  private hasOperationalRefreshSignals(text: string) {
    return OPERATIONAL_REFRESH_HINTS.some((hint) => text.includes(hint));
  }

  private isReviewIntent(taskKind: RoutedTaskKind) {
    return (
      taskKind === 'review' ||
      taskKind === 'architecture' ||
      taskKind === 'security' ||
      taskKind === 'stabilization' ||
      taskKind === 'explore'
    );
  }

  private toChangeTaskMode(taskKind: RoutedTaskKind): ChangeTaskMode {
    switch (taskKind) {
      case 'feature':
        return 'feature';
      case 'refactor':
        return 'refactor';
      case 'explore':
        return 'explore';
      case 'bugfix':
      case 'security':
      case 'review':
      case 'architecture':
      case 'stabilization':
      default:
        return 'bugfix';
    }
  }

  private toReviewTaskMode(taskKind: RoutedTaskKind): ReviewTaskMode {
    switch (taskKind) {
      case 'architecture':
        return 'architecture';
      case 'security':
        return 'security';
      case 'stabilization':
      case 'bugfix':
        return 'stabilization';
      case 'review':
      case 'feature':
      case 'refactor':
      case 'explore':
      default:
        return 'review';
    }
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
    let textScore = 0;

    if (normalizedLabel === normalizedQuery) textScore += 160;
    if (basename === normalizedQuery) textScore += node.type === 'file' ? 180 : 90;
    if (basenameWithoutExtension === normalizedQuery) textScore += node.type === 'file' ? 220 : 100;
    if (normalizedLabel.startsWith(normalizedQuery)) textScore += 90;
    if (basename.startsWith(normalizedQuery)) textScore += node.type === 'file' ? 100 : 50;
    if (basenameWithoutExtension.startsWith(normalizedQuery))
      textScore += node.type === 'file' ? 120 : 60;
    if (normalizedLabel.includes(normalizedQuery)) textScore += 40;
    if (normalizedId.includes(normalizedQuery)) textScore += node.type === 'file' ? 35 : 20;

    if (textScore === 0) {
      return 0;
    }

    return textScore + this.getNodeTypePriority(node.type) * 10;
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
}
