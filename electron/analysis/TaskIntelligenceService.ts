import { GraphData, GraphNode } from '../store';
import {
  AgentContextService,
  ChangeContextResult,
  ChangeTaskMode,
  ReviewContextResult,
  ReviewTaskMode,
} from './AgentContextService';
import {
  PrepareProjectContextInput,
  ProjectInsightResult,
  ProjectInsightService,
} from './ProjectInsightService';
import {
  ChangeCampaignResult,
  ChangeCampaignService,
} from './ChangeCampaignService';

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
  selectedCompositeTool: 'prepare_project_context' | 'prepare_change_context' | 'prepare_change_campaign' | 'prepare_review_context';
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
  'и', 'или', 'но', 'а', 'не', 'да', 'как', 'что', 'это', 'так', 'для', 'при', 'про', 'без',
  'если', 'когда', 'где', 'почему', 'надо', 'нужно', 'чтобы', 'какой', 'какая', 'какие', 'какого',
  'меня', 'мой', 'моя', 'мои', 'твой', 'твоя', 'его', 'ее', 'их', 'наш', 'ваш', 'там', 'тут',
  'очень', 'просто', 'после', 'почему-то', 'сломалось', 'ломается', 'ошибка', 'проблема', 'изменений',
  'проведи', 'скажи', 'найди', 'причину', 'где', 'риски', 'before', 'after', 'with', 'from', 'that', 'this', 'user', 'users',
  'the', 'and', 'for', 'why', 'how', 'when', 'where', 'not', 'into',
]);

const BUGFIX_HINTS = ['ломается', 'сломалось', 'не работает', 'ошибка', 'баг', 'crash', 'broken', 'fails', 'failing', 'issue', 'problem', 'debug'];
const FEATURE_HINTS = ['добавь', 'добавить', 'реализуй', 'реализовать', 'поддержку', 'support', 'implement', 'feature'];
const REFACTOR_HINTS = ['рефактор', 'refactor', 'упрости', 'почисти', 'перестрой', 'restructure', 'cleanup', 'переведи', 'замени', 'обнови', 'миграц', 'migration', 'switch', 'upgrade', 'replace'];
const REVIEW_HINTS = ['ревью', 'review', 'проверь', 'audit', 'аудит', 'оцени'];
const ARCHITECTURE_HINTS = ['архитектур', 'слой', 'границ', 'solid', 'dependency', 'design'];
const SECURITY_HINTS = ['security', 'безопас', 'xss', 'csrf', 'sql', 'token', 'cookie', 'auth', 'авторизац', 'аутентификац'];
const STABILIZATION_HINTS = ['нестабиль', 'flaky', 'memory leak', 'утечк', 'медленно', 'slow', 'performance', 'hang', 'зависает'];
const CAMPAIGN_HINTS = ['все', 'all', 'массов', 'миграц', 'migration', 'переведи', 'замени', 'replace', 'switch', 'upgrade', 'across', 'по всему', 'повсюду', 'несколько', 'много', 'сервисы', 'service', 'library', 'библиотек'];

const toStructuralNodeId = (nodeId: string) => nodeId.split('#')[0];

export class TaskIntelligenceService {
  constructor(
    private readonly projectInsightService = new ProjectInsightService(),
    private readonly agentContextService = new AgentContextService(),
    private readonly changeCampaignService = new ChangeCampaignService(),
  ) {}

