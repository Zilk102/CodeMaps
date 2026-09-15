import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function ensureElectronInstalled() {
  const electronDir = path.join(process.cwd(), 'node_modules', 'electron');
  const electronCacheDir = path.join(process.cwd(), '.artifacts', 'electron-cache');
  const pathFile = path.join(electronDir, 'path.txt');

  process.env.electron_config_cache = electronCacheDir;
  fs.mkdirSync(electronCacheDir, { recursive: true });

  if (!fs.existsSync(pathFile)) {
    execFileSync(process.execPath, [path.join(electronDir, 'install.js')], {
      stdio: 'inherit',
      env: process.env,
    });
    return;
  }

  const executablePath = fs.readFileSync(pathFile, 'utf8').trim();
  const installedBinary = path.join(electronDir, 'dist', executablePath);
  if (!fs.existsSync(installedBinary)) {
    execFileSync(process.execPath, [path.join(electronDir, 'install.js')], {
      stdio: 'inherit',
      env: process.env,
    });
  }
}

// The oracle runs file parsing inside a Piscina worker, which loads the compiled
// dist-electron output rather than the TypeScript sources vitest transforms. Without
// this step a stale (or missing) build silently changes what the integration tests
// exercise, so compile the main process before any suite runs. `composite: true`
// keeps this incremental and cheap on repeat runs.
//
// Invoke tsc through `node …/tsc.js` rather than `npx`: on Windows `execFileSync`
// cannot resolve `npx.cmd` without `shell: true`, which produced spawnSync ENOENT
// in CI.
export default function setup() {
  const testLocalAppData = path.join(process.cwd(), '.artifacts', 'test-localappdata');
  fs.mkdirSync(testLocalAppData, { recursive: true });
  process.env.LOCALAPPDATA = testLocalAppData;
  process.env.APPDATA = testLocalAppData;

  ensureElectronInstalled();

  const tscJs = path.join(process.cwd(), 'node_modules', 'typescript', 'lib', 'tsc.js');
  execFileSync(process.execPath, [tscJs, '-p', 'electron/tsconfig.json'], {
    stdio: 'inherit',
  });
}
