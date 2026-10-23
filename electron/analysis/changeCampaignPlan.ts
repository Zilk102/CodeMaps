import type { GraphNode } from '../store/types';
import type {
  ArchitectureLayer,
  ArchitectureNodeClassification,
  ArchitectureViolation,
} from './ArchitectureInsightService';
import type { ChangeTaskMode } from './ChangeContextService';
import type { DetectedPattern } from './PatternDetectionAnalyzer';
import { evaluateRiskRules, riskWhen, structuralRiskRules, type RiskRule } from './riskRules';
import type {
  QualityBudget,
  RefactoringWave,
  QualityGovernanceService,
} from './QualityGovernanceService';
import type { SecurityFinding } from './SecurityScanner';
import { unique } from './AgentContextUtils';

export type CampaignBreadth = 'small' | 'medium' | 'large';

export interface ChangeCampaignWave {
  id: string;
  title: string;
  goal: string;
  layer: ArchitectureLayer | 'mixed';
  fileIds: string[];
}

interface WaveDefinition {
  key: string;
  layers: ArchitectureLayer[];
  title: string;
  goal: string;
}

const RUNTIME_WAVE_KEY = 'wave-runtime-contracts';
const FALLBACK_WAVE_KEY = 'wave-core';
const MAX_FILES_PER_WAVE = 15;

