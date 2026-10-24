import { afterEach, describe, expect, it } from 'vitest';
import {
  classifyFindings,
  collectFindings,
  createBaseline,
  loadRatchet,
  measureProject,
  readBaseline,
  refreshBaseline,
} from '../baseline';
import { validateChanges } from '../ChangeValidationService';
import { cloneIndex } from '../clones/CloneIndex';
import { documentationIndex } from '../documentation';
import { HealthScoreAnalyzer } from '../HealthScoreAnalyzer';
import { PatternDetectionAnalyzer } from '../PatternDetectionAnalyzer';
import { TestProject, functionOfLines } from './projectKit';

let project: TestProject;
afterEach(() => {
  cloneIndex.clear();
  documentationIndex.clear();
  project?.dispose();
});

const HEADER = '/** Module under test: a few long helpers used by the ratchet tests. */\n\n';

/** A project with one 75-line function (long by default) and one short one. */
const legacyProject = () => {
  project = new TestProject();
  const file = project.write(
    'src/legacy.ts',
    `${HEADER}${functionOfLines('longLegacy', 75)}${functionOfLines('small', 5)}`
  );
  return file;
};

const kindsOf = (findings: { kind: string }[]) => findings.map((finding) => finding.kind);

describe('collectFindings on a real project', () => {
  it('finds the long function with a stable fingerprint when lines shift', async () => {
    const file = legacyProject();
    const before = collectFindings(await measureProject(project.graph()));
    project.write(
      'src/legacy.ts',
      `// shifted\n// shifted\n${HEADER}${functionOfLines('longLegacy', 75)}`
    );
    const after = collectFindings(await measureProject(project.graph()));

    const longBefore = before.find((finding) => finding.kind === 'long_function');
    const longAfter = after.find((finding) => finding.kind === 'long_function');
    expect(longBefore?.fingerprint).toBe('long_function|src/legacy.ts|longLegacy');
    expect(longAfter?.fingerprint).toBe(longBefore?.fingerprint);
    expect(longAfter?.path).toBe(file);
  });

  it('treats a legacy function that grew as worsened and a new one as fresh', async () => {
    legacyProject();
    const sources = await measureProject(project.graph());
    createBaseline(sources);

    project.write(
      'src/legacy.ts',
      `${HEADER}${functionOfLines('longLegacy', 90)}${functionOfLines('another', 80)}`
    );
    const current = collectFindings(await measureProject(project.graph()));
    const result = classifyFindings(current, readBaseline(project.root));

    expect(result.worsened.map((finding) => finding.symbol)).toEqual(['longLegacy']);
    expect(
      result.fresh.filter((finding) => finding.kind === 'long_function').map((f) => f.symbol)
    ).toEqual(['another']);
  });

  it('applies the thresholds written in the config and not the built-in ones otherwise', async () => {
    project = new TestProject();
    project.write('src/mid.ts', `${HEADER}${functionOfLines('mid', 65)}`);
    expect(kindsOf(collectFindings(await measureProject(project.graph())))).not.toContain(
      'long_function'
    );

    project.writeCodemaps('config.json', JSON.stringify({ thresholds: { maxFunctionLines: 60 } }));
    const findings = collectFindings(await measureProject(project.graph()));

    const long = findings.find((finding) => finding.kind === 'long_function');
    expect(long?.symbol).toBe('mid');
    expect(long?.severity).toBe('high');
  });

  it('leaves out excluded files and, when disabled, documentation', async () => {
    project = new TestProject();
    project.write('vendor/lib.ts', functionOfLines('vendored', 80));
    project.write('src/own.ts', functionOfLines('own', 80));
    project.writeCodemaps(
      'config.json',
      JSON.stringify({ exclude: ['vendor'], documentation: { enabled: false } })
    );
    const findings = collectFindings(await measureProject(project.graph()));

    expect(findings.map((finding) => finding.file)).toEqual(['src/own.ts']);
    expect(kindsOf(findings)).toEqual(['long_function']);
  });

  it('reports undocumented symbols and header-less files', async () => {
    project = new TestProject();
    project.write(
      'src/bare.ts',
      Array.from({ length: 20 }, (_, i) => `export function value${i}() { return ${i}; }`).join(
        '\n'
      )
    );
    const findings = collectFindings(await measureProject(project.graph()));

    expect(kindsOf(findings)).toContain('missing_header');
    expect(kindsOf(findings)).toContain('undocumented_symbol');
  });
});

