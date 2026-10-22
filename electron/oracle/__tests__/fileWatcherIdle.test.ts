import { describe, expect, it } from 'vitest';
import { FileWatcher } from '../FileWatcher';

type TestableWatcher = {
  track: <T>(work: () => Promise<T>) => Promise<T>;
  whenIdle: (graceMs?: number) => Promise<void>;
  scheduleRefresh: (
    baseDir: string,
    callbacks: {
      refreshStackGraphEnrichment: (paths: string[], event: string) => Promise<void>;
      emitGraphUpdated: () => void;
    },
    changedPaths: string[],
    event: string
  ) => Promise<void>;
};

const createWatcher = () =>
  new FileWatcher(
    {} as never,
    {} as never,
    { saveDebounced: () => undefined } as never
  ) as unknown as TestableWatcher;

describe('FileWatcher.whenIdle', () => {
  it('resolves immediately when nothing is pending', async () => {
    const started = Date.now();
    await createWatcher().whenIdle(0);
    expect(Date.now() - started).toBeLessThan(200);
  });

  it('waits for a refresh that is still running before resolving', async () => {
    const watcher = createWatcher();
    let finished = false;

    const scheduled = watcher.scheduleRefresh(
      'D:/proj',
      {
        refreshStackGraphEnrichment: async () => {
          await new Promise((resolve) => setTimeout(resolve, 250));
          finished = true;
        },
        emitGraphUpdated: () => undefined,
      },
      ['D:/proj/a.ts'],
      'change'
    );

    await watcher.whenIdle(0);

    expect(finished).toBe(true);
    await scheduled;
  });

  it('waits for a file that is still being parsed', async () => {
    const watcher = createWatcher();
    let parsed = false;

    const handler = watcher.track(async () => {
      await new Promise((resolve) => setTimeout(resolve, 250));
      parsed = true;
    });

    await watcher.whenIdle(0);

    expect(parsed).toBe(true);
    await handler;
  });

  it('does not hang when the refresh fails', async () => {
    const watcher = createWatcher();

    const scheduled = watcher
      .scheduleRefresh(
        'D:/proj',
        {
          refreshStackGraphEnrichment: async () => {
            throw new Error('index failed');
          },
          emitGraphUpdated: () => undefined,
        },
        ['D:/proj/a.ts'],
        'change'
      )
      .catch(() => undefined);

    await expect(watcher.whenIdle(0)).resolves.toBeUndefined();
    await scheduled;
  });
});
