/**
 * A per-project queue for `setup_project`. Two agents calling the tool for the same project at the
 * same moment must not interleave their reads and writes; the second call waits, then finds
 * everything up to date and writes nothing. Different projects never wait for each other.
 */

const tails = new Map<string, Promise<unknown>>();

/**
 * Runs `task` after every earlier task with the same `key` has finished, whether it succeeded or
 * not. The returned promise settles with the task's own result or error.
 */
export const withProjectLock = async <T>(key: string, task: () => Promise<T>): Promise<T> => {
  const previous = tails.get(key) ?? Promise.resolve();
  const run = previous.then(task, task);
  const tail = run.catch(() => undefined);
  tails.set(key, tail);
  try {
    return await run;
  } finally {
    if (tails.get(key) === tail) tails.delete(key);
  }
};
