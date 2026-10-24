import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createProjectBaseline } from '../../analysis/baseline';
import { buildHeadlessGraph } from '../../guard/headlessGraph';
import { oracle } from '../../oracle';
import { ProjectIndexer } from '../../oracle/ProjectIndexer';
import { oracleStore } from '../../store';
import { createMcpServerInstance } from '../bootstrap';

const roots: string[] = [];

const SOURCE = `/** Greeting helpers of the fixture project. */

/** Greets someone; the contract is a non-empty string for every name. */
export const greet = (name: string): string => \`Hello, \${name}\`;
`;

const makeProject = (files: Record<string, string> = { 'src/greet.ts': SOURCE }): string => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codemaps-setup-iso-')).replace(/\\/g, '/');
  roots.push(root);
  for (const [relative, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
    fs.writeFileSync(path.join(root, relative), text);
  }
  return root;
};

/** Puts `root` into the app's store exactly as an opened project would be, without watchers or caches. */
const openInApp = async (root: string) => {
  const { graph } = await buildHeadlessGraph(root);
  const store = oracleStore.getState();
  store.clear();
  store.setBaseDir(root);
  store.restoreCache(graph.nodes, graph.links);
};

const setup = async (args: Record<string, unknown>) => {
  const server = createMcpServerInstance();
  const client = new Client({ name: 'claude-code', version: '1.0.0' });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  const response = await client.callTool({ name: 'setup_project', arguments: args });
  const [first] = response.content as Array<{ text: string }>;
  return JSON.parse(first.text);
};

const baselineOf = (root: string) => {
  const baseline = JSON.parse(fs.readFileSync(path.join(root, '.codemaps/baseline.json'), 'utf-8'));
  delete baseline.createdAt;
  return baseline;
};

afterEach(() => {
  vi.restoreAllMocks();
  oracleStore.getState().clear();
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('setup_project and the project open in the app', () => {
  it('configures another project without switching the open one', async () => {
    const projectA = makeProject({ 'a/a.ts': SOURCE });
    const projectB = makeProject();
    await openInApp(projectA);
    const graphBefore = oracle.getGraph();
    const recentBefore = oracleStore.getState().recentProjects;

    const result = await setup({ projectPath: projectB });

    expect(result.written).toContain('.codemaps/baseline.json');
    expect(fs.existsSync(path.join(projectB, '.codemaps/baseline.json'))).toBe(true);
    expect(fs.existsSync(path.join(projectA, '.codemaps'))).toBe(false);
    expect(oracleStore.getState().baseDir).toBe(projectA);
    expect(oracle.getGraph()).toBe(graphBefore);
    expect(oracle.getGraph().nodes.some((node) => node.id.startsWith(projectB))).toBe(false);
    expect(oracleStore.getState().recentProjects).toBe(recentBefore);
  });

  it('reuses the graph of the open project instead of indexing it again', async () => {
    const projectA = makeProject();
    await openInApp(projectA);
    const indexProject = vi.spyOn(ProjectIndexer.prototype, 'indexProject');

    const result = await setup({ projectPath: projectA });

    expect(result.written).toContain('.codemaps/baseline.json');
    expect(indexProject).not.toHaveBeenCalled();
    expect(oracleStore.getState().baseDir).toBe(projectA);
  });

  it('writes the files and baseline the headless guard sees', async () => {
    const files = { 'src/greet.ts': SOURCE, 'src/other.ts': `export const x = 1;\n` };
    const viaTool = makeProject(files);
    const viaGuard = makeProject(files);

    const result = await setup({ projectPath: viaTool });
    await createProjectBaseline((await buildHeadlessGraph(viaGuard)).graph);

    expect(oracleStore.getState().baseDir).toBe('');
    expect(result.baseline.status).toBe('created');
    expect(baselineOf(viaTool)).toEqual(baselineOf(viaGuard));
  });
});
