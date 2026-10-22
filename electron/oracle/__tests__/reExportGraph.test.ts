import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseFile } from '../../parsing/parseFile';
import { oracleStore } from '../../store';
import { GraphBuilder } from '../GraphBuilder';
import { normalizePath } from '../shared';

let tempDir: string;

const write = (relativePath: string, content: string) => {
  const target = path.join(tempDir, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
  return target;
};

const buildGraph = async (files: string[]) => {
  oracleStore.getState().clear();
  const builder = new GraphBuilder();
  for (const file of files) {
    builder.applyParsedFile(
      file,
      tempDir,
      0,
      await parseFile({ filePath: file, baseDir: tempDir })
    );
  }
  return oracleStore.getState().getValidGraph();
};

const id = (relativePath: string, symbol?: string) =>
  normalizePath(path.join(tempDir, relativePath)) + (symbol ? `#${symbol}` : '');

const dependentsOf = (graph: Awaited<ReturnType<typeof buildGraph>>, target: string) =>
  graph.links
    .filter((link) => link.target === target && link.type === 'import')
    .map((l) => l.source);

describe('graph links through barrel re-exports', () => {
  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codemaps-reexport-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('links an importer of `export *` barrel to the declaring symbol', async () => {
    const types = write('store/types.ts', 'export interface GraphData { nodes: string[] }\n');
    const barrel = write('store.ts', "export * from './store/types';\n");
    const consumer = write(
      'mcp/utils.ts',
      "import { GraphData } from '../store';\nexport type X = GraphData;\n"
    );

    const graph = await buildGraph([types, barrel, consumer]);

    expect(dependentsOf(graph, id('store/types.ts', 'GraphData'))).toContain(id('mcp/utils.ts'));
  });

  it('follows a named re-export with an alias', async () => {
    const impl = write('lib/impl.ts', 'export function realName() { return 1; }\n');
    const barrel = write('lib/index.ts', "export { realName as publicName } from './impl';\n");
    const consumer = write(
      'app.ts',
      "import { publicName } from './lib';\nexport const v = publicName();\n"
    );

    const graph = await buildGraph([impl, barrel, consumer]);

    expect(dependentsOf(graph, id('lib/impl.ts', 'realName'))).toContain(id('app.ts'));
  });

  it('follows chained barrels and survives a re-export cycle', async () => {
    const impl = write('a/impl.ts', 'export class Service {}\n');
    const inner = write('a/index.ts', "export * from './impl';\n");
    const outer = write('index.ts', "export * from './a';\nexport * from './index';\n");
    const consumer = write(
      'use.ts',
      "import { Service } from './index';\nexport const s = new Service();\n"
    );

    const graph = await buildGraph([impl, inner, outer, consumer]);

    expect(dependentsOf(graph, id('a/impl.ts', 'Service'))).toContain(id('use.ts'));
  });
});
