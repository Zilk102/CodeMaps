import type {
  HealthScoreIssue,
  HealthScoreMetricSnapshot,
  HealthScoreResult,
  HealthScoreSummary,
} from './healthScoreTypes';

export function buildHealthScoreResult(
  metrics: HealthScoreMetricSnapshot
): HealthScoreResult {
  const issues: HealthScoreIssue[] = [];
  let score = 100;

  if (metrics.totalNodes === 0) {
    issues.push({
      code: 'empty_graph',
      severity: 'high',
      message: 'Граф пуст, индексация проекта не дала ни одного узла.',
    });
    score -= 70;
  }

  if (metrics.unresolvedImportLinks > 0) {
    issues.push({
      code: 'unresolved_import_links',
      severity: metrics.unresolvedImportLinks > 25 ? 'high' : 'medium',
      message: `Обнаружено ${metrics.unresolvedImportLinks} import-связей с неразрешенной целью.`,
    });
    score -= Math.min(25, metrics.unresolvedImportLinks);
  }

  if (metrics.orphanNodes > 0) {
    issues.push({
      code: 'orphan_nodes',
      severity: metrics.orphanNodes > 20 ? 'medium' : 'low',
      message: `Обнаружено ${metrics.orphanNodes} изолированных узлов без входящих и исходящих связей.`,
    });
    score -= Math.min(15, Math.ceil(metrics.orphanNodes / 3));
  }

  if (metrics.directoryCoverageRatio < 0.85) {
    issues.push({
      code: 'weak_hierarchy',
      severity: metrics.directoryCoverageRatio < 0.5 ? 'high' : 'medium',
      message: `Иерархия неполная: только ${(metrics.directoryCoverageRatio * 100).toFixed(1)}% файлов и ADR узлов имеют директорию-родителя.`,
    });
    score -= Math.min(20, Math.ceil((1 - metrics.directoryCoverageRatio) * 20));
  }

  if (metrics.symbolNodes === 0 && metrics.fileNodes > 0) {
    issues.push({
      code: 'missing_symbols',
      severity: 'high',
      message: 'Файлы найдены, но symbol-level узлы отсутствуют: парсинг сущностей деградировал.',
    });
    score -= 25;
  }

  if (metrics.architectureViolations > 0) {
    issues.push({
      code: 'architecture_violations',
      severity: metrics.architectureViolations > 10 ? 'high' : 'medium',
      message: `Обнаружено ${metrics.architectureViolations} нарушений межслоевых зависимостей.`,
    });
    score -= Math.min(20, metrics.architectureViolations * 2);
  }

  if (metrics.unknownLayerNodes > 0) {
    issues.push({
      code: 'unknown_layer_nodes',
      severity: metrics.unknownLayerNodes > 25 ? 'medium' : 'low',
      message: `Для ${metrics.unknownLayerNodes} узлов не удалось определить архитектурный слой.`,
    });
    score -= Math.min(10, Math.ceil(metrics.unknownLayerNodes / 10));
  }

  const designDebtPenalty = calculateDesignDebtPenalty(metrics);

  if (metrics.oversizedModules > 0) {
    issues.push({
      code: 'oversized_modules',
      severity: metrics.oversizedModules >= 3 ? 'high' : 'medium',
      message: `Обнаружено ${metrics.oversizedModules} oversized-модулей с избыточным размером или плотностью символов.`,
    });
  }

  if (metrics.godFiles > 0) {
    issues.push({
      code: 'god_files',
      severity: 'high',
      message: `Обнаружено ${metrics.godFiles} god-file модулей с чрезмерной концентрацией ответственности.`,
    });
  }

  if (metrics.godClasses > 0) {
    issues.push({
      code: 'god_classes',
      severity: metrics.godClasses >= 3 ? 'high' : 'medium',
      message: `Обнаружено ${metrics.godClasses} god-class конструкций с перегруженным публичным API или слишком большим телом класса.`,
    });
  }

  if (metrics.longMethods > 0) {
    issues.push({
      code: 'long_methods',
      severity: metrics.longMethods >= 4 ? 'high' : 'medium',
      message: `Обнаружено ${metrics.longMethods} длинных методов/функций, ухудшающих читаемость и стоимость безопасного рефакторинга.`,
    });
  }

  if (metrics.complexMethods > 0) {
    issues.push({
      code: 'complex_methods',
      severity: metrics.complexMethods >= 4 ? 'high' : 'medium',
      message: `Обнаружено ${metrics.complexMethods} методов/функций с высокой цикломатической сложностью или глубокой вложенностью.`,
    });
  }

  if (metrics.mixedResponsibilityModules > 0) {
    issues.push({
      code: 'mixed_responsibility_modules',
      severity: metrics.mixedResponsibilityModules >= 3 ? 'high' : 'medium',
      message: `Обнаружено ${metrics.mixedResponsibilityModules} модулей со смешанными архитектурными ответственностями.`,
    });
  }

  if (designDebtPenalty > 0) {
    score -= designDebtPenalty;
  }

  if (metrics.maintainabilityScore < 85) {
    issues.push({
      code: 'maintainability_score',
      severity: metrics.maintainabilityScore < 60 ? 'high' : 'medium',
      message: `Maintainability score снижен до ${metrics.maintainabilityScore.toFixed(1)}: стоимость поддержки и безопасного рефакторинга уже заметно выросла.`,
    });
  }

  if (metrics.solidScore < 85) {
    issues.push({
      code: 'solid_score',
      severity: metrics.solidScore < 60 ? 'high' : 'medium',
      message: `SOLID score снижен до ${metrics.solidScore.toFixed(1)}: наблюдаются признаки нарушения SRP/размывания границ ответственности.`,
    });
  }

  if (metrics.refreshPipelineDegraded) {
    const refreshPenalty = calculateRefreshPenalty(
      metrics.avgRefreshLatencyMs,
      metrics.runtimePriorityRate,
      metrics.runtimePriorityRebuilds
    );
    issues.push({
      code: 'refresh_pipeline_degradation',
      severity:
        metrics.avgRefreshLatencyMs >= 50 || metrics.runtimePriorityRate >= 0.5
          ? 'high'
          : 'medium',
      message: `Incremental refresh деградирует: latency trend=${metrics.refreshLatencyTrend}, runtime priority rate=${(metrics.runtimePriorityRate * 100).toFixed(1)}%, avg latency=${metrics.avgRefreshLatencyMs.toFixed(1)} ms.`,
    });
    score -= refreshPenalty;
  }

  score = Math.max(0, Math.min(100, score));

  return {
    score,
    grade: toGrade(score),
    summary: buildHealthSummary(metrics),
    issues,
  };
}

export function calculateMaintainabilityScore(input: {
  avgDesignSmellScore: number;
  longMethods: number;
  complexMethods: number;
  oversizedModules: number;
  godFiles: number;
  fileNodes: number;
}) {
  const fileScale = Math.max(1, Math.ceil(input.fileNodes / 20));
  const maintainabilityPenalty =
    Math.ceil(input.avgDesignSmellScore / 2) +
    Math.ceil(input.longMethods / fileScale) * 2 +
    Math.ceil(input.complexMethods / fileScale) * 2 +
    input.oversizedModules * 2 +
    input.godFiles * 3;

  return Math.max(0, Math.min(100, 100 - Math.min(85, maintainabilityPenalty)));
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
