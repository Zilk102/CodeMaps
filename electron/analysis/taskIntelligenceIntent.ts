import { ChangeTaskMode } from './ChangeContextService';
import { ReviewTaskMode } from './ReviewContextService';
import { RoutedTaskKind, TaskIntentInference } from './TaskIntelligenceService';

const MAX_KEYWORDS = 8;
const STOP_WORDS = new Set([
  'и', 'или', 'но', 'а', 'не', 'да', 'как', 'что', 'это', 'так', 'для', 'при', 'про', 'без',
  'если', 'когда', 'где', 'почему', 'надо', 'нужно', 'чтобы', 'какой', 'какая', 'какие',
  'какого', 'меня', 'мой', 'моя', 'мои', 'твой', 'твоя', 'его', 'ее', 'их', 'наш', 'ваш',
  'там', 'тут', 'очень', 'просто', 'после', 'почему-то', 'сломалось', 'ломается', 'ошибка',
  'проблема', 'изменений', 'проведи', 'скажи', 'найди', 'причину', 'где', 'риски', 'before',
  'after', 'with', 'from', 'that', 'this', 'user', 'users', 'the', 'and', 'for', 'why', 'how',
  'when', 'where', 'not', 'into',
]);

const BUGFIX_HINTS = [
  'ломается', 'сломалось', 'не работает', 'ошибка', 'баг', 'crash', 'broken', 'fails',
  'failing', 'issue', 'problem', 'debug',
];
const FEATURE_HINTS = [
  'добавь', 'добавить', 'реализуй', 'реализовать', 'поддержку', 'support', 'implement', 'feature',
];
const REFACTOR_HINTS = [
  'рефактор', 'refactor', 'упрости', 'почисти', 'перестрой', 'restructure', 'cleanup',
  'переведи', 'замени', 'обнови', 'миграц', 'migration', 'switch', 'upgrade', 'replace',
];
const REVIEW_HINTS = ['ревью', 'review', 'проверь', 'audit', 'аудит', 'оцени'];
const ARCHITECTURE_HINTS = ['архитектур', 'слой', 'границ', 'solid', 'dependency', 'design'];
const SECURITY_HINTS = [
  'security', 'безопас', 'xss', 'csrf', 'sql', 'token', 'cookie', 'auth', 'авторизац',
  'аутентификац',
];
const STABILIZATION_HINTS = [
  'нестабиль', 'flaky', 'memory leak', 'утечк', 'медленно', 'slow', 'performance', 'hang',
  'зависает',
];
export const DI_RUNTIME_HINTS = [
  'dependency injection', 'di ', ' di', 'inject', 'injection', 'provider', 'binding', 'bean',
  'registration', 'container', 'ioc', 'wiring', 'runtime contract', 'внедрен', 'инжект',
  'провайдер', 'бин', 'регистрац', 'контракт',
];
export const OPERATIONAL_REFRESH_HINTS = [
  'watcher', 'refresh', 'reindex', 'incremental', 'batch', 'batching', 'coalesc', 'latency',
  'debounce', 'stale graph', 'graph update', 'pipeline', 'watch', 'индексац', 'обновлен',
  'обновля', 'батч', 'задержк', 'латент', 'пайплайн',
];
export const CAMPAIGN_HINTS = [
  'все', 'all', 'массов', 'миграц', 'migration', 'переведи', 'замени', 'replace', 'switch',
  'upgrade', 'across', 'по всему', 'повсюду', 'несколько', 'много', 'сервисы', 'service',
  'library', 'библиотек',
];

export function inferTaskIntent(userRequest: string): TaskIntentInference {
  const normalized = userRequest.trim().toLowerCase();
  const extractedKeywords = extractCandidateQueries(userRequest);
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
    (has(REFACTOR_HINTS) || has(FEATURE_HINTS) || normalized.includes('нов') || normalized.includes('библиотек'))
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

export function extractCandidateQueries(userRequest: string) {
  const normalized = userRequest.toLowerCase();
  const quoted = Array.from(normalized.matchAll(/["'`](.+?)["'`]/gu), (match) => match[1].trim());
  const fileLike = Array.from(
    normalized.matchAll(/[\p{L}\p{N}_./-]+\.(?:ts|tsx|js|jsx|json|css|md|cs|java|kt)/gu),
    (match) => match[0]
  );
  const tokens = Array.from(normalized.matchAll(/[\p{L}\p{N}_-]{3,}/gu), (match) => match[0]).filter(
    (token) => !STOP_WORDS.has(token)
  );

  const expanded = new Set<string>([...quoted, ...fileLike, ...tokens]);
  if (normalized.includes('авторизац') || normalized.includes('auth')) {
    ['auth', 'authentication', 'login', 'token', 'cookie', 'session'].forEach((term) => expanded.add(term));
  }
  if (normalized.includes('логин')) {
    ['login', 'auth', 'session'].forEach((term) => expanded.add(term));
  }
  if (hasDiRuntimeSignals(normalized)) {
    ['program', 'module', 'provider', 'binding', 'bean', 'registration', 'inject', 'wiring'].forEach((term) => expanded.add(term));
  }
  if (hasOperationalRefreshSignals(normalized)) {
    ['filewatcher', 'stackgraphenrichmentservice', 'graphrepository', 'projectindexer', 'refresh', 'watcher', 'incremental', 'latency', 'batching'].forEach((term) => expanded.add(term));
  }

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
