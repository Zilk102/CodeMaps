import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, describe, expect, it } from 'vitest';
import { createMcpServerInstance } from '../bootstrap';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

const connect = async (clientName: string) => {
  const server = createMcpServerInstance();
  const client = new Client({ name: clientName, version: '1.0.0' });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  return client;
};

const call = async (client: Client, args: Record<string, unknown>) => {
  const response = await client.callTool({ name: 'setup_project', arguments: args });
  const [first] = response.content as Array<{ text: string }>;
  return JSON.parse(first.text);
};

describe('setup_project over MCP', () => {
  it('shows the instructions to the client on connect', async () => {
    const client = await connect('claude-code');
    expect(client.getInstructions()).toContain('setup_project');
  });

  it('plans the files of the calling client in a dry run and writes nothing', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codemaps-mcp-setup-'));
    roots.push(root);
    const client = await connect('cursor');

    const result = await call(client, { projectPath: root, apply: false });

    expect(result.status).toBe('dry-run');
    expect(result.detected.agents.fromClient).toBe('cursor');
    expect(result.wouldWrite.map((file: { path: string }) => file.path)).toContain(
      '.cursor/rules/codemaps.mdc'
    );
    expect(fs.readdirSync(root)).toEqual([]);
  });

  it('rejects a project path that does not exist', async () => {
    const client = await connect('claude-code');
    const response = await client.callTool({
      name: 'setup_project',
      arguments: { projectPath: path.join(os.tmpdir(), 'codemaps-does-not-exist-xyz') },
    });
    expect(response.isError).toBe(true);
  });
});
