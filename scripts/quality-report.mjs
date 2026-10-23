#!/usr/bin/env node
// Lists the long or complex functions and the oversized classes of the given files or folders,
// with the same measurements CodeMaps uses on itself. Run `npm run build:electron` first.
//
//   node scripts/quality-report.mjs electron/analysis src/components
import { createRequire } from 'node:module';
import * as fs from 'node:fs';
import * as path from 'node:path';

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '..');
const { analyzeSourceFileStructure } = require(
  path.join(root, 'dist-electron/analysis/sourceFileStructure.js')
);

const SOURCE = /\.(?:[cm]?[jt]sx?)$/;
const TEST = /(\.test\.|\.spec\.|__tests__)/;
const MAX_LINES = Number(process.env.QUALITY_MAX_LINES ?? 60);
const MAX_COMPLEXITY = Number(process.env.QUALITY_MAX_COMPLEXITY ?? 15);

const collect = (target) => {
  const stat = fs.statSync(target);
  if (stat.isFile()) return SOURCE.test(target) ? [target] : [];
  return fs
    .readdirSync(target, { withFileTypes: true })
    .filter(
      (entry) => !['node_modules', 'dist-electron', 'dist-renderer', '.git'].includes(entry.name)
    )
    .flatMap((entry) => collect(path.join(target, entry.name)));
};

const targets = process.argv.slice(2);
if (targets.length === 0) {
  console.error('usage: node scripts/quality-report.mjs <file-or-folder>...');
  process.exit(2);
}

const rows = [];
for (const file of targets.flatMap((target) => collect(path.resolve(target)))) {
  if (TEST.test(file)) continue;
  const metrics = analyzeSourceFileStructure(file);
  for (const fn of metrics.allFunctions) {
    if (fn.lineCount > MAX_LINES || fn.complexity > MAX_COMPLEXITY) {
      rows.push({
        kind: 'function',
        file,
        name: fn.name,
        lines: fn.lineCount,
        complexity: fn.complexity,
      });
    }
  }
  for (const cls of metrics.godClasses) {
    rows.push({
      kind: 'class',
      file,
      name: cls.name,
      lines: cls.lineCount,
      complexity: cls.maxMethodComplexity,
      methods: cls.methodCount,
    });
  }
}

rows.sort((a, b) => b.complexity - a.complexity || b.lines - a.lines);
for (const row of rows) {
  const extra = row.methods ? ` ${row.methods} methods` : '';
  console.log(
    `${row.kind.padEnd(8)} ${path.relative(root, row.file).replace(/\\/g, '/')}  ${row.name}  ${row.lines} lines, complexity ${row.complexity}${extra}`
  );
}
console.log(`\n${rows.length} item(s) over ${MAX_LINES} lines or complexity ${MAX_COMPLEXITY}`);
