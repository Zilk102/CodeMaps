#!/usr/bin/env node
// Lists the long or complex functions and the oversized classes of the given files or folders,
// with the same measurements CodeMaps uses on itself. Run `npm run build:electron` first.
//
//   node scripts/quality-report.mjs electron/analysis src/components
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { sourceFilesOfArguments } from './lib/collectSourceFiles.mjs';

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '..');
const { analyzeSourceFileStructure } = require(
  path.join(root, 'dist-electron/analysis/sourceFileStructure.js')
);

const TEST = /(\.test\.|\.spec\.|__tests__)/;
const MAX_LINES = Number(process.env.QUALITY_MAX_LINES ?? 60);
const MAX_COMPLEXITY = Number(process.env.QUALITY_MAX_COMPLEXITY ?? 10);

const files = sourceFilesOfArguments('quality-report.mjs', process.argv.slice(2));

const rows = [];
for (const file of files) {
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