describe('ratchet versus strict validation', () => {
  const validate = async (mode: 'ratchet' | 'strict') => {
    project.writeCodemaps('config.json', JSON.stringify({ mode }));
    const sources = await measureProject(project.graph());
    const detection = new PatternDetectionAnalyzer().analyzeWithSources(project.graph());
    return validateChanges({
      patterns: detection.patterns,
      changedFiles: [`${project.root}/src/legacy.ts`],
      healthScore: 90,
      documentation: documentationIndex.peek(project.root),
      ratchet: loadRatchet(sources),
    });
  };

  it('reports old findings in strict mode, ignoring the baseline', async () => {
    legacyProject();
    createBaseline(await measureProject(project.graph()));
    project.write('src/legacy.ts', `${HEADER}${functionOfLines('longLegacy', 130)}`);

    const result = await validate('strict');

    expect(result.findings.map((finding) => finding.id)).toContain('long_methods');
    expect(result.legacyDebt).toBeUndefined();
    expect(result.isValid).toBe(false);
  });

  it('reports nothing for untouched old debt and summarizes it', async () => {
    legacyProject();
    createBaseline(await measureProject(project.graph()));

    const result = await validate('ratchet');

    expect(result.findings).toEqual([]);
    expect(result.isValid).toBe(true);
    expect(result.legacyDebt?.total).toBeGreaterThan(0);
    expect(result.legacyDebt?.byKind.long_function).toBe(1);
    expect(result.legacyDebt?.worsened).toBe(0);
  });

  it('blocks a new high-severity function and a worsened legacy one', async () => {
    legacyProject();
    createBaseline(await measureProject(project.graph()));
    project.write(
      'src/legacy.ts',
      `${HEADER}${functionOfLines('longLegacy', 130)}${functionOfLines('brandNew', 125)}`
    );

    const result = await validate('ratchet');
    const evidence = result.findings.flatMap((finding) => finding.evidence.map((e) => e.message));

    expect(result.isValid).toBe(false);
    expect(evidence.some((message) => message.includes('longLegacy'))).toBe(true);
    expect(evidence.some((message) => message.includes('brandNew'))).toBe(true);
  });

  it('behaves like strict mode when there is no baseline', async () => {
    legacyProject();
    project.write('src/legacy.ts', `${HEADER}${functionOfLines('longLegacy', 130)}`);

    const result = await validate('ratchet');

    expect(result.findings.map((finding) => finding.id)).toContain('long_methods');
    expect(result.legacyDebt).toBeUndefined();
  });

  it('does not let the health score veto a ratchet check of the whole project', async () => {
    legacyProject();
    createBaseline(await measureProject(project.graph()));
    const detection = new PatternDetectionAnalyzer().analyzeWithSources(project.graph());
    const sources = await measureProject(project.graph());

    const result = validateChanges({
      patterns: detection.patterns,
      changedFiles: [],
      healthScore: 10,
      documentation: documentationIndex.peek(project.root),
      ratchet: loadRatchet(sources),
    });

    expect(result.scope).toBe('project');
    expect(result.isValid).toBe(true);
  });

  it('reports a new undocumented symbol but not the old ones', async () => {
    project = new TestProject();
    project.write(
      'src/api.ts',
      `${HEADER}export function oldApi() { return 1; }\nexport function oldTwo() { return 2; }\n${'// filler\n'.repeat(12)}`
    );
    createBaseline(await measureProject(project.graph()));
    project.write(
      'src/api.ts',
      `${HEADER}export function oldApi() { return 1; }\nexport function oldTwo() { return 2; }\nexport function newApi() { return 3; }\n${'// filler\n'.repeat(12)}`
    );
    project.writeCodemaps('config.json', JSON.stringify({ mode: 'ratchet' }));
    const sources = await measureProject(project.graph());

    const result = validateChanges({
      patterns: [],
      changedFiles: [`${project.root}/src/api.ts`],
      healthScore: 90,
      documentation: documentationIndex.peek(project.root),
      ratchet: loadRatchet(sources),
    });

    const [finding] = result.findings;
    expect(finding.id).toBe('missing_documentation');
    expect(finding.evidence.map((e) => e.nodeId)).toEqual([`${project.root}/src/api.ts#newApi`]);
  });
});

describe('refreshBaseline and health score', () => {
  it('pays down the baseline after a fix and never adds', async () => {
    legacyProject();
    createBaseline(await measureProject(project.graph()));
    project.write(
      'src/legacy.ts',
      `${HEADER}${functionOfLines('longLegacy', 20)}${functionOfLines('fresh', 90)}`
    );

    const result = refreshBaseline(await measureProject(project.graph()));
    const fingerprints = Object.keys(readBaseline(project.root)!.entries);

    expect(result.removed).toBeGreaterThan(0);
    expect(fingerprints).not.toContain('long_function|src/legacy.ts|longLegacy');
    expect(fingerprints.some((fingerprint) => fingerprint.includes('fresh'))).toBe(false);
  });

  it('keeps the score honest and adds legacyDebt and configWarnings to the summary', async () => {
    legacyProject();
    const analyzer = new HealthScoreAnalyzer();
    await measureProject(project.graph());
    const withoutBaseline = analyzer.analyze(project.graph());

    createBaseline(await measureProject(project.graph()));
    project.writeCodemaps('config.json', '{ not json');
    const withBaseline = analyzer.analyze(project.graph());

    expect(withoutBaseline.summary.legacyDebt).toBeUndefined();
    expect(withoutBaseline.summary.configWarnings).toBeUndefined();
    expect(withBaseline.score).toBe(withoutBaseline.score);
    expect(withBaseline.summary.legacyDebt?.byKind.long_function).toBe(1);
    expect(withBaseline.summary.configWarnings).toHaveLength(1);
  });
});
