import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { MCP_RESOURCES, MCP_TOOLS } from '../descriptors';
import { renderToolsReference, TOOL_CATEGORIES } from '../docsGenerator';

describe('MCP reference documentation', () => {
  it('puts every tool in exactly one category', () => {
    const categorized = TOOL_CATEGORIES.flatMap((category) => category.tools);
    expect(new Set(categorized).size).toBe(categorized.length);
    expect([...categorized].sort()).toEqual(MCP_TOOLS.map((tool) => tool.name).sort());
  });

  it('keeps docs/MCP_TOOLS.md in sync with the descriptors (run `npm run docs:mcp`)', () => {
    const file = path.resolve(__dirname, '../../../docs/MCP_TOOLS.md');
    const onDisk = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
    expect(onDisk).toBe(renderToolsReference(MCP_TOOLS, MCP_RESOURCES));
  });
});
