import * as fs from 'fs';
import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_PROJECT_CONFIG,
  compileGlobs,
  loadProjectConfig,
  parseProjectConfig,
  projectConfigPath,
  structureLimitsOf,
  writeDefaultProjectConfig,
} from '../projectConfig';
import { DEFAULT_STRUCTURE_LIMITS } from '../projectConfig/structureLimits';
import { TestProject } from './projectKit';

let project: TestProject;
afterEach(() => project?.dispose());

describe('loadProjectConfig', () => {
  it('uses the defaults without a file or a project', () => {
    project = new TestProject();
    const loaded = loadProjectConfig(project.root);

    expect(loaded.present).toBe(false);
    expect(loaded.warnings).toEqual([]);
    expect(loaded.config).toEqual(DEFAULT_PROJECT_CONFIG);
    expect(loadProjectConfig(undefined).config.mode).toBe('ratchet');
  });

  it('reads valid fields and keeps the thresholds the file wrote apart', () => {
    project = new TestProject();
    project.writeCodemaps(
      'config.json',
      JSON.stringify({
        version: 1,
        mode: 'strict',
        exclude: ['vendor/**'],
        thresholds: { maxFunctionLines: 40 },
        documentation: { enabled: false, headerMinLines: 30 },
      })
    );
    const { config, warnings } = loadProjectConfig(project.root);

    expect(warnings).toEqual([]);
    expect(config.mode).toBe('strict');
    expect(config.exclude).toEqual(['vendor/**']);
    expect(config.thresholds).toEqual({ maxFunctionLines: 40, maxComplexity: 8, maxNesting: 3 });
    expect(config.explicitThresholds).toEqual({ maxFunctionLines: 40 });
    expect(config.documentation).toEqual({
      enabled: false,
      headerMinLines: 30,
      functionMinLines: 10,
    });
  });

  it('falls back to the defaults on invalid JSON and says so', () => {
    project = new TestProject();
    project.writeCodemaps('config.json', '{ "mode": ');
    const loaded = loadProjectConfig(project.root);

    expect(loaded.config).toEqual(DEFAULT_PROJECT_CONFIG);
    expect(loaded.present).toBe(true);
    expect(loaded.warnings).toHaveLength(1);
    expect(loaded.warnings[0]).toContain('config.json');
  });

  it('replaces only the invalid field by its default and warns once per problem', () => {
    project = new TestProject();
    project.writeCodemaps(
      'config.json',
      JSON.stringify({
        mode: 'lenient',
        exclude: ['ok/**', 7, ''],
        thresholds: { maxFunctionLines: -3, maxComplexity: 12 },
        documentation: { enabled: 'yes', functionMinLines: 20 },
        surprise: true,
      })
    );
    const { config, warnings } = loadProjectConfig(project.root);

    expect(config.mode).toBe('ratchet');
    expect(config.exclude).toEqual(['ok/**']);
    expect(config.thresholds.maxFunctionLines).toBe(60);
    expect(config.thresholds.maxComplexity).toBe(12);
    expect(config.documentation).toEqual({
      enabled: true,
      headerMinLines: 15,
      functionMinLines: 20,
    });
    expect(warnings).toHaveLength(5);
    expect(warnings.join('\n')).toContain('surprise');
  });

  it('never throws, whatever the file holds', () => {
    for (const raw of ['null', '[]', '42', '"text"', '{"thresholds": 3, "exclude": "x"}']) {
      expect(() => parseProjectConfig(JSON.parse(raw))).not.toThrow();
    }
    project = new TestProject();
    fs.mkdirSync(projectConfigPath(project.root), { recursive: true });
    expect(() => loadProjectConfig(project.root)).not.toThrow();
  });

  it('reloads when the file changes and reuses the result when it does not', () => {
    project = new TestProject();
    project.writeCodemaps('config.json', JSON.stringify({ mode: 'strict' }));
    const first = loadProjectConfig(project.root);

    expect(loadProjectConfig(project.root)).toBe(first);

    const file = projectConfigPath(project.root);
    fs.writeFileSync(file, JSON.stringify({ mode: 'ratchet', exclude: ['generated/**'] }));
    fs.utimesSync(file, new Date(), new Date(Date.now() + 5000));
    const second = loadProjectConfig(project.root);

    expect(second).not.toBe(first);
    expect(second.config.exclude).toEqual(['generated/**']);
  });
});

