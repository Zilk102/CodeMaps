/**
 * Smoke test of the packed guard: unpacks `dist-guard/codemaps-guard.tgz` into an empty temp
 * folder (no node_modules anywhere near it) and runs the bundled `guard.mjs` with plain Node on
 * fixture projects. Skipped when `npm run build:guard` has not been run.
 */
import { createHash } from 'crypto';
import { execFileSync, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CLEAN_MODULE, STRICT_SIZE_CONFIG, cleanRepos, longModule, tempRepo } from './fixtures';

const distDir = path.resolve(__dirname, '..', '..', '..', 'dist-guard');
const archive = path.join(distDir, 'codemaps-guard.tgz');
const built = fs.existsSync(archive) && fs.existsSync(`${archive}.sha256`);

let unpacked = '';

const runBundle = (...args: string[]) =>
  spawnSync(process.execPath, [path.join(unpacked, 'guard', 'guard.mjs'), ...args], {
    cwd: unpacked,
    encoding: 'utf-8',
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot },
  });

describe.skipIf(!built)('bundled codemaps-guard', () => {
  beforeAll(() => {
    unpacked = fs.mkdtempSync(path.join(os.tmpdir(), 'codemaps-guard-bundle-'));
    // Bare names and a working directory: GNU tar on Windows reads "D:" in a path as a host.
    fs.copyFileSync(archive, path.join(unpacked, 'codemaps-guard.tgz'));
    execFileSync('tar', ['-xzf', 'codemaps-guard.tgz'], { cwd: unpacked });
  });

  afterAll(() => {
    fs.rmSync(unpacked, { recursive: true, force: true });
    cleanRepos();
  });

  it('ships a checksum that matches the archive', () => {
    const recorded = fs.readFileSync(`${archive}.sha256`, 'utf-8').split(/\s+/)[0];
    expect(createHash('sha256').update(fs.readFileSync(archive)).digest('hex')).toBe(recorded);
  });

  it('contains the engine, the grammars and no network code', () => {
    expect(fs.existsSync(path.join(unpacked, 'guard', 'wasm', 'tree-sitter.wasm'))).toBe(true);
    expect(fs.existsSync(path.join(unpacked, 'guard', 'wasm', 'tree-sitter-python.wasm'))).toBe(
      true
    );
    const bundle = fs.readFileSync(path.join(unpacked, 'guard', 'guard.mjs'), 'utf-8');
    expect(bundle).not.toMatch(/from ["'](?:node:)?https?["']/);
    expect(bundle).not.toMatch(/require\(["'](?:node:)?https?["']\)/);
  });

  it('prints its version', () => {
    const result = runBundle('version');
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('passes a clean project and fails a project with a long function', () => {
    const clean = tempRepo({
      'src/a.ts': CLEAN_MODULE,
      '.codemaps/config.json': STRICT_SIZE_CONFIG,
    });
    const failing = tempRepo({
      'src/a.ts': CLEAN_MODULE,
      'src/long.ts': longModule(90),
      'tools/helper.py': 'def helper(x):\n    return x + 1\n',
      '.codemaps/config.json': STRICT_SIZE_CONFIG,
    });

    expect(runBundle('check', '--root', clean).status).toBe(0);
    const result = runBundle('check', '--root', failing, '--format', 'github');
    expect(result.status).toBe(1);
    expect(result.stdout).toMatch(/^::error file=src\/long\.ts,line=\d+,title=long_methods::/m);
  });

  it('writes nothing outside .codemaps', () => {
    const root = tempRepo({
      'src/a.ts': CLEAN_MODULE,
      '.codemaps/config.json': STRICT_SIZE_CONFIG,
    });
    const before = fs.readdirSync(root).sort();
    runBundle('check', '--root', root);
    runBundle('baseline', '--root', root);
    expect(fs.readdirSync(root).sort()).toEqual(before);
    expect(fs.existsSync(path.join(root, '.codemaps', 'baseline.json'))).toBe(true);
  });
});
