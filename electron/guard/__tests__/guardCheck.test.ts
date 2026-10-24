/**
 * Tests of the headless guard engine on small fixture projects: what passes, what fails, how the
 * ratchet and the baseline rule behave, and how a base ref narrows the scope.
 */
import { afterAll, describe, expect, it, vi } from 'vitest';
import { runCheck } from '../evaluate';
import {
  CLEAN_MODULE,
  STRICT_SIZE_CONFIG,
  cleanRepos,
  commitAll,
  git,
  longModule,
  runGuard,
  tempRepo,
  write,
} from './fixtures';

vi.mock('electron-log/main', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

afterAll(cleanRepos);

const blockingRules = (report: Awaited<ReturnType<typeof runCheck>>): string[] =>
  report.issues.filter((issue) => issue.blocking).map((issue) => issue.rule);

describe('codemaps-guard check', () => {
  it('passes a clean project', async () => {
    const root = tempRepo({
      'src/greet.ts': CLEAN_MODULE,
      '.codemaps/config.json': STRICT_SIZE_CONFIG,
    });
    const report = await runCheck({ root });
    expect(report.ok).toBe(true);
    expect(blockingRules(report)).toEqual([]);
    expect(report.scope).toBe('project');
    expect(report.filesIndexed).toBeGreaterThan(0);
  });

  it('fails on a new long function and says where it is and how to fix it', async () => {
    const root = tempRepo({
      'src/greet.ts': CLEAN_MODULE,
      'src/long.ts': longModule(90),
      '.codemaps/config.json': STRICT_SIZE_CONFIG,
    });
    const report = await runCheck({ root });
    expect(report.ok).toBe(false);
    const issue = report.issues.find((item) => item.rule === 'long_methods');
    expect(issue).toMatchObject({ blocking: true, file: 'src/long.ts' });
    expect(issue?.line).toBeGreaterThan(1);
    expect(issue?.fix).toMatch(/helper functions/);
  });

  it('lets a legacy finding in the baseline pass and reports it as debt', async () => {
    const root = tempRepo({
      'src/long.ts': longModule(90),
      '.codemaps/config.json': STRICT_SIZE_CONFIG,
    });
    expect((await runGuard(['baseline', '--root', root])).code).toBe(0);

    const report = await runCheck({ root });
    expect(report.ok).toBe(true);
    expect(report.baselineApplied).toBe(true);
    expect(report.legacyDebt?.total).toBeGreaterThan(0);
    expect(report.legacyDebt?.byKind.long_function).toBe(1);
  });

  it('fails when a legacy finding gets worse', async () => {
    const root = tempRepo({
      'src/long.ts': longModule(90),
      '.codemaps/config.json': STRICT_SIZE_CONFIG,
    });
    await runGuard(['baseline', '--root', root]);
    write(root, 'src/long.ts', longModule(120));

    const report = await runCheck({ root });
    expect(report.ok).toBe(false);
    expect(blockingRules(report)).toContain('long_methods');
  });

  it('fails a new finding next to an accepted one', async () => {
    const root = tempRepo({
      'src/long.ts': longModule(90),
      '.codemaps/config.json': STRICT_SIZE_CONFIG,
    });
    await runGuard(['baseline', '--root', root]);
    write(root, 'src/other.ts', longModule(80).replace('compute', 'other'));

    const report = await runCheck({ root });
    expect(report.ok).toBe(false);
    expect(report.issues.filter((issue) => issue.blocking).map((issue) => issue.file)).toContain(
      'src/other.ts'
    );
  });

  it('ignores the baseline under --strict', async () => {
    const root = tempRepo({
      'src/long.ts': longModule(90),
      '.codemaps/config.json': STRICT_SIZE_CONFIG,
    });
    await runGuard(['baseline', '--root', root]);
    const report = await runCheck({ root, strict: true });
    expect(report.ok).toBe(false);
    expect(report.baselineApplied).toBe(false);
  });

  it('honors the exclude globs of the project config', async () => {
    const root = tempRepo({
      'src/greet.ts': CLEAN_MODULE,
      'vendor/long.ts': longModule(90),
      '.codemaps/config.json': JSON.stringify({
        version: 1,
        exclude: ['vendor'],
        thresholds: { maxFunctionLines: 60 },
        documentation: { enabled: false },
      }),
    });
    expect((await runCheck({ root })).ok).toBe(true);
  });
});

describe('codemaps-guard check --base', () => {
  it('judges only the files changed since the base ref', async () => {
    const root = tempRepo({
      'src/legacy.ts': longModule(90),
      '.codemaps/config.json': STRICT_SIZE_CONFIG,
    });
    git(root, 'checkout', '-q', '-b', 'feature');
    write(root, 'src/greet.ts', CLEAN_MODULE);
    commitAll(root, 'add greeting');

    const changed = await runCheck({ root, base: 'main' });
    expect(changed.scope).toBe('changed');
    expect(changed.changedFiles).toEqual(['src/greet.ts']);
    expect(changed.ok).toBe(true);
    // The long legacy function is outside the change, but a whole-project run sees it.
    expect((await runCheck({ root })).ok).toBe(false);
  });

  it('fails when the change itself adds a long function', async () => {
    const root = tempRepo({
      'src/greet.ts': CLEAN_MODULE,
      '.codemaps/config.json': STRICT_SIZE_CONFIG,
    });
    git(root, 'checkout', '-q', '-b', 'feature');
    write(root, 'src/long.ts', longModule(90));
    commitAll(root, 'add long');
    const report = await runCheck({ root, base: 'main' });
    expect(report.ok).toBe(false);
    expect(report.changedFiles).toContain('src/long.ts');
  });

  it('passes without indexing anything when nothing changed', async () => {
    const root = tempRepo({
      'src/long.ts': longModule(90),
      '.codemaps/config.json': STRICT_SIZE_CONFIG,
    });
    const report = await runCheck({ root, base: 'main' });
    expect(report).toMatchObject({ ok: true, filesIndexed: 0, changedFiles: [] });
  });

  it('fails when the baseline grew compared with the base ref', async () => {
    const root = tempRepo({
      'src/long.ts': longModule(90),
      '.codemaps/config.json': STRICT_SIZE_CONFIG,
    });
    await runGuard(['baseline', '--root', root]);
    commitAll(root, 'baseline');
    git(root, 'checkout', '-q', '-b', 'feature');
    const file = `${root}/.codemaps/baseline.json`;
    const baseline = JSON.parse(await import('fs').then((fs) => fs.readFileSync(file, 'utf-8')));
    baseline.entries['long_function|src/new.ts|hidden'] = 99;
    write(root, '.codemaps/baseline.json', JSON.stringify(baseline));
    commitAll(root, 'grow baseline');

    const report = await runCheck({ root, base: 'main' });
    expect(report.baselineGrowth?.grew).toBe(true);
    expect(report.baselineGrowth?.added).toEqual(['long_function|src/new.ts|hidden']);
    expect(report.ok).toBe(false);
  });

  it('accepts a baseline that shrank or was introduced', async () => {
    const root = tempRepo({
      'src/long.ts': longModule(90),
      '.codemaps/config.json': STRICT_SIZE_CONFIG,
    });
    git(root, 'checkout', '-q', '-b', 'feature');
    await runGuard(['baseline', '--root', root]);
    commitAll(root, 'introduce baseline');
    const report = await runCheck({ root, base: 'main' });
    expect(report.baselineGrowth?.grew).toBe(false);
    expect(report.ok).toBe(true);
  });

  it('reports an unknown ref as a usage error', async () => {
    const root = tempRepo({ 'src/greet.ts': CLEAN_MODULE });
    const result = await runGuard(['check', '--root', root, '--base', 'no-such-ref']);
    expect(result.code).toBe(2);
    expect(result.err).toMatch(/Cannot find "no-such-ref"/);
  });
});

describe('codemaps-guard output formats', () => {
  const failing = () =>
    tempRepo({ 'src/long.ts': longModule(90), '.codemaps/config.json': STRICT_SIZE_CONFIG });

  it('prints GitHub Actions annotations with file and line', async () => {
    const result = await runGuard(['check', '--root', failing(), '--format', 'github']);
    expect(result.code).toBe(1);
    expect(result.out).toMatch(/^::error file=src\/long\.ts,line=\d+,title=long_methods::/m);
    expect(result.out).toContain('Result: FAILED');
  });

  it('prints JSON that parses and is identical from run to run', async () => {
    const root = failing();
    const first = await runGuard(['check', '--root', root, '--format', 'json']);
    const second = await runGuard(['check', '--root', root, '--format', 'json']);
    expect(first.out).toBe(second.out);
    expect(JSON.parse(first.out)).toMatchObject({ ok: false, scope: 'project' });
  });

  it('prints text with the fix hint and the debt summary', async () => {
    const root = failing();
    await runGuard(['baseline', '--root', root]);
    const result = await runGuard(['check', '--root', root]);
    expect(result.code).toBe(0);
    expect(result.out).toMatch(/Legacy debt: 1 accepted/);
    expect(result.out).toContain('Result: PASSED');
  });

  it('refuses to overwrite a baseline and refreshes it only downwards', async () => {
    const root = failing();
    expect((await runGuard(['baseline', '--root', root])).code).toBe(0);
    expect((await runGuard(['baseline', '--root', root])).code).toBe(2);
    write(root, 'src/long.ts', CLEAN_MODULE);
    const refreshed = await runGuard(['baseline', '--root', root, '--refresh']);
    expect(refreshed.out).toMatch(/1 removed/);
  });
});
