#!/usr/bin/env node
// Bundles the headless guard (electron/guard/cli.ts) into a self-contained folder and packs it:
//
//   dist-guard/guard/guard.mjs          the whole engine in one file, no node_modules needed
//   dist-guard/guard/wasm/              tree-sitter runtime and the grammars CodeMaps knows
//   dist-guard/codemaps-guard-<v>.tgz   the folder packed (+ .sha256), and the same as codemaps-guard.tgz
//
// The bundler is rolldown, which ships with vite and is therefore already installed; nothing is
// added to package.json. Electron and electron-log are replaced by empty stand-ins, so the bundle
// can neither start Electron nor write log files, and it contains no network code.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const outDir = path.join(root, 'dist-guard');
const guardDir = path.join(outDir, 'guard');
const { version } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8'));

/** Source of the stand-ins for modules that only exist inside the desktop app. */
const STUBS = {
  electron: 'export const app = undefined; export default { app: undefined };',
  'electron-log/main': [
    'const noop = () => undefined;',
    'const log = { info: noop, warn: noop, error: noop, debug: noop, verbose: noop, silly: noop, log: noop, initialize: noop, scope: () => log, transports: {} };',
    'export default log;',
  ].join('\n'),
};

/** Rolldown plugin that serves `STUBS` instead of the real packages. */
const stubPlugin = {
  name: 'codemaps-guard-stubs',
  resolveId: (id) => (id in STUBS ? `\0stub:${id}` : null),
  load: (id) => (id.startsWith('\0stub:') ? STUBS[id.slice('\0stub:'.length)] : null),
};

/** Lets CommonJS code inside the ES module bundle use `require`, `__dirname` and `__filename`. */
const BANNER = [
  "import { createRequire as __guardCreateRequire } from 'node:module';",
  "import { fileURLToPath as __guardFileURLToPath } from 'node:url';",
  "import { dirname as __guardDirname } from 'node:path';",
  'const require = __guardCreateRequire(import.meta.url);',
  'const __filename = __guardFileURLToPath(import.meta.url);',
  'const __dirname = __guardDirname(__filename);',
].join('\n');

/** Names of the tree-sitter grammars (`wasmName` entries) the language catalog uses. */
const grammarNames = () => {
  const catalog = fs.readFileSync(path.join(root, 'electron/parsing/languageCatalog.ts'), 'utf-8');
  return [...new Set([...catalog.matchAll(/wasmName:\s*'([^']+)'/g)].map((match) => match[1]))];
};

/** Bundles the CLI into `guard/guard.mjs`. */
const bundle = async () => {
  const { rolldown } = await import('rolldown');
  const build = await rolldown({
    input: path.join(root, 'electron/guard/cli.ts'),
    platform: 'node',
    plugins: [stubPlugin],
    transform: { define: { __CODEMAPS_GUARD_VERSION__: JSON.stringify(version) } },
    logLevel: 'warn',
    // web-tree-sitter's Emscripten glue uses direct eval by design; it is not ours to change.
    onLog: (level, log, handler) => {
      if (log.code !== 'EVAL') handler(level, log);
    },
  });
  await build.write({ file: path.join(guardDir, 'guard.mjs'), format: 'esm', banner: BANNER });
  await build.close();
};

/** Copies the tree-sitter runtime and the grammars next to the bundle. */
const copyWasm = () => {
  const wasmDir = path.join(guardDir, 'wasm');
  fs.mkdirSync(wasmDir, { recursive: true });
  const grammars = path.join(root, 'node_modules/tree-sitter-wasms/out');
  fs.copyFileSync(
    path.join(root, 'node_modules/web-tree-sitter/tree-sitter.wasm'),
    path.join(wasmDir, 'tree-sitter.wasm')
  );
  for (const name of grammarNames()) {
    const file = `tree-sitter-${name}.wasm`;
    fs.copyFileSync(path.join(grammars, file), path.join(wasmDir, file));
  }
};

/** Packs `guard/` into a tgz with the system `tar` and writes the checksum next to it. */
const pack = (archiveName) => {
  const archive = path.join(outDir, archiveName);
  // Relative names plus a working directory: GNU tar on Windows reads "D:" in a path as a host.
  execFileSync('tar', ['-czf', archiveName, 'guard'], { cwd: outDir, stdio: 'inherit' });
  const hash = createHash('sha256').update(fs.readFileSync(archive)).digest('hex');
  fs.writeFileSync(`${archive}.sha256`, `${hash}  ${archiveName}\n`);
  return { archive, hash };
};

fs.rmSync(outDir, { recursive: true, force: true });
await bundle();
copyWasm();
fs.writeFileSync(
  path.join(guardDir, 'README.txt'),
  `CodeMaps guard ${version}\nRun: node guard.mjs check --base origin/main --format github\nDocs: https://github.com/Zilk102/CodeMaps/blob/main/docs/CI_GUARD.md\n`
);
const versioned = pack(`codemaps-guard-${version}.tgz`);
pack('codemaps-guard.tgz');
const megabytes = (file) => (fs.statSync(file).size / 1048576).toFixed(1);
console.log(
  `guard ${version}: guard.mjs ${megabytes(path.join(guardDir, 'guard.mjs'))} MB, ${path.basename(versioned.archive)} ${megabytes(versioned.archive)} MB, sha256 ${versioned.hash}`
);
