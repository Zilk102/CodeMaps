/**
 * Entry point of the bundled `guard.mjs`. It points the tree-sitter runtime at the `wasm` folder
 * shipped next to the bundle (when there is one) and runs the command line. Importing this file
 * runs the guard, so only the bundle script and `npm run guard` do so.
 */
import * as fs from 'fs';
import * as path from 'path';
import { WASM_DIR_ENV } from '../parsing/treeSitterRuntime';
import { runCli } from './commands';

const bundledWasm = path.join(__dirname, 'wasm');
if (!process.env[WASM_DIR_ENV] && fs.existsSync(path.join(bundledWasm, 'tree-sitter.wasm'))) {
  process.env[WASM_DIR_ENV] = bundledWasm;
}

void runCli(process.argv.slice(2), {
  out: (text) => process.stdout.write(text),
  err: (text) => process.stderr.write(text),
}).then((code) => {
  process.exitCode = code;
});
