export type WorkspaceTab = 'overview' | 'blast' | 'heatmap' | 'pr' | 'decomposition';
export type ToolTab = Exclude<WorkspaceTab, 'overview'>;

type Translate = (key: string) => string;

export interface TabMeta {
  id: WorkspaceTab;
  label: string;
  eyebrow: string;
  description: string;
}

export interface ScenarioCard {
  id: ToolTab;
  title: string;
  badge: string;
  description: string;
}

export interface WorkflowStep {
  id: ToolTab;
  title: string;
  description: string;
}

interface ToolDefinition {
  id: ToolTab;
  /** i18n key of the tool name (tab label and card title). */
  nameKey: string;
  eyebrowKey: string;
  descriptionKey: string;
  badgeKey: string;
  quickDescriptionKey: string;
}

const BLAST: ToolDefinition = {
  id: 'blast',
  nameKey: 'tools.blastRadius',
  eyebrowKey: 'tools.blastRadiusEyebrow',
  descriptionKey: 'tools.blastRadiusDescription',
  badgeKey: 'tools.quickActions.highRisk',
  quickDescriptionKey: 'tools.quickActions.blastDescription',
};
const HEATMAP: ToolDefinition = {
  id: 'heatmap',
  nameKey: 'tools.heatmap',
  eyebrowKey: 'tools.heatmapEyebrow',
  descriptionKey: 'tools.heatmapDescription',
  badgeKey: 'tools.quickActions.hotspots',
  quickDescriptionKey: 'tools.quickActions.heatmapDescription',
};
const DECOMPOSITION: ToolDefinition = {
  id: 'decomposition',
  nameKey: 'tools.decomposition',
  eyebrowKey: 'tools.decompositionEyebrow',
  descriptionKey: 'tools.decompositionDescription',
  badgeKey: 'tools.quickActions.refactoring',
  quickDescriptionKey: 'tools.quickActions.decompositionActionDescription',
};
const PR: ToolDefinition = {
  id: 'pr',
  nameKey: 'tools.prImpact',
  eyebrowKey: 'tools.prImpactEyebrow',
  descriptionKey: 'tools.prImpactDescription',
  badgeKey: 'tools.quickActions.review',
  quickDescriptionKey: 'tools.quickActions.prDescription',
};

/** Order of the tool tabs after the overview tab. */
const TAB_ORDER: ToolDefinition[] = [BLAST, HEATMAP, DECOMPOSITION, PR];
/** Order of the cards and guide steps on the overview tab. */
const SCENARIO_ORDER: ToolDefinition[] = [BLAST, DECOMPOSITION, PR, HEATMAP];

export function buildTabs(t: Translate): TabMeta[] {
  return [
    {
      id: 'overview',
      label: t('tools.workspace'),
      eyebrow: t('tools.workspaceEyebrow'),
      description: t('tools.workspaceDescription'),
    },
    ...TAB_ORDER.map((tool) => ({
      id: tool.id,
      label: t(tool.nameKey),
      eyebrow: t(tool.eyebrowKey),
      description: t(tool.descriptionKey),
    })),
  ];
}

export function buildScenarioCards(t: Translate): ScenarioCard[] {
  return SCENARIO_ORDER.map((tool) => ({
    id: tool.id,
    title: t(tool.nameKey),
    badge: t(tool.badgeKey),
    description: t(tool.quickDescriptionKey),
  }));
}

export function buildWorkflowSteps(t: Translate): WorkflowStep[] {
  return SCENARIO_ORDER.map((tool) => ({
    id: tool.id,
    title: t(tool.nameKey),
    description: t(tool.quickDescriptionKey),
  }));
}

/** Tab index reached by an arrow key, or -1 for any other key. Wraps around at both ends. */
export function nextTabIndex(key: string, index: number, count: number): number {
  if (key === 'ArrowRight') return (index + 1) % count;
  if (key === 'ArrowLeft') return (index - 1 + count) % count;
  return -1;
}

/** Last path segment of the project path, used as its display name. */
export function projectDisplayName(projectPath: string): string {
  return projectPath.split(/[/\\]/).filter(Boolean).pop() || projectPath;
}