describe('writeDefaultProjectConfig', () => {
  it('creates a file that loads cleanly and never overwrites an edited one', () => {
    project = new TestProject();
    const created = writeDefaultProjectConfig(project.root);
    const loaded = loadProjectConfig(project.root);

    expect(created.created).toBe(true);
    expect(loaded.warnings).toEqual([]);
    expect(loaded.config.explicitThresholds).toEqual({
      maxFunctionLines: 60,
      maxComplexity: 8,
      maxNesting: 3,
    });

    fs.writeFileSync(created.path, JSON.stringify({ mode: 'strict' }));
    expect(writeDefaultProjectConfig(project.root).created).toBe(false);
    expect(fs.readFileSync(created.path, 'utf-8')).toContain('strict');
  });
});

describe('exclusion globs', () => {
  const excludes = (patterns: string[], file: string) => compileGlobs(patterns)(file);

  it('matches a bare name at any depth and everything below a folder', () => {
    expect(excludes(['vendor'], 'vendor/lib/a.ts')).toBe(true);
    expect(excludes(['vendor'], 'packages/app/vendor/a.ts')).toBe(true);
    expect(excludes(['vendor'], 'src/vendored.ts')).toBe(false);
  });

  it('anchors patterns with a slash at the project root', () => {
    expect(excludes(['src/generated'], 'src/generated/a.ts')).toBe(true);
    expect(excludes(['src/generated'], 'app/src/generated/a.ts')).toBe(false);
    expect(excludes(['/dist'], 'dist/a.js')).toBe(true);
    expect(excludes(['/dist'], 'pkg/dist/a.js')).toBe(false);
  });

  it('supports *, ** and ? wildcards', () => {
    expect(excludes(['**/*.gen.ts'], 'a/b/api.gen.ts')).toBe(true);
    expect(excludes(['**/*.gen.ts'], 'api.gen.ts')).toBe(true);
    expect(excludes(['src/*.ts'], 'src/a.ts')).toBe(true);
    expect(excludes(['src/*.ts'], 'src/deep/a.ts')).toBe(false);
    expect(excludes(['src/**/fixtures'], 'src/x/y/fixtures/a.ts')).toBe(true);
    expect(excludes(['src/**/fixtures'], 'src/fixtures/a.ts')).toBe(true);
    expect(excludes(['file?.ts'], 'file1.ts')).toBe(true);
    expect(excludes(['file?.ts'], 'file12.ts')).toBe(false);
  });

  it('treats regular expression characters literally and ignores case and slash style', () => {
    expect(excludes(['lib/a+b(1).ts'], 'lib/a+b(1).ts')).toBe(true);
    expect(excludes(['lib/a+b(1).ts'], 'lib/aab(1)xts')).toBe(false);
    expect(excludes(['Vendor/**'], String.raw`vendor\x\a.ts`)).toBe(true);
    expect(excludes([], 'anything.ts')).toBe(false);
    expect(excludes(['  ', '/'], 'anything.ts')).toBe(false);
  });

  it('resolves absolute paths against the project root', () => {
    project = new TestProject();
    project.writeCodemaps(
      'config.json',
      JSON.stringify({ exclude: ['vendor/**', 'src/*.gen.ts'] })
    );
    const { isExcluded } = loadProjectConfig(project.root);

    expect(isExcluded(`${project.root}/vendor/a.ts`)).toBe(true);
    expect(isExcluded(`${project.root}/src/api.gen.ts`)).toBe(true);
    expect(isExcluded(`${project.root}/src/api.ts`)).toBe(false);
    expect(isExcluded('vendor/a.ts')).toBe(true);
  });
});

describe('structureLimitsOf', () => {
  it('keeps the built-in limits unless the file sets a threshold', () => {
    expect(structureLimitsOf(DEFAULT_PROJECT_CONFIG)).toEqual(DEFAULT_STRUCTURE_LIMITS);
    expect(structureLimitsOf(undefined)).toEqual(DEFAULT_STRUCTURE_LIMITS);
  });

  it('turns a written maximum into an inclusive minimum with high severity', () => {
    const limits = structureLimitsOf({
      ...DEFAULT_PROJECT_CONFIG,
      explicitThresholds: { maxFunctionLines: 60, maxNesting: 3 },
    });

    expect(limits.longMinLines).toBe(61);
    expect(limits.severeLines).toBe(61);
    expect(limits.deepMinNesting).toBe(4);
    expect(limits.severeNesting).toBe(4);
    expect(limits.complexMinComplexity).toBe(DEFAULT_STRUCTURE_LIMITS.complexMinComplexity);
  });
});
