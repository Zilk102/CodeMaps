import { describe, expect, it } from 'vitest';
import { classifyNodeByRules } from '../architectureClassification';
import { DEFAULT_ARCHITECTURE_RULES } from '../architectureRules';

const layerOf = (id: string, type = 'file') =>
  classifyNodeByRules(
    { id: `/proj/${id}`, label: id, group: 0, type, churn: 0 },
    DEFAULT_ARCHITECTURE_RULES
  );

describe('default architecture rules: fallback conventions', () => {
  it.each([
    ['electron/resolution/goResolver.ts', 'application', 'resolution_pipeline'],
    ['lib/extractors/imports.ts', 'shared', 'shared_utilities'],
    ['engine/extractors/imports.ts', 'analysis', 'analysis_support_path'],
    ['engine/facts/symbolFacts.ts', 'analysis', 'analysis_support_path'],
    ['engine/catalogs/ruleCatalog.ts', 'analysis', 'analysis_support_path'],
    ['engine/policies/retry.ts', 'analysis', 'analysis_support_path'],
    ['engine/scoring/risk.ts', 'analysis', 'analysis_support_path'],
    ['engine/clones/report.ts', 'analysis', 'analysis_support_path'],
    ['engine/detectors/cycles.ts', 'analysis', 'analysis_support_path'],
    ['engine/heuristics/naming.ts', 'analysis', 'analysis_support_path'],
    ['vitest.global-setup.ts', 'configuration', 'tooling_setup_file'],
    ['src/setupTests.ts', 'configuration', 'tooling_setup_file'],
    ['jest.setup.js', 'configuration', 'tooling_setup_file'],
    ['src/App.tsx', 'presentation', 'ui_entrypoint'],
    ['src/main.tsx', 'presentation', 'ui_entrypoint'],
  ])('%s -> %s', (id, layer, reason) => {
    expect(layerOf(id)).toMatchObject({ layer, reason });
  });

  it('classifies a resolution directory itself', () => {
    expect(layerOf('electron/resolution', 'directory').layer).toBe('application');
  });

  it('does not override earlier rules or over-match', () => {
    expect(layerOf('src/components/policies/PolicyCard.tsx').layer).toBe('presentation');
    expect(layerOf('src/services/clones/x.ts').layer).toBe('application');
    expect(layerOf('src/appendix.ts').layer).toBe('unknown');
    expect(layerOf('src/widgets/Setupper.ts').layer).toBe('unknown');
  });

  it('keeps unclassified adapter folders unknown', () => {
    expect(layerOf('src/adapters/Adapter1.ts').layer).toBe('unknown');
  });
});
