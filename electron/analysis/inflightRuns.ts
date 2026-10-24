/** Deduplicates concurrent async computations by key. */

/**
 * Shares one running computation per key: a second request that arrives while the first is still
 * working gets the same promise instead of starting a second scan of the project.
 */
export class InflightRuns<T> {
  private readonly running = new Map<string, Promise<T>>();

  /** The running computation for `key`, or a new one started by `start`. */
  run(key: string, start: () => Promise<T>): Promise<T> {
    const existing = this.running.get(key);
    if (existing) return existing;
    const work = start().finally(() => {
      this.running.delete(key);
    });
    this.running.set(key, work);
    return work;
  }
}
