import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { FileWatcher } from '../FileWatcher';

const waitFor = async (condition: () => boolean, timeoutMs: number) => {
  const deadline = Date.now() + timeoutMs;
  while (!condition() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return condition();
};

describe('FileWatcher.start', () => {
  let projectDir: string | null = null;
  let watcher: FileWatcher | null = null;

  afterEach(async () => {
    await watcher?.close();
    watcher = null;
    if (projectDir) fs.rmSync(projectDir, { recursive: true, force: true });
    projectDir = null;
  });

  it('is live as soon as it resolves: a file saved right after start is not missed', async () => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codemaps-watch-'));
    fs.writeFileSync(path.join(projectDir, 'existing.ts'), 'export const a = 1;\n');

    const reindexed: string[] = [];
    watcher = new FileWatcher(
      {
        reindexFile: async (filePath: string) => {
          reindexed.push(path.basename(filePath));
        },
      } as never,
      { removeFile: () => undefined, ensureDirectoryChainForFile: () => undefined } as never,
      { saveDebounced: () => undefined } as never
    );

    await watcher.start(
      projectDir,
      () => ({ languageFileCounts: {}, activeLanguageIds: [] }),
      () => undefined,
      {
        refreshStackGraphEnrichment: async () => undefined,
        emitGraphUpdated: () => undefined,
      }
    );

    // No pause between start() resolving and the save: this is what an agent does.
    fs.writeFileSync(path.join(projectDir, 'created-right-after.ts'), 'export const b = 2;\n');

    expect(await waitFor(() => reindexed.includes('created-right-after.ts'), 5000)).toBe(true);
  });
});
