import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(__filename), '..');
const electronEntrypoint = path.join(projectRoot, 'dist-electron', 'main.js');

if (!fs.existsSync(electronEntrypoint)) {
  console.error('dist-electron/main.js not found. Run "npm run build:electron" first.');
  process.exit(1);
}

const electronBinary =
  process.platform === 'win32'
    ? path.join(projectRoot, 'node_modules', '.bin', 'electron.cmd')
    : path.join(projectRoot, 'node_modules', '.bin', 'electron');

if (!fs.existsSync(electronBinary)) {
  console.error(`Electron binary not found: ${electronBinary}`);
  process.exit(1);
}

const minExpectedRuntimeMs = 500;
const maxAllowedRuntimeMs = 15000;
const startedAt = Date.now();

const child = spawn(electronBinary, ['.'], {
  cwd: projectRoot,
  env: {
    ...process.env,
    CODEMAPS_E2E_SHUTDOWN_TEST: '1',
    CODEMAPS_E2E_SHUTDOWN_DELAY_MS: '750',
  },
  stdio: 'pipe',
  shell: process.platform === 'win32',
});

let stdout = '';
let stderr = '';
let exited = false;

child.stdout.on('data', (chunk) => {
  stdout += chunk.toString();
});

child.stderr.on('data', (chunk) => {
  stderr += chunk.toString();
});

const timeout = setTimeout(() => {
  if (exited) {
    return;
  }

  child.kill('SIGKILL');
  console.error(`Electron process did not exit within ${maxAllowedRuntimeMs}ms.`);
  if (stdout.trim()) {
    console.error('--- stdout ---');
    console.error(stdout.trim());
  }
  if (stderr.trim()) {
    console.error('--- stderr ---');
    console.error(stderr.trim());
  }
  process.exit(1);
}, maxAllowedRuntimeMs);

child.once('exit', (code, signal) => {
  exited = true;
  clearTimeout(timeout);

  const runtimeMs = Date.now() - startedAt;
  if (code !== 0) {
    console.error(`Electron exited with code ${code} and signal ${signal ?? 'none'}.`);
    if (stdout.trim()) {
      console.error('--- stdout ---');
      console.error(stdout.trim());
    }
    if (stderr.trim()) {
      console.error('--- stderr ---');
      console.error(stderr.trim());
    }
    process.exit(1);
  }

  if (runtimeMs < minExpectedRuntimeMs) {
    console.error(
      `Electron exited too early (${runtimeMs}ms). Expected at least ${minExpectedRuntimeMs}ms.`
    );
    if (stdout.trim()) {
      console.error('--- stdout ---');
      console.error(stdout.trim());
    }
    if (stderr.trim()) {
      console.error('--- stderr ---');
      console.error(stderr.trim());
    }
    process.exit(1);
  }

  console.log(`Electron shutdown e2e passed in ${runtimeMs}ms.`);
});
