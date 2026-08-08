import { execFileSync } from 'node:child_process';

// The oracle runs file parsing inside a Piscina worker, which loads the compiled
// dist-electron output rather than the TypeScript sources vitest transforms. Without
// this step a stale (or missing) build silently changes what the integration tests
// exercise, so compile the main process before any suite runs. `composite: true`
// keeps this incremental and cheap on repeat runs.
export default function setup() {
  execFileSync('npx', ['tsc', '-p', 'electron/tsconfig.json'], { stdio: 'inherit' });
}
