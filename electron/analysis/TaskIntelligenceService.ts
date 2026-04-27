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
    const targetCandidates = this.findTargetCandidates(graph, candidateQueries);
    const projectContext = await this.projectInsightService.prepareContext(graph, input);
    const selectedContext = await this.prepareSelectedContext(
      graph,
      inferredIntent,
      targetCandidates,
      candidateQueries,
      input
    );
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
    input: PrepareTaskContextInput
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
    selectedContext: TaskContextResult['selectedContext']
  ): TaskRoutePlan {
    if (selectedContext?.kind === 'campaign') {
      return {
        initialTool: 'prepare_task_context',
        selectedCompositeTool: 'prepare_change_campaign',
        rationale:
          'The request looks like a massive migration or major refactor, so the agent needs a campaign-level plan, not a single-target change context.',
        shouldInspectCodeImmediately: true,
        fallbackTools: ['search_graph', 'get_node_dependencies', 'get_blast_radius'],
      };
    }

    if (selectedContext?.kind === 'change') {
      return {
        initialTool: 'prepare_task_context',
        selectedCompositeTool: 'prepare_change_context',
        rationale:
          'The request looks like a modification or bugfix, and CodeMaps successfully linked it to a specific code target.',
        shouldInspectCodeImmediately: true,
        fallbackTools: ['get_node_dependencies', 'get_blast_radius', 'search_graph'],
      };
    }

    if (selectedContext?.kind === 'review') {
      return {
        initialTool: 'prepare_task_context',
        selectedCompositeTool: 'prepare_review_context',
        rationale:
          targetCandidates.length > 0
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
        'The request is too general or not sufficiently tied to a code area, so the agent needs to start with a general mental model of the project.',
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
    } else if (selectedContext?.kind === 'campaign') {
      nextSteps.push(
        'Next, the agent should read execution waves, affected files, and campaign risks, then perform the migration in phases.'
      );
    } else if (selectedContext?.kind === 'review') {
      nextSteps.push(
        'Next, the agent should read review priorities, patterns, and architecture summary before diving deep into the code.'
      );
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
      normalized.matchAll(/[\p{L}\p{N}_./-]+\.(?:ts|tsx|js|jsx|json|css|md)/gu),
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
    targetCandidates: GraphNode[]
  ) {
    const normalized = userRequest.toLowerCase();
    const hasCampaignHints = CAMPAIGN_HINTS.some((hint) => normalized.includes(hint));

    if (
      hasCampaignHints &&
      (this.isChangeIntent(inferredIntent.taskKind) || inferredIntent.taskKind === 'explore')
    ) {
      return true;
    }

    if (!this.isChangeIntent(inferredIntent.taskKind)) {
      return false;
    }

    return inferredIntent.taskKind === 'refactor' && targetCandidates.length >= 3;
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
