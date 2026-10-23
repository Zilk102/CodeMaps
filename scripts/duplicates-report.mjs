#!/usr/bin/env node
// Lists the copy-pasted code of the given folders with CodeMaps' own clone detector (the same
// one behind the find_duplicates tool). Run `npm run build:electron` first.
//
//   node scripts/duplicates-report.mjs electron src
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { sourceFilesOfArguments } from './lib/collectSourceFiles.mjs';

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '..');
const { CloneIndex } = require(path.join(root, 'dist-electron/analysis/clones/CloneIndex.js'));

const sourceFiles = sourceFilesOfArguments('duplicates-report.mjs', process.argv.slice(2));
const files = sourceFiles.map((f) => f.replace(/\\/g, '/'));
const groups = await new CloneIndex().refresh(root.replace(/\\/g, '/'), files);
const relative = (file) => path.relative(root, file).replace(/\\/g, '/');

for (const group of groups) {
  const copies = group.instances
    .map((instance) => `${relative(instance.file)}:${instance.startLine}-${instance.endLine}`)
    .join('  ');
  console.log(`${group.lineCount} lines x${group.instances.length}: ${copies}`);
}
console.log(`\n${groups.length} duplicate group(s)`);
