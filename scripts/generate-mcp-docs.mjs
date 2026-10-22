#!/usr/bin/env node
/**
 * Writes docs/MCP_TOOLS.md from the tool descriptors, so the reference can never drift from the
 * code (a test fails when the file is stale). Run `npm run docs:mcp`, which builds first.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const { MCP_TOOLS, MCP_RESOURCES } = require(
  path.join(root, 'dist-electron', 'mcp', 'descriptors.js')
);
const { renderToolsReference } = require(
  path.join(root, 'dist-electron', 'mcp', 'docsGenerator.js')
);

const target = path.join(root, 'docs', 'MCP_TOOLS.md');
fs.writeFileSync(target, renderToolsReference(MCP_TOOLS, MCP_RESOURCES));
console.log(
  `Wrote ${path.relative(root, target)} (${MCP_TOOLS.length} tools, ${MCP_RESOURCES.length} resources)`
);
