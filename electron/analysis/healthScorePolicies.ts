import type {
  HealthScoreIssue,
  HealthScoreMetricSnapshot,
  HealthScoreResult,
  HealthScoreSummary,
} from './healthScoreTypes';

type Severity = HealthScoreIssue['severity'];

interface HealthFinding {
  issue: HealthScoreIssue;
  penalty: number;
}

type HealthRule = (metrics: HealthScoreMetricSnapshot) => HealthFinding | null;

function finding(code: string, severity: Severity, message: string, penalty = 0): HealthFinding {
  return { issue: { code, severity, message }, penalty };
}

/** Severity helper: `high` when the condition holds, otherwise `medium`. */
function highIf(condition: boolean): Severity {
  return condition ? 'high' : 'medium';
}

type CountKey = {
  [K in keyof HealthScoreMetricSnapshot]: HealthScoreMetricSnapshot[K] extends number ? K : never;
}[keyof HealthScoreMetricSnapshot];

type CountToLevel = (count: number) => Severity;

/**
 * A rule that fires while the counter `key` is positive. `{count}` in the message is replaced by
 * the counter; `severity` and `penalty` follow it.
 */
function countRule(
  key: CountKey,
  code: string,
  severity: Severity | CountToLevel,
  message: string,
  penalty?: (count: number) => number
): HealthRule {
  return (m) => {
    const count = m[key];
    if (!(count > 0)) return null;
    const level = typeof severity === 'function' ? severity(count) : severity;
    return finding(code, level, message.replace('{count}', String(count)), penalty?.(count));
  };
}

/** `high` from `threshold` on, otherwise `medium`. */
const highFrom =
  (threshold: number): CountToLevel =>
  (count) =>
    highIf(count >= threshold);

/** `high` above `limit`, otherwise `medium`. */
const highAbove =
  (limit: number): CountToLevel =>
  (count) =>
    highIf(count > limit);

/** `medium` above `limit`, otherwise `low`. */
const mediumAbove =
  (limit: number): CountToLevel =>
  (count) =>
    count > limit ? 'medium' : 'low';

/** The count, capped; `factor` weighs each unit. */
const capped =
  (cap: number, factor = 1) =>
  (count: number) =>
    Math.min(cap, count * factor);

/** One point per `divisor` units, rounded up and capped. */
const perUnits = (cap: number, divisor: number) => (count: number) =>
  Math.min(cap, Math.ceil(count / divisor));

const STRUCTURE_RULES: HealthRule[] = [
  (m) =>
    m.totalNodes === 0
      ? finding('empty_graph', 'high', 'Граф пуст, индексация проекта не дала ни одного узла.', 70)
      : null,
  countRule(
    'unresolvedImportLinks',
    'unresolved_import_links',
    highAbove(25),
    'Обнаружено {count} import-связей с неразрешенной целью.',
    capped(25)
  ),
  countRule(
    'orphanNodes',
    'orphan_nodes',
    mediumAbove(20),
    'Обнаружено {count} изолированных узлов без входящих и исходящих связей.',
    perUnits(15, 3)
  ),
  (m) =>
    m.directoryCoverageRatio < 0.85
      ? finding(
          'weak_hierarchy',
          highIf(m.directoryCoverageRatio < 0.5),
          `Иерархия неполная: только ${(m.directoryCoverageRatio * 100).toFixed(1)}% файлов и ADR узлов имеют директорию-родителя.`,
          Math.min(20, Math.ceil((1 - m.directoryCoverageRatio) * 20))
        )
      : null,
  (m) =>
    m.symbolNodes === 0 && m.fileNodes > 0
      ? finding(
          'missing_symbols',
          'high',
          'Файлы найдены, но symbol-level узлы отсутствуют: парсинг сущностей деградировал.',
          25
        )
      : null,
  countRule(
    'architectureViolations',
    'architecture_violations',
    highAbove(10),
    'Обнаружено {count} нарушений межслоевых зависимостей.',
    capped(20, 2)
  ),
  countRule(
    'unknownLayerNodes',
    'unknown_layer_nodes',
    mediumAbove(25),
    'Для {count} узлов не удалось определить архитектурный слой.',
    perUnits(10, 10)
  ),
];

const DESIGN_RULES: HealthRule[] = [
  countRule(
    'oversizedModules',
    'oversized_modules',
    highFrom(3),
    'Обнаружено {count} oversized-модулей с избыточным размером или плотностью символов.'
  ),
  countRule(
    'godFiles',
    'god_files',
    'high',
    'Обнаружено {count} god-file модулей с чрезмерной концентрацией ответственности.'
  ),
  countRule(
    'godClasses',
    'god_classes',
    highFrom(3),
    'Обнаружено {count} god-class конструкций с перегруженным публичным API или слишком большим телом класса.'
  ),
  countRule(
    'longMethods',
    'long_methods',
    highFrom(4),
    'Обнаружено {count} длинных методов/функций, ухудшающих читаемость и стоимость безопасного рефакторинга.'
  ),
  countRule(
    'complexMethods',
    'complex_methods',
    highFrom(4),
    'Обнаружено {count} методов/функций с высокой цикломатической сложностью или глубокой вложенностью.'
  ),
  countRule(
    'codeClones',
    'code_clones',
    highFrom(3),
    'Обнаружено {count} групп дублирующегося кода (клонов). Дублирование усложняет поддержку и увеличивает объем кодовой базы.'
  ),
  countRule(
    'mixedResponsibilityModules',
    'mixed_responsibility_modules',
    highFrom(3),
    'Обнаружено {count} модулей со смешанными архитектурными ответственностями.'
  ),
];

