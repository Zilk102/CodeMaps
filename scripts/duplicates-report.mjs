#!/usr/bin/env node
// Lists the copy-pasted code of the given folders with CodeMaps' own clone detector (the same
// one behind the find_duplicates tool). Run `npm run build:electron` first.
//
//   node scripts/duplicates-report.mjs electron src
import { createRequire } from 'node:module';
import * as fs from 'node:fs';
import * as path from 'node:path';

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '..');
const { CloneIndex } = require(path.join(root, 'dist-electron/analysis/clones/CloneIndex.js'));

const SOURCE = /\.(?:[cm]?[jt]sx?)$/;
const SKIPPED_DIRS = new Set(['node_modules', 'dist-electron', 'dist-renderer', '.git', 'release']);

const collect = (target) => {
  const stat = fs.statSync(target);
  if (stat.isFile()) return SOURCE.test(target) ? [target] : [];
  return fs
    .readdirSync(target, { withFileTypes: true })
    .filter((entry) => !SKIPPED_DIRS.has(entry.name))
    .flatMap((entry) => collect(path.join(target, entry.name)));
};

const targets = process.argv.slice(2);
if (targets.length === 0) {
  console.error('usage: node scripts/duplicates-report.mjs <file-or-folder>...');
  process.exit(2);
}

const files = targets
  .flatMap((target) => collect(path.resolve(target)))
  .map((f) => f.replace(/\\/g, '/'));
const groups = await new CloneIndex().refresh(root.replace(/\\/g, '/'), files);
const relative = (file) => path.relative(root, file).replace(/\\/g, '/');

for (const group of groups) {
  const copies = group.instances
    .map((instance) => `${relative(instance.file)}:${instance.startLine}-${instance.endLine}`)
    .join('  ');
  console.log(`${group.lineCount} lines x${group.instances.length}: ${copies}`);
}
console.log(`\n${groups.length} duplicate group(s)`);
