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

const STRUCTURE_RULES: HealthRule[] = [
  (m) =>
    m.totalNodes === 0
      ? finding('empty_graph', 'high', 'Граф пуст, индексация проекта не дала ни одного узла.', 70)
      : null,
  (m) =>
    m.unresolvedImportLinks > 0
      ? finding(
          'unresolved_import_links',
          highIf(m.unresolvedImportLinks > 25),
          `Обнаружено ${m.unresolvedImportLinks} import-связей с неразрешенной целью.`,
          Math.min(25, m.unresolvedImportLinks)
        )
      : null,
  (m) =>
    m.orphanNodes > 0
      ? finding(
          'orphan_nodes',
          m.orphanNodes > 20 ? 'medium' : 'low',
          `Обнаружено ${m.orphanNodes} изолированных узлов без входящих и исходящих связей.`,
          Math.min(15, Math.ceil(m.orphanNodes / 3))
        )
      : null,
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
  (m) =>
    m.architectureViolations > 0
      ? finding(
          'architecture_violations',
          highIf(m.architectureViolations > 10),
          `Обнаружено ${m.architectureViolations} нарушений межслоевых зависимостей.`,
          Math.min(20, m.architectureViolations * 2)
        )
      : null,
  (m) =>
    m.unknownLayerNodes > 0
      ? finding(
          'unknown_layer_nodes',
          m.unknownLayerNodes > 25 ? 'medium' : 'low',
          `Для ${m.unknownLayerNodes} узлов не удалось определить архитектурный слой.`,
          Math.min(10, Math.ceil(m.unknownLayerNodes / 10))
        )
      : null,
];

const DESIGN_RULES: HealthRule[] = [
  (m) =>
    m.oversizedModules > 0
      ? finding(
          'oversized_modules',
          highIf(m.oversizedModules >= 3),
          `Обнаружено ${m.oversizedModules} oversized-модулей с избыточным размером или плотностью символов.`
        )
      : null,
  (m) =>
    m.godFiles > 0
      ? finding(
          'god_files',
          'high',
          `Обнаружено ${m.godFiles} god-file модулей с чрезмерной концентрацией ответственности.`
        )
      : null,
  (m) =>
    m.godClasses > 0
      ? finding(
          'god_classes',
          highIf(m.godClasses >= 3),
          `Обнаружено ${m.godClasses} god-class конструкций с перегруженным публичным API или слишком большим телом класса.`
        )
      : null,
  (m) =>
    m.longMethods > 0
      ? finding(
          'long_methods',
          highIf(m.longMethods >= 4),
          `Обнаружено ${m.longMethods} длинных методов/функций, ухудшающих читаемость и стоимость безопасного рефакторинга.`
        )
      : null,
  (m) =>
    m.complexMethods > 0
      ? finding(
          'complex_methods',
          highIf(m.complexMethods >= 4),
          `Обнаружено ${m.complexMethods} методов/функций с высокой цикломатической сложностью или глубокой вложенностью.`
        )
      : null,
  (m) =>
    m.codeClones > 0
      ? finding(
          'code_clones',
          highIf(m.codeClones >= 3),
          `Обнаружено ${m.codeClones} групп дублирующегося кода (клонов). Дублирование усложняет поддержку и увеличивает объем кодовой базы.`
        )
      : null,
  (m) =>
    m.mixedResponsibilityModules > 0
      ? finding(
          'mixed_responsibility_modules',
          highIf(m.mixedResponsibilityModules >= 3),
          `Обнаружено ${m.mixedResponsibilityModules} модулей со смешанными архитектурными ответственностями.`
        )
      : null,
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