  async prepareContext(graph: GraphData, input: PrepareTaskContextInput): Promise<TaskContextResult> {
    const inferredIntent = this.inferIntent(input.userRequest);
    const candidateQueries = this.extractCandidateQueries(input.userRequest);
    const targetCandidates = this.findTargetCandidates(graph, candidateQueries);
    const projectContext = await this.projectInsightService.prepareContext(graph, input);
    const selectedContext = await this.prepareSelectedContext(graph, inferredIntent, targetCandidates, candidateQueries, input);
    const route = this.buildRoute(inferredIntent, targetCandidates, selectedContext);

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
  ): Promise<TaskContextResult['selectedContext']> {
    if (this.shouldUseCampaignContext(input.userRequest, inferredIntent, targetCandidates)) {
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
      const context = await this.agentContextService.prepareChangeContext(graph, {
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
      const context = await this.agentContextService.prepareReviewContext(graph, {
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
  ): TaskRoutePlan {
    if (selectedContext?.kind === 'campaign') {
      return {
        initialTool: 'prepare_task_context',
        selectedCompositeTool: 'prepare_change_campaign',
        rationale: 'Запрос выглядит как массовая миграция или крупный refactor, поэтому агенту нужен campaign-level план, а не single-target change context.',
        shouldInspectCodeImmediately: true,
        fallbackTools: ['search_graph', 'get_node_dependencies', 'get_blast_radius'],
      };
    }

    if (selectedContext?.kind === 'change') {
      return {
        initialTool: 'prepare_task_context',
        selectedCompositeTool: 'prepare_change_context',
        rationale: 'Запрос похож на изменение или bugfix, и CodeMaps смог привязать его к конкретной кодовой цели.',
        shouldInspectCodeImmediately: true,
        fallbackTools: ['get_node_dependencies', 'get_blast_radius', 'search_graph'],
      };
    }

    if (selectedContext?.kind === 'review') {
      return {
        initialTool: 'prepare_task_context',
        selectedCompositeTool: 'prepare_review_context',
        rationale: targetCandidates.length > 0
          ? 'Запрос требует диагностики/аудита, поэтому агенту полезнее начать с review-style контекста по найденной focus-области.'
          : 'Запрос пока не удалось жёстко привязать к одной кодовой цели, поэтому безопаснее начать с review-style контекста.',
        shouldInspectCodeImmediately: targetCandidates.length > 0,
        fallbackTools: ['search_graph', 'get_architecture_overview', 'detect_patterns'],
      };
    }

    return {
      initialTool: 'prepare_task_context',
      selectedCompositeTool: 'prepare_project_context',
      rationale: 'Запрос слишком общий или недостаточно привязан к кодовой области, поэтому агенту нужно начать с общей ментальной модели проекта.',
      shouldInspectCodeImmediately: false,
      fallbackTools: ['prepare_review_context', 'search_graph', 'get_graph_context'],
    };
  }

  private buildNextSteps(
    inferredIntent: TaskIntentInference,
    route: TaskRoutePlan,
    targetCandidates: GraphNode[],
    selectedContext: TaskContextResult['selectedContext'],
  ) {
    const nextSteps = [
      `Агент уже понял intent как "${inferredIntent.taskKind}" и выбрал основной composite tool "${route.selectedCompositeTool}".`,
    ];

    if (targetCandidates.length > 0) {
      nextSteps.push(`Первый кандидат цели: ${targetCandidates[0].id}.`);
    } else {
      nextSteps.push('Явная кодовая цель пока не найдена; стоит использовать focus-кандидаты и проектную ментальную модель для уточнения области.');
    }

    if (selectedContext?.kind === 'change') {
      nextSteps.push('Дальше агенту стоит читать change-context risks, blast radius и recommendedFilesToInspect перед правкой.');
    } else if (selectedContext?.kind === 'campaign') {
      nextSteps.push('Дальше агенту стоит читать execution waves, affected files и campaign risks, а затем выполнять миграцию фазами.');
    } else if (selectedContext?.kind === 'review') {
      nextSteps.push('Дальше агенту стоит читать review priorities, patterns и architecture summary перед углублением в код.');
    } else {
      nextSteps.push('Дальше агенту стоит выбрать focusQuery из candidateQueries и затем углубиться в review/change context.');
    }

    return nextSteps;
  }

  private inferIntent(userRequest: string): TaskIntentInference {
    const normalized = userRequest.trim().toLowerCase();
    const extractedKeywords = this.extractCandidateQueries(userRequest);
    const reasoning: string[] = [];

    const has = (hints: string[]) => hints.some((hint) => normalized.includes(hint));

    if (has(BUGFIX_HINTS)) {
      reasoning.push('Обнаружены сигналы bugfix/incident.');
      if (has(SECURITY_HINTS) && !normalized.includes('ломает')) {
        reasoning.push('В запросе есть security-сигналы.');
        return { taskKind: 'security', confidence: 'medium', reasoning, extractedKeywords };
      }
      return { taskKind: 'bugfix', confidence: 'high', reasoning, extractedKeywords };
    }

    if (has(CAMPAIGN_HINTS) && (has(REFACTOR_HINTS) || has(FEATURE_HINTS) || normalized.includes('нов') || normalized.includes('библиотек'))) {
      reasoning.push('Обнаружены сигналы массовой миграции или широкого refactor-изменения.');
      return { taskKind: 'refactor', confidence: 'high', reasoning, extractedKeywords };
    }

    if (has(REFACTOR_HINTS)) {
      reasoning.push('Обнаружены сигналы рефакторинга.');
      return { taskKind: 'refactor', confidence: 'high', reasoning, extractedKeywords };
    }

    if (has(FEATURE_HINTS)) {
      reasoning.push('Обнаружены сигналы feature request.');
      return { taskKind: 'feature', confidence: 'high', reasoning, extractedKeywords };
    }

    if (has(SECURITY_HINTS)) {
      reasoning.push('Обнаружены сигналы security-задачи.');
      return { taskKind: 'security', confidence: 'medium', reasoning, extractedKeywords };
    }

    if (has(ARCHITECTURE_HINTS)) {
      reasoning.push('Обнаружены сигналы архитектурного анализа.');
      return { taskKind: 'architecture', confidence: 'medium', reasoning, extractedKeywords };
    }

    if (has(REVIEW_HINTS)) {
      reasoning.push('Обнаружены сигналы review/audit-задачи.');
      return { taskKind: 'review', confidence: 'medium', reasoning, extractedKeywords };
    }

    if (has(STABILIZATION_HINTS)) {
      reasoning.push('Обнаружены сигналы стабилизации/деградации.');
      return { taskKind: 'stabilization', confidence: 'medium', reasoning, extractedKeywords };
    }

    reasoning.push('Явный task intent не извлечён, выбран explore-путь.');
    return { taskKind: 'explore', confidence: 'low', reasoning, extractedKeywords };
  }

  private extractCandidateQueries(userRequest: string) {
    const normalized = userRequest.toLowerCase();
    const quoted = Array.from(normalized.matchAll(/["'`](.+?)["'`]/gu), (match) => match[1].trim());
    const fileLike = Array.from(normalized.matchAll(/[\p{L}\p{N}_./-]+\.(?:ts|tsx|js|jsx|json|css|md)/gu), (match) => match[0]);
    const tokens = Array.from(normalized.matchAll(/[\p{L}\p{N}_-]{3,}/gu), (match) => match[0])
      .filter((token) => !STOP_WORDS.has(token));

    const expanded = new Set<string>([...quoted, ...fileLike, ...tokens]);
    if (normalized.includes('авторизац') || normalized.includes('auth')) {
      ['auth', 'authentication', 'login', 'token', 'cookie', 'session'].forEach((term) => expanded.add(term));
    }
    if (normalized.includes('логин')) {
      ['login', 'auth', 'session'].forEach((term) => expanded.add(term));
    }

    return Array.from(expanded).filter(Boolean).slice(0, MAX_KEYWORDS);
  }

  private findTargetCandidates(graph: GraphData, candidateQueries: string[]) {
    const scored = new Map<string, { node: GraphNode; score: number }>();

    for (const query of candidateQueries) {
      for (const node of graph.nodes) {
        const score = this.scoreNodeMatch(node, query);
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
      .sort((a, b) =>
        b.score - a.score
        || this.getNodeTypePriority(b.node.type) - this.getNodeTypePriority(a.node.type)
        || a.node.label.localeCompare(b.node.label)
      )
      .slice(0, MAX_CANDIDATES)
      .map(({ node }) => node);
  }

  private isChangeIntent(taskKind: RoutedTaskKind) {
    return taskKind === 'bugfix' || taskKind === 'feature' || taskKind === 'refactor';
  }

  private shouldUseCampaignContext(userRequest: string, inferredIntent: TaskIntentInference, targetCandidates: GraphNode[]) {
    const normalized = userRequest.toLowerCase();
    const hasCampaignHints = CAMPAIGN_HINTS.some((hint) => normalized.includes(hint));

    if (hasCampaignHints && (this.isChangeIntent(inferredIntent.taskKind) || inferredIntent.taskKind === 'explore')) {
      return true;
    }

    if (!this.isChangeIntent(inferredIntent.taskKind)) {
      return false;
    }

    return inferredIntent.taskKind === 'refactor' && targetCandidates.length >= 3;
  }

  private isReviewIntent(taskKind: RoutedTaskKind) {
    return taskKind === 'review'
      || taskKind === 'architecture'
      || taskKind === 'security'
      || taskKind === 'stabilization'
      || taskKind === 'explore';
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
    if (basenameWithoutExtension.startsWith(normalizedQuery)) textScore += node.type === 'file' ? 120 : 60;
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
