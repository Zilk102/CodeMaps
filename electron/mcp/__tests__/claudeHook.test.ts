import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import { AddressInfo } from 'net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildReport,
  isCandidateFile,
  isInsideProject,
  isRepeat,
  run,
} from '../../../scripts/codemaps-validate-hook.mjs';

const finding = (overrides = {}) => ({
  id: 'god_files',
  severity: 'high',
  title: 'God Files',
  files: ['D:/proj/src/Big.ts'],
  fix: 'Split the file by responsibility.',
  evidence: [{ message: 'Big.ts: smell score 80.' }],
  ...overrides,
});

describe('hook file selection', () => {
  it('accepts source files and rejects the rest', () => {
    expect(isCandidateFile('D:/proj/src/a.ts')).toBe(true);
    expect(isCandidateFile('D:/proj/src/a.py')).toBe(true);
    expect(isCandidateFile('D:/proj/README.md')).toBe(false);
    expect(isCandidateFile('D:/proj/node_modules/x/index.js')).toBe(false);
    expect(isCandidateFile('D:/proj/dist/app.js')).toBe(false);
    expect(isCandidateFile(undefined)).toBe(false);
  });

  it('only acts on files of the project CodeMaps has open', () => {
    expect(isInsideProject('d:/PROJ/src/a.ts', 'D:/proj')).toBe(true);
    expect(isInsideProject('D:/other/src/a.ts', 'D:/proj')).toBe(false);
    expect(isInsideProject('D:/proj-two/a.ts', 'D:/proj')).toBe(false);
    expect(isInsideProject('D:/proj/a.ts', null)).toBe(false);
  });
});

describe('buildReport', () => {
  it('is silent when nothing high-severity was found', () => {
    expect(buildReport({ findings: [] }, 'D:/proj', 'D:/proj/src/a.ts')).toBeNull();
    expect(
      buildReport({ findings: [finding({ severity: 'low' })] }, 'D:/proj', 'D:/proj/src/a.ts')
    ).toBeNull();
  });

  it('never reports legacy debt, which ratchet mode only summarizes', () => {
    const validation = {
      findings: [],
      isValid: true,
      legacyDebt: {
        total: 120,
        byKind: { long_function: 120 },
        paidDown: { total: 3 },
        worsened: 0,
      },
    };

    expect(buildReport(validation, 'D:/proj', 'D:/proj/src/a.ts')).toBeNull();
  });

  it('lists problems with project-relative paths and a fix', () => {
    const report = buildReport({ findings: [finding()] }, 'D:/proj', 'D:/proj/src/Big.ts')!;

    expect(report).toContain('src/Big.ts');
    expect(report).toContain('God Files');
    expect(report).toContain('Split the file by responsibility.');
    expect(report).not.toContain('D:/proj');
  });

  it('keeps the message short', () => {
    const many = Array.from({ length: 40 }, (_, index) =>
      finding({ title: `Problem ${index}`, fix: 'x'.repeat(120) })
    );
    const report = buildReport({ findings: many }, 'D:/proj', 'D:/proj/src/Big.ts')!;
    expect(report.length).toBeLessThanOrEqual(1700);
  });
});

describe('isRepeat', () => {
  it('reports each distinct message once per window', () => {
    const stateFile = path.join(os.tmpdir(), `codemaps-hook-test-${process.pid}.json`);
    fs.rmSync(stateFile, { force: true });
    try {
      expect(isRepeat(stateFile, 'a.ts', 'same', 1000)).toBe(false);
      expect(isRepeat(stateFile, 'a.ts', 'same', 2000)).toBe(true);
      expect(isRepeat(stateFile, 'a.ts', 'different', 3000)).toBe(false);
      expect(isRepeat(stateFile, 'b.ts', 'same', 3000)).toBe(false);
      expect(isRepeat(stateFile, 'a.ts', 'different', 3000 + 16 * 60 * 1000)).toBe(false);
    } finally {
      fs.rmSync(stateFile, { force: true });
    }
  });
});

