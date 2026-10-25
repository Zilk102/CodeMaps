// Guards file discovery: dependency folders under any name (vendored `node_modules-local`, pnpm
// stores) and build artifacts must never reach the graph, while project sources must.
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { discoverProjectFiles } from '../ProjectIndexer';

let projectRoot = '';

const write = async (relativePath: string) => {
  const absolutePath = path.join(projectRoot, relativePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, 'export const x = 1;\n');
};

const discoveredRelativePaths = async () => {
  const files = await discoverProjectFiles(projectRoot);
  return files
    .map((file) => file.replace(/\\/g, '/').slice(projectRoot.replace(/\\/g, '/').length + 1))
    .sort();
};

beforeEach(async () => {
  projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'codemaps-discovery-'));
});

afterEach(async () => {
  await fs.rm(projectRoot, { recursive: true, force: true });
});

describe('discoverProjectFiles', () => {
  it('keeps project sources', async () => {
    await write('src/app.ts');
    await write('apps/api/src/server.ts');
    await write('docs/README.md');

    expect(await discoveredRelativePaths()).toEqual([
      'apps/api/src/server.ts',
      'docs/README.md',
      'src/app.ts',
    ]);
  });

  it('skips vendored dependency folders such as node_modules-local', async () => {
    await write('src/app.ts');
    await write('node_modules-local/eslint/lib/rules/no-in.js');
    await write('apps/api/node_modules-local/@nestjs/core/index.ts');
    await write('packages/ui/node_modules/typescript/lib/tsc.js');

    expect(await discoveredRelativePaths()).toEqual(['src/app.ts']);
  });

  it('skips build output, source maps and pnpm stores', async () => {
    await write('src/app.ts');
    await write('dist/bundle.js');
    await write('apps/web/playwright-report/index.html');
    await write('src/app.ts.map');
    await write('.pnpm-local/store/pkg/index.js');

    expect(await discoveredRelativePaths()).toEqual(['src/app.ts']);
  });
});
