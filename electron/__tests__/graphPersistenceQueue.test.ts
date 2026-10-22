import { describe, expect, it } from 'vitest';
import { createSerializedPersister } from '../graphPersistence';
import type { GraphData } from '../store';

const graph = (marker: string) =>
  ({ projectRoot: marker, nodes: [], links: [] }) as unknown as GraphData;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('createSerializedPersister', () => {
  it('never runs two saves at the same time', async () => {
    let concurrent = 0;
    let maxConcurrent = 0;
    const persist = createSerializedPersister(async () => {
      concurrent += 1;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await delay(20);
      concurrent -= 1;
    });

    await Promise.all(['a', 'b', 'c', 'd', 'e'].map((marker) => persist(graph(marker))));
    await delay(150);

    expect(maxConcurrent).toBe(1);
  });

  it('writes the first graph and the latest one, skipping the stale ones in between', async () => {
    const saved: string[] = [];
    const persist = createSerializedPersister(async (graphData) => {
      await delay(30);
      saved.push(graphData.projectRoot);
    });

    const calls = ['first', 'second', 'third', 'latest'].map((marker) => persist(graph(marker)));
    await Promise.all(calls);
    await delay(200);

    expect(saved).toEqual(['first', 'latest']);
  });

  it('keeps working after a save fails', async () => {
    const saved: string[] = [];
    let attempts = 0;
    const persist = createSerializedPersister(async (graphData) => {
      attempts += 1;
      if (attempts === 1) throw new Error('disk full');
      saved.push(graphData.projectRoot);
    });

    await expect(persist(graph('one'))).rejects.toThrow('disk full');
    await persist(graph('two'));

    expect(saved).toEqual(['two']);
  });
});
