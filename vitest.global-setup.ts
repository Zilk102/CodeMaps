import { execFileSync } from 'node:child_process';
import path from 'node:path';

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
  const tscJs = path.join(process.cwd(), 'node_modules', 'typescript', 'lib', 'tsc.js');
  execFileSync(process.execPath, [tscJs, '-p', 'electron/tsconfig.json'], {
    stdio: 'inherit',
  });
}
