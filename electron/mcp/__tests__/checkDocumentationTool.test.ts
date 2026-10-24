import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DocumentationReport } from '../../analysis/documentation';
import { docFile, reportOf, symbol } from '../../analysis/__tests__/documentationFixtures';

const state = vi.hoisted(() => ({ report: null as DocumentationReport | null }));

vi.mock('../utils', () => ({
  ensureGraphLoaded: async () => ({ nodes: [], links: [], projectRoot: 'D:/p' }),
  resolveProjectFilePath: (_graph: unknown, file: string) => `D:/p/${file}`,
}));
vi.mock('../../analysis/documentation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../analysis/documentation')>()),
  documentationIndex: { refreshFor: async () => state.report },
}));

import { registerDocumentationTools } from '../registerDocumentationTools';

type Handler = (args: Record<string, unknown>) => Promise<{ content: { text: string }[] }>;

const registered = () => {
  const tools = new Map<string, { config: { inputSchema: object }; handler: Handler }>();
  const server = {
    registerTool: (name: string, config: { inputSchema: object }, handler: Handler) =>
      tools.set(name, { config, handler }),
  } as unknown as McpServer;
  registerDocumentationTools(server);
  return tools;
};

const call = async (args: Record<string, unknown>) => {
  const tool = registered().get('check_documentation');
  if (!tool) throw new Error('check_documentation was not registered');
  return JSON.parse((await tool.handler(args)).content[0].text);
};

describe('check_documentation', () => {
  beforeEach(() => {
    state.report = reportOf(
      docFile('D:/p/src/a.ts', [symbol('alpha', false), symbol('beta', true)]),
      docFile('D:/p/lib/b.ts', [symbol('gamma', false, { quality: 'too_short' })])
    );
  });

  it('is registered with its filter, limit and low-quality inputs', () => {
    const tool = registered().get('check_documentation');
    expect(Object.keys(tool?.config.inputSchema ?? {})).toEqual(
      expect.arrayContaining(['filePath', 'limit', 'includeLowQuality'])
    );
  });

  it('answers with coverage, offenders and symbols that carry a hint', async () => {
    const result = await call({});
    expect(result.status).toBe('ok');
    expect(result.coveragePercent).toBe(33.3);
    expect(result.topOffenders).toHaveLength(2);
    expect(result.undocumented.items.map((item: { name: string }) => item.name)).toEqual([
      'gamma',
      'alpha',
    ]);
    expect(result.undocumented.items[0].hint).toContain('Do not repeat');
    expect(result.byLanguage[0].language).toBe('typescript');
  });

  it('resolves filePath against the project and honours limit', async () => {
    const result = await call({ filePath: 'src', limit: 1 });
    expect(result.analyzedFiles).toBe(1);
    expect(result.undocumented.items).toEqual([expect.objectContaining({ name: 'alpha' })]);
  });

  it('includes low-quality comments only when asked', async () => {
    state.report = reportOf(docFile('D:/p/c.ts', [symbol('delta', true, { quality: 'echo' })]));
    expect((await call({})).lowQuality).toBeUndefined();
    expect((await call({ includeLowQuality: true })).lowQuality.total).toBe(1);
  });
});