const QUALITY_RULES: HealthRule[] = [
  (m) =>
    m.maintainabilityScore < 85
      ? finding(
          'maintainability_score',
          highIf(m.maintainabilityScore < 60),
          `Maintainability score снижен до ${m.maintainabilityScore.toFixed(1)}: стоимость поддержки и безопасного рефакторинга уже заметно выросла.`
        )
      : null,
  (m) =>
    m.solidScore < 85
      ? finding(
          'solid_score',
          highIf(m.solidScore < 60),
          `SOLID score снижен до ${m.solidScore.toFixed(1)}: наблюдаются признаки нарушения SRP/размывания границ ответственности.`
        )
      : null,
  (m) =>
    m.refreshPipelineDegraded
      ? finding(
          'refresh_pipeline_degradation',
          highIf(m.avgRefreshLatencyMs >= 50 || m.runtimePriorityRate >= 0.5),
          `Incremental refresh деградирует: latency trend=${m.refreshLatencyTrend}, runtime priority rate=${(m.runtimePriorityRate * 100).toFixed(1)}%, avg latency=${m.avgRefreshLatencyMs.toFixed(1)} ms.`,
          calculateRefreshPenalty(
            m.avgRefreshLatencyMs,
            m.runtimePriorityRate,
            m.runtimePriorityRebuilds
          )
        )
      : null,
];

function applyRules(
  rules: HealthRule[],
  metrics: HealthScoreMetricSnapshot
): { issues: HealthScoreIssue[]; penalty: number } {
  const issues: HealthScoreIssue[] = [];
  let penalty = 0;
  for (const rule of rules) {
    const result = rule(metrics);
    if (!result) continue;
    issues.push(result.issue);
    penalty += result.penalty;
  }
  return { issues, penalty };
}

export function buildHealthScoreResult(metrics: HealthScoreMetricSnapshot): HealthScoreResult {
  const structure = applyRules(STRUCTURE_RULES, metrics);
  const design = applyRules(DESIGN_RULES, metrics);
  const quality = applyRules(QUALITY_RULES, metrics);

  const totalPenalty =
    structure.penalty + design.penalty + calculateDesignDebtPenalty(metrics) + quality.penalty;
  const score = Math.max(0, Math.min(100, 100 - totalPenalty));

  return {
    score,
    grade: toGrade(score),
    summary: buildHealthSummary(metrics),
    issues: [...structure.issues, ...design.issues, ...quality.issues],
  };
}

export function calculateMaintainabilityScore(args: {
  avgDesignSmellScore: number;
  longMethods: number;
  complexMethods: number;
  oversizedModules: number;
  godFiles: number;
  fileNodes: number;
  codeClones?: number;
}): number {
  const {
    avgDesignSmellScore,
    longMethods,
    complexMethods,
    oversizedModules,
    godFiles,
    fileNodes,
    codeClones = 0,
  } = args;

  if (fileNodes === 0) return 100;

  const smellPenalty = Math.min(30, avgDesignSmellScore * 1.5);
  const methodPenalty = Math.min(25, ((longMethods + complexMethods * 1.5) / fileNodes) * 20);
  const modulePenalty = Math.min(25, ((oversizedModules + godFiles * 2) / fileNodes) * 50);
  const clonePenalty = Math.min(20, (codeClones / fileNodes) * 30);

  const rawScore = 100 - smellPenalty - methodPenalty - modulePenalty - clonePenalty;
  return Math.max(0, Math.round(rawScore));
}

export function calculateSolidScore(input: {
  godFiles: number;
  godClasses: number;
  mixedResponsibilityModules: number;
  architectureViolations: number;
  avgDesignSmellScore: number;
}) {
  const solidPenalty =
    input.godFiles * 4 +
    Math.ceil(input.godClasses / 3) * 2 +
    Math.ceil(input.mixedResponsibilityModules / 2) * 2 +
    input.architectureViolations * 2 +
    Math.ceil(input.avgDesignSmellScore / 8);

  return Math.max(0, Math.min(100, 100 - Math.min(85, solidPenalty)));
}

function buildHealthSummary(metrics: HealthScoreMetricSnapshot): HealthScoreSummary {
  return { ...metrics };
}

function toGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

function calculateDesignDebtPenalty(input: {
  avgDesignSmellScore: number;
  oversizedModules: number;
  godFiles: number;
  godClasses: number;
  longMethods: number;
  complexMethods: number;
  mixedResponsibilityModules: number;
}) {
  const weightedPenalty =
    Math.ceil(input.avgDesignSmellScore / 6) +
    Math.min(6, input.oversizedModules) +
    input.godFiles * 3 +
    Math.ceil(input.godClasses / 3) * 2 +
    Math.ceil(input.longMethods / 4) +
    Math.ceil(input.complexMethods / 6) +
    input.mixedResponsibilityModules * 2;

  return Math.min(30, weightedPenalty);
}

function calculateRefreshPenalty(
  avgRefreshLatencyMs: number,
  runtimePriorityRate: number,
  runtimePriorityRebuilds: number
) {
  return Math.min(
    10,
    Math.ceil(avgRefreshLatencyMs / 20) +
      Math.ceil(runtimePriorityRate * 6) +
      Math.ceil(runtimePriorityRebuilds / 2)
  );
}
