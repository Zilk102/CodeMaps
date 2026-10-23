import { describe, expect, it } from 'vitest';
import {
  buildScenarioCards,
  buildTabs,
  buildWorkflowSteps,
  nextTabIndex,
  projectDisplayName,
} from './toolsPanelData';

const t = (key: string) => `T:${key}`;

describe('buildTabs', () => {
  it('lists overview first, then the tools in tab order', () => {
    const tabs = buildTabs(t);
    expect(tabs.map((tab) => tab.id)).toEqual([
      'overview',
      'blast',
      'heatmap',
      'decomposition',
      'duplicates',
      'pr',
    ]);
    expect(tabs[0]).toEqual({
      id: 'overview',
      label: 'T:tools.workspace',
      eyebrow: 'T:tools.workspaceEyebrow',
      description: 'T:tools.workspaceDescription',
    });
    expect(tabs[2]).toEqual({
      id: 'heatmap',
      label: 'T:tools.heatmap',
      eyebrow: 'T:tools.heatmapEyebrow',
      description: 'T:tools.heatmapDescription',
    });
  });
});

describe('buildScenarioCards / buildWorkflowSteps', () => {
  it('use the overview order', () => {
    const ids = ['blast', 'decomposition', 'duplicates', 'pr', 'heatmap'];
    expect(buildScenarioCards(t).map((c) => c.id)).toEqual(ids);
    expect(buildWorkflowSteps(t).map((s) => s.id)).toEqual(ids);
  });

  it('carry badge and quick description', () => {
    const pr = buildScenarioCards(t)[3];
    expect(pr).toEqual({
      id: 'pr',
      title: 'T:tools.prImpact',
      badge: 'T:tools.quickActions.review',
      description: 'T:tools.quickActions.prDescription',
    });
    expect(buildWorkflowSteps(t)[1]).toEqual({
      id: 'decomposition',
      title: 'T:tools.decomposition',
      description: 'T:tools.quickActions.decompositionActionDescription',
    });
  });
});

describe('nextTabIndex', () => {
  it('moves right and wraps', () => {
    expect(nextTabIndex('ArrowRight', 1, 5)).toBe(2);
    expect(nextTabIndex('ArrowRight', 4, 5)).toBe(0);
  });

  it('moves left and wraps', () => {
    expect(nextTabIndex('ArrowLeft', 2, 5)).toBe(1);
    expect(nextTabIndex('ArrowLeft', 0, 5)).toBe(4);
  });

  it('ignores other keys', () => {
    expect(nextTabIndex('Enter', 2, 5)).toBe(-1);
  });
});

describe('projectDisplayName', () => {
  it('handles both separators and trailing slashes', () => {
    expect(projectDisplayName('C:\\work\\proj')).toBe('proj');
    expect(projectDisplayName('/home/me/proj/')).toBe('proj');
  });

  it('falls back to the raw path', () => {
    expect(projectDisplayName('/')).toBe('/');
  });
});