const WAVE_DEFINITIONS: WaveDefinition[] = [
  {
    key: RUNTIME_WAVE_KEY,
    layers: ['integration', 'application'],
    title: 'Wave 0: Runtime Contracts',
    goal: 'Сначала проверить composition roots и DI wiring, чтобы миграция не сломала provider bindings и service registrations.',
  },
  {
    key: 'wave-foundation',
    layers: ['shared', 'state', 'configuration'],
    title: 'Wave 1: Foundations',
    goal: 'Сначала стабилизировать общие контракты, shared-типы и конфигурационные точки интеграции.',
  },
  {
    key: FALLBACK_WAVE_KEY,
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

type WaveGroup = Omit<ChangeCampaignWave, 'id'>;

export function buildLayersInvolved(
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

function createWaveGroups() {
  const groups = new Map<string, WaveGroup>();
  for (const wave of WAVE_DEFINITIONS) {
    groups.set(wave.key, {
      layer: wave.layers[0],
      title: wave.title,
      goal: wave.goal,
      fileIds: [],
    });
  }
  return groups;
}

function assignFileToWave(
  groups: Map<string, WaveGroup>,
  fileId: string,
  layer: ArchitectureLayer | undefined
) {
  const wave = WAVE_DEFINITIONS.find((entry) => layer && entry.layers.includes(layer));
  if (wave) {
    groups.get(wave.key)!.fileIds.push(fileId);
    return;
  }
  const fallback = groups.get(FALLBACK_WAVE_KEY);
  if (fallback) {
    fallback.fileIds.push(fileId);
    fallback.layer = 'mixed';
  }
}

export function buildExecutionWaves(
  affectedFiles: GraphNode[],
  layerByNodeId: Map<string, ArchitectureNodeClassification>,
  runtimeCompositionRoots: GraphNode[]
): ChangeCampaignWave[] {
  const groups = createWaveGroups();

  for (const root of runtimeCompositionRoots) {
    groups.get(RUNTIME_WAVE_KEY)?.fileIds.push(root.id);
  }

  for (const file of affectedFiles) {
    if (runtimeCompositionRoots.some((root) => root.id === file.id)) {
      continue;
    }
    assignFileToWave(groups, file.id, layerByNodeId.get(file.id)?.layer);
  }

  return Array.from(groups.entries())
    .map(([id, group]) => ({
      id,
      title: group.title,
      goal: group.goal,
      layer: group.layer,
      fileIds: unique(group.fileIds).slice(0, MAX_FILES_PER_WAVE),
    }))
    .filter((wave) => wave.fileIds.length > 0);
}

interface RiskInput {
  affectedFiles: GraphNode[];
  runtimeCompositionRoots: GraphNode[];
  layersInvolved: Array<{ layer: ArchitectureLayer; count: number }>;
  campaignViolations: ArchitectureViolation[];
  patterns: DetectedPattern[];
  securityFindings: SecurityFinding[];
}

/** Each rule yields a risk message, or null when it does not apply. */
const RISK_RULES: Array<RiskRule<RiskInput>> = [
  riskWhen(
    (i) => i.affectedFiles.length >= 20,
    (i) =>
      `Кампания затрагивает ${i.affectedFiles.length} файлов; высок риск частичных несовместимых изменений между волнами.`
  ),
  riskWhen(
    (i) => i.layersInvolved.length >= 3,
    'Затронуто несколько архитектурных слоёв; нужно удержать границы и не смешать foundation/core/edge изменения.'
  ),
  ...structuralRiskRules<RiskInput>(
    (i) => ({ violations: i.campaignViolations, patterns: i.patterns }),
    {
      violations:
        'Часть файлов кампании уже вовлечена в layer violations; миграция может закрепить smell, если не поправить границы сразу.',
      hotspots:
        'Кампания пересекается с high fan-out / hub areas; blast radius может быть больше, чем видно по именам файлов.',
      designSmells:
        'Кампания проходит через oversized/god modules и другие design smells; если просто наращивать код в этих файлах, smell закрепится и усложнит последующие миграции.',
    }
  ),
  riskWhen(
    (i) => i.runtimeCompositionRoots.length > 0,
    'Кампания затрагивает runtime composition roots; provider bindings и service registrations нужно проверять как отдельный источник совместимости.'
  ),
  riskWhen(
    (i) => i.securityFindings.length > 0,
    'В области кампании есть security findings; миграцию нужно сверять с безопасностью токенов, cookies и API contracts.'
  ),
];

export function buildChangeCampaignRisks(
  affectedFiles: GraphNode[],
  runtimeCompositionRoots: GraphNode[],
  layersInvolved: Array<{ layer: ArchitectureLayer; count: number }>,
  campaignViolations: ArchitectureViolation[],
  patterns: DetectedPattern[],
  securityFindings: SecurityFinding[]
) {
  const input: RiskInput = {
    affectedFiles,
    runtimeCompositionRoots,
    layersInvolved,
    campaignViolations,
    patterns,
    securityFindings,
  };
  return evaluateRiskRules(
    RISK_RULES,
    input,
    'Явных structural red flags не найдено, но массовую миграцию всё равно нужно выполнять по фазам и с post-wave validation.'
  );
}

export function buildChangeCampaignNextSteps(args: {
  taskMode: ChangeTaskMode;
  directlyMatchedFiles: GraphNode[];
  affectedFiles: GraphNode[];
  runtimeCompositionRoots: GraphNode[];
  waves: ChangeCampaignWave[];
  hasSecurityFindings: boolean;
  qualityBudget: QualityBudget;
  refactoringWaves: RefactoringWave[];
  qualityGovernanceService: Pick<QualityGovernanceService, 'summarizeBudgetForStep'>;
}) {
  const nextSteps = [
    `CodeMaps определил задачу как multi-target campaign в режиме "${args.taskMode}".`,
    `Сначала подтвердить seed-файлы кампании: ${
      args.directlyMatchedFiles
        .map((node) => node.id)
        .slice(0, 5)
        .join(', ') || 'явные seed-файлы не найдены'
    }.`,
    `После подтверждения выполнять миграцию волнами, а не пытаться править все ${args.affectedFiles.length} файлов за один проход.`,
  ];

  if (args.runtimeCompositionRoots.length > 0) {
    nextSteps.push(
      `Отдельно подтвердить runtime composition roots: ${args.runtimeCompositionRoots
        .map((node) => node.id)
        .slice(0, 5)
        .join(', ')}.`
    );
  }

  if (args.affectedFiles.some((node) => node.churn >= 10)) {
    nextSteps.push(
      'Для churn-heavy orchestration файлов заранее определить extraction boundaries и не добавлять новую логику без декомпозиции.'
    );
  }

  for (const wave of args.waves.slice(0, 3)) {
    nextSteps.push(`${wave.title}: ${wave.fileIds.length} файлов. Цель: ${wave.goal}`);
  }

  for (const wave of args.refactoringWaves.slice(0, 2)) {
    nextSteps.push(
      `${wave.title}: ${wave.targetLabels.length} extraction candidates. Цель: ${wave.goal}`
    );
  }

  nextSteps.push(args.qualityGovernanceService.summarizeBudgetForStep(args.qualityBudget));

  if (args.hasSecurityFindings) {
    nextSteps.unshift('До начала миграции разобрать security findings в затронутой области.');
  }

  return nextSteps;
}

export function getCampaignBreadth(count: number): CampaignBreadth {
  if (count >= 20) return 'large';
  if (count >= 8) return 'medium';
  return 'small';
}
