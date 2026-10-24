import { ChangeTaskMode } from './ChangeContextService';
import { ReviewTaskMode } from './ReviewContextService';
import { RoutedTaskKind, TaskIntentInference } from './taskIntelligenceTypes';

const MAX_KEYWORDS = 8;
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
export const DI_RUNTIME_HINTS = [
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
export const OPERATIONAL_REFRESH_HINTS = [
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
export const CAMPAIGN_HINTS = [
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

type IntentRule = {
  hints: string[];
  taskKind: RoutedTaskKind;
  confidence: TaskIntentInference['confidence'];
  reason: string;
};

/** Checked in order once the bugfix and migration special cases did not apply. */
const INTENT_RULES: IntentRule[] = [
  {
    hints: REFACTOR_HINTS,
    taskKind: 'refactor',
    confidence: 'high',
    reason: 'Refactoring signals detected.',
  },
  {
    hints: FEATURE_HINTS,
    taskKind: 'feature',
    confidence: 'high',
    reason: 'Feature request signals detected.',
  },
  {
    hints: SECURITY_HINTS,
    taskKind: 'security',
    confidence: 'medium',
    reason: 'Security task signals detected.',
  },
  {
    hints: ARCHITECTURE_HINTS,
    taskKind: 'architecture',
    confidence: 'medium',
    reason: 'Architecture analysis signals detected.',
  },
  {
    hints: REVIEW_HINTS,
    taskKind: 'review',
    confidence: 'medium',
    reason: 'Review/audit task signals detected.',
  },
  {
    hints: STABILIZATION_HINTS,
    taskKind: 'stabilization',
    confidence: 'medium',
    reason: 'Stabilization/degradation signals detected.',
  },
];

export function inferTaskIntent(userRequest: string): TaskIntentInference {
  const normalized = userRequest.trim().toLowerCase();
  const extractedKeywords = extractCandidateQueries(userRequest);
  const has = (hints: string[]) => hints.some((hint) => normalized.includes(hint));
  const result = (
    taskKind: RoutedTaskKind,
    confidence: TaskIntentInference['confidence'],
    ...reasoning: string[]
  ): TaskIntentInference => ({ taskKind, confidence, reasoning, extractedKeywords });

  if (has(BUGFIX_HINTS)) {
    const isSecurity = has(SECURITY_HINTS) && !normalized.includes('ломает');
    return isSecurity
      ? result(
          'security',
          'medium',
          'Bugfix/incident signals detected.',
          'Security signals found in the request.'
        )
      : result('bugfix', 'high', 'Bugfix/incident signals detected.');
  }

  const isBroadChange =
    has(REFACTOR_HINTS) ||
    has(FEATURE_HINTS) ||
    normalized.includes('нов') ||
    normalized.includes('библиотек');
  if (has(CAMPAIGN_HINTS) && isBroadChange) {
    return result(
      'refactor',
      'high',
      'Signals of massive migration or broad refactor change detected.'
    );
  }

  const rule = INTENT_RULES.find((candidate) => has(candidate.hints));
  if (rule) return result(rule.taskKind, rule.confidence, rule.reason);
  return result('explore', 'low', 'No explicit task intent extracted, explore path selected.');
}

const DI_RUNTIME_TERMS = [
  'program',
  'module',
  'provider',
  'binding',
  'bean',
  'registration',
  'inject',
  'wiring',
];

const OPERATIONAL_REFRESH_TERMS = [
  'filewatcher',
  'stackgraphenrichmentservice',
  'graphrepository',
  'projectindexer',
  'refresh',
  'watcher',
  'incremental',
  'latency',
  'batching',
];

const addTerms = (target: Set<string>, terms: string[]) =>
  terms.forEach((term) => target.add(term));

export function extractCandidateQueries(userRequest: string) {
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
    addTerms(expanded, ['auth', 'authentication', 'login', 'token', 'cookie', 'session']);
  }
  if (normalized.includes('логин')) addTerms(expanded, ['login', 'auth', 'session']);
  if (hasDiRuntimeSignals(normalized)) addTerms(expanded, DI_RUNTIME_TERMS);
  if (hasOperationalRefreshSignals(normalized)) addTerms(expanded, OPERATIONAL_REFRESH_TERMS);

  return Array.from(expanded).filter(Boolean).slice(0, MAX_KEYWORDS);
}

export function hasDiRuntimeSignals(text: string) {
  return DI_RUNTIME_HINTS.some((hint) => text.includes(hint));
}

export function hasOperationalRefreshSignals(text: string) {
  return OPERATIONAL_REFRESH_HINTS.some((hint) => text.includes(hint));
}

export function isChangeIntent(taskKind: RoutedTaskKind) {
  return taskKind === 'bugfix' || taskKind === 'feature' || taskKind === 'refactor';
}

export function isReviewIntent(taskKind: RoutedTaskKind) {
  return (
    taskKind === 'review' ||
    taskKind === 'architecture' ||
    taskKind === 'security' ||
    taskKind === 'stabilization' ||
    taskKind === 'explore'
  );
}

export function toChangeTaskMode(taskKind: RoutedTaskKind): ChangeTaskMode {
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

export function toReviewTaskMode(taskKind: RoutedTaskKind): ReviewTaskMode {
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
