import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { OracleService } from './oracle';

describe('OracleService.close', () => {
  let testProjectDir: string;
  let oracle: OracleService;

  beforeEach(() => {
    testProjectDir = path.join(os.tmpdir(), `codemaps-oracle-close-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    fs.mkdirSync(testProjectDir, { recursive: true });
    fs.writeFileSync(
      path.join(testProjectDir, 'index.ts'),
      "export const answer = 42;\nexport function getAnswer() { return answer; }\n"
    );
    oracle = new OracleService();
  });

  afterEach(async () => {
    await oracle.close().catch(() => undefined);
    if (fs.existsSync(testProjectDir)) {
      fs.rmSync(testProjectDir, { recursive: true, force: true });
    }
  });

  it('stops watcher, clears pending timeouts and is idempotent', async () => {
    await oracle.analyzeProject(testProjectDir);

    const oracleInternal = oracle as unknown as {
      fileWatcher: { watcher: unknown | null };
      cacheManager: { saveTimeout: ReturnType<typeof setTimeout> | null };
      parsingProgressResetTimeout: ReturnType<typeof setTimeout> | null;
      shutdownPromise: Promise<void> | null;
      listenerCount: (eventName: string) => number;
    };

    expect(oracleInternal.fileWatcher.watcher).not.toBeNull();
    expect(oracleInternal.cacheManager.saveTimeout).not.toBeNull();
    expect(oracleInternal.parsingProgressResetTimeout).not.toBeNull();

    oracle.on('graph-updated', () => {});
    oracle.on('parsing-progress', () => {});
    expect(oracleInternal.listenerCount('graph-updated')).toBeGreaterThan(0);
    expect(oracleInternal.listenerCount('parsing-progress')).toBeGreaterThan(0);

    await oracle.close();

    expect(oracleInternal.fileWatcher.watcher).toBeNull();
    expect(oracleInternal.cacheManager.saveTimeout).toBeNull();
    expect(oracleInternal.parsingProgressResetTimeout).toBeNull();
    expect(oracleInternal.listenerCount('graph-updated')).toBe(0);
    expect(oracleInternal.listenerCount('parsing-progress')).toBe(0);
    expect(oracleInternal.shutdownPromise).not.toBeNull();

    await expect(oracle.close()).resolves.toBeUndefined();
  });
});
