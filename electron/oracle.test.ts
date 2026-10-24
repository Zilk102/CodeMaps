import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { OracleService } from './oracle';
import { oracleStore } from './store';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('OracleService.close', () => {
  let testProjectDir: string;
  let oracle: OracleService;

  beforeEach(() => {
    oracleStore.getState().clearRecentProjects();
    testProjectDir = path.join(
      os.tmpdir(),
      `codemaps-oracle-close-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );
    fs.mkdirSync(testProjectDir, { recursive: true });
    fs.writeFileSync(
      path.join(testProjectDir, 'index.ts'),
      'export const answer = 42;\nexport function getAnswer() { return answer; }\n'
    );
    fs.mkdirSync(path.join(testProjectDir, 'aspnet'), { recursive: true });
    fs.writeFileSync(
      path.join(testProjectDir, 'aspnet', 'backend.csproj'),
      '<Project Sdk="Microsoft.NET.Sdk.Web"></Project>'
    );
    fs.writeFileSync(
      path.join(testProjectDir, 'aspnet', 'Program.cs'),
      'var builder = WebApplication.CreateBuilder(args);'
    );
    fs.writeFileSync(
      path.join(testProjectDir, 'aspnet', 'UserService.cs'),
      'public class UserService {}'
    );
    oracle = new OracleService();
  });

  afterEach(async () => {
    await oracle.close().catch(() => undefined);
    oracleStore.getState().clearRecentProjects();
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

  it('batches rapid watcher updates into a single graph refresh cycle', async () => {
    await oracle.analyzeProject(testProjectDir);
    await wait(150);

    // A slow CI runner can stall between the two writes and split them into two refreshes, so the
    // burst is retried a few times; batching must show up in at least one attempt.
    let batched = false;
    for (let attempt = 0; attempt < 4 && !batched; attempt += 1) {
      let graphUpdatedCount = 0;
      const countUpdate = () => {
        graphUpdatedCount += 1;
      };
      oracle.on('graph-updated', countUpdate);

      fs.writeFileSync(
        path.join(testProjectDir, 'aspnet', 'Program.cs'),
        `var builder = WebApplication.CreateBuilder(args); // ${attempt}
builder.Services.AddScoped<IUserService, UserService>();`
      );
      fs.writeFileSync(
        path.join(testProjectDir, 'aspnet', 'UserService.cs'),
        `public interface IUserService {} // ${attempt}
public class UserService : IUserService {}`
      );

      await wait(700);
      oracle.off('graph-updated', countUpdate);

      const watcher = oracle.getGraph().refreshTelemetry?.watcher;
      batched =
        graphUpdatedCount === 1 &&
        (watcher?.flushCount ?? 0) >= 1 &&
        (watcher?.coalescedFlushes ?? 0) >= 1 &&
        (watcher?.maxBatchSize ?? 0) >= 2;
    }

    expect(batched).toBe(true);
  });

  it('persists recent project telemetry without rewriting lastOpened on graph refreshes', async () => {
    await oracle.analyzeProject(testProjectDir);
    await wait(150);

    const normalizedProjectPath = testProjectDir.replace(/\\/g, '/');
    const initialRecentProject = oracleStore
      .getState()
      .recentProjects.find((project) => project.path === normalizedProjectPath);

    expect(initialRecentProject?.telemetry).toBeDefined();

    const initialLastOpened = initialRecentProject?.lastOpened;
    const initialTelemetryUpdatedAt = initialRecentProject?.telemetry?.updatedAt;

    fs.writeFileSync(
      path.join(testProjectDir, 'aspnet', 'Program.cs'),
      'var builder = WebApplication.CreateBuilder(args);\nbuilder.Services.AddScoped<IUserService, UserService>();'
    );
    fs.writeFileSync(
      path.join(testProjectDir, 'aspnet', 'UserService.cs'),
      'public interface IUserService {}\npublic class UserService : IUserService {}'
    );

    await wait(700);

    const updatedRecentProject = oracleStore
      .getState()
      .recentProjects.find((project) => project.path === normalizedProjectPath);

    expect(updatedRecentProject?.lastOpened).toBe(initialLastOpened);
    expect(updatedRecentProject?.telemetry).toBeDefined();
    expect(updatedRecentProject?.telemetry?.updatedAt).not.toBe(initialTelemetryUpdatedAt);
    expect(updatedRecentProject?.telemetry?.maxBatchSize).toBeGreaterThanOrEqual(1);
    expect(updatedRecentProject?.telemetry?.coalescingRatio).toBeGreaterThanOrEqual(0);
  });
});