const startFakeCodeMaps = async (options: {
  projectRoot: string;
  sse?: boolean;
  findings: unknown[];
}) => {
  const calls: Array<{ name: string; arguments: unknown }> = [];
  const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/mcp/status') {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ status: 'ok', projectRoot: options.projectRoot }));
      return;
    }
    if (req.method === 'DELETE') {
      res.statusCode = 200;
      res.end();
      return;
    }
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const body = JSON.parse(Buffer.concat(chunks).toString() || '{}');
      if (body.method === 'initialize') {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Mcp-Session-Id', 'test-session');
        res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { capabilities: {} } }));
        return;
      }
      if (body.method === 'notifications/initialized') {
        res.statusCode = 202;
        res.end();
        return;
      }
      calls.push(body.params);
      const payload = JSON.stringify({
        jsonrpc: '2.0',
        id: body.id,
        result: {
          content: [{ type: 'text', text: JSON.stringify({ findings: options.findings }) }],
        },
      });
      if (options.sse) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.end(`event: message\ndata: ${payload}\n\n`);
      } else {
        res.setHeader('Content-Type', 'application/json');
        res.end(payload);
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}/mcp`, calls, close: () => server.close() };
};

describe('hook end to end against a CodeMaps-shaped server', () => {
  const closers: Array<() => void> = [];
  let stateDir = '';

  beforeEach(() => {
    // The "already reported" memory must not leak between tests or earlier runs.
    stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codemaps-hook-state-'));
  });

  afterEach(() => {
    closers.splice(0).forEach((close) => close());
    fs.rmSync(stateDir, { recursive: true, force: true });
  });

  const hookInput = (file: string) =>
    JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: file }, cwd: 'D:/proj' });

  it.each([false, true])('hands findings to Claude with exit code 2 (sse: %s)', async (sse) => {
    const fake = await startFakeCodeMaps({ projectRoot: 'D:/proj', sse, findings: [finding()] });
    closers.push(fake.close);

    const file = `D:/proj/src/Big${sse ? 'Sse' : ''}.ts`;
    const result = await run(hookInput(file), {
      CODEMAPS_MCP_URL: fake.url,
      CODEMAPS_HOOK_SETTLE_MS: '0',
      CODEMAPS_HOOK_STATE_DIR: stateDir,
    });

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('God Files');
    expect(fake.calls[0]).toMatchObject({
      name: 'validate_architecture_changes',
      arguments: { changedFiles: [file], scope: 'changed' },
    });
  });

  it('stays silent when the edit is clean', async () => {
    const fake = await startFakeCodeMaps({ projectRoot: 'D:/proj', findings: [] });
    closers.push(fake.close);

    const result = await run(hookInput('D:/proj/src/Clean.ts'), {
      CODEMAPS_MCP_URL: fake.url,
      CODEMAPS_HOOK_SETTLE_MS: '0',
      CODEMAPS_HOOK_STATE_DIR: stateDir,
    });

    expect(result).toEqual({ exitCode: 0 });
  });

  it('does not touch a different project or call validation at all', async () => {
    const fake = await startFakeCodeMaps({ projectRoot: 'D:/elsewhere', findings: [finding()] });
    closers.push(fake.close);

    const result = await run(hookInput('D:/proj/src/Big.ts'), {
      CODEMAPS_MCP_URL: fake.url,
      CODEMAPS_HOOK_SETTLE_MS: '0',
      CODEMAPS_HOOK_STATE_DIR: stateDir,
    });

    expect(result.exitCode).toBe(0);
    expect(fake.calls).toHaveLength(0);
  });

  it('stays silent when CodeMaps is not running', async () => {
    const result = await run(hookInput('D:/proj/src/Big.ts'), {
      CODEMAPS_MCP_URL: 'http://127.0.0.1:9/mcp',
      CODEMAPS_HOOK_SETTLE_MS: '0',
      CODEMAPS_HOOK_STATE_DIR: stateDir,
    });
    expect(result).toEqual({ exitCode: 0 });
  });

  it('can be switched off', async () => {
    const result = await run(hookInput('D:/proj/src/Big.ts'), { CODEMAPS_HOOK_DISABLED: '1' });
    expect(result).toEqual({ exitCode: 0 });
  });
});
