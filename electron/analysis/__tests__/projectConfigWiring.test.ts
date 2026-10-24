import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { CloneIndex } from '../clones/CloneIndex';
import { DocumentationIndex } from '../documentation';
import { analyzeModuleQuality } from '../moduleQualityMetrics';
import { structureLimitsOf, DEFAULT_PROJECT_CONFIG } from '../projectConfig';
import { analyzeSourceFileStructure } from '../sourceFileStructure';
import { TestProject, functionOfLines } from './projectKit';

let project: TestProject;
afterEach(() => project?.dispose());

/** A private helper of `lines` lines under a header comment, so only its size matters. */
const privateHelper = (lines: number) =>
  `/** Helpers for the wiring tests of the project configuration. */\n\n${functionOfLines('helper', lines).replace('export ', '')}`;

/** A block of distinct-looking code long enough for the clone detector. */
const duplicatedBlock = (name: string) =>
  [
    `export function ${name}(items: string[], limit: number) {`,
    '  const result: string[] = [];',
    '  for (const item of items) {',
    '    if (item.length > limit) {',
    '      result.push(item.slice(0, limit));',
    '    } else if (item === "") {',
    '      result.push("empty");',
    '    } else {',
    '      result.push(item.toUpperCase());',
    '    }',
    '  }',
    '  if (result.length === 0) {',
    '    return null;',
    '  }',
    '  return result.join(",");',
    '}',
    '',
  ].join('\n');

describe('documentation under the project config', () => {
  it('applies the function and header limits and the exclusions', async () => {
    project = new TestProject();
    project.write('src/a.ts', privateHelper(12));
    project.write('third/b.ts', privateHelper(12));
    const index = new DocumentationIndex();

    const defaults = await index.refreshFor(project.graph());
    expect(defaults.undocumented.map((item) => path.basename(item.file))).toEqual(['a.ts', 'b.ts']);

    project.writeCodemaps(
      'config.json',
      JSON.stringify({ exclude: ['third'], documentation: { functionMinLines: 20 } })
    );
    const tuned = await index.refreshFor(project.graph());

    expect(tuned.analyzedFiles).toBe(1);
    expect(tuned.undocumented).toEqual([]);
  });

  it('measures nothing when documentation is disabled', async () => {
    project = new TestProject();
    project.write('src/a.ts', privateHelper(40));
    project.writeCodemaps('config.json', JSON.stringify({ documentation: { enabled: false } }));
    const index = new DocumentationIndex();

    const report = await index.refreshFor(project.graph());

    expect(report.analyzedFiles).toBe(0);
    expect(report.coveragePercent).toBe(100);
    expect(index.peek(project.root)).toBe(report);
  });
});

describe('clone detection under the project config', () => {
  it('skips excluded files', async () => {
    project = new TestProject();
    project.write('src/one.ts', duplicatedBlock('first'));
    project.write('copy/two.ts', duplicatedBlock('second'));
    const index = new CloneIndex();

    expect((await index.refreshFor(project.graph())).length).toBeGreaterThan(0);

    project.writeCodemaps('config.json', JSON.stringify({ exclude: ['copy'] }));
    expect(await index.refreshFor(project.graph())).toEqual([]);
  });
});

describe('structure limits', () => {
  it('flag a function only from the configured size', () => {
    project = new TestProject();
    const file = project.write('src/mid.ts', functionOfLines('mid', 65));
    const strict = structureLimitsOf({
      ...DEFAULT_PROJECT_CONFIG,
      explicitThresholds: { maxFunctionLines: 60 },
    });

    expect(analyzeSourceFileStructure(file).longMethods).toEqual([]);
    expect(analyzeSourceFileStructure(file, strict).longMethods.map((fn) => fn.name)).toEqual([
      'mid',
    ]);
  });

  it('feed the quality rankings, which leave excluded files out', () => {
    project = new TestProject();
    project.write('src/mid.ts', functionOfLines('mid', 65));
    project.write('legacy/old.ts', functionOfLines('old', 65));
    project.writeCodemaps(
      'config.json',
      JSON.stringify({ thresholds: { maxFunctionLines: 60 }, exclude: ['legacy'] })
    );

    const quality = analyzeModuleQuality(project.graph());

    expect(quality.longMethods.map((entry) => path.basename(entry.node.id))).toEqual(['mid.ts']);
    expect(quality.limits?.longMinLines).toBe(61);
  });
});
