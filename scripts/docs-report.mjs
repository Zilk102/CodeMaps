#!/usr/bin/env node
// Lists what is undocumented in the given folders with CodeMaps' own documentation engine (the
// one behind the documentation findings of the MCP tools). A guardian: any finding exits with 1.
// Run `npm run build:electron` first.
//
//   node scripts/docs-report.mjs electron src scripts
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { sourceFilesOfArguments } from './lib/collectSourceFiles.mjs';

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '..');
const { analyzeDocumentation } = require(
  path.join(root, 'dist-electron/analysis/documentation/index.js')
);

const posix = (file) => file.replace(/\\/g, '/');
const files = sourceFilesOfArguments('docs-report.mjs', process.argv.slice(2)).map(posix);
const report = await analyzeDocumentation(files, posix(root));
const relative = (file) => posix(path.relative(root, file));

const lines = [
  ...report.filesWithoutHeader.map((file) => `header   ${relative(file)}  no header comment`),
  ...report.undocumented.map((s) => `missing  ${relative(s.file)}:${s.line}  ${s.kind} ${s.name}`),
  ...report.lowQuality.map(
    (s) => `${s.quality.padEnd(8)} ${relative(s.file)}:${s.line}  ${s.kind} ${s.name}`
  ),
];
for (const line of lines) console.log(line);
console.log(
  `\n${lines.length} documentation finding(s); coverage ${report.coveragePercent}% of ${report.requiredSymbols} required symbols in ${report.analyzedFiles} files`
);
if (lines.length > 0) process.exitCode = 1;
