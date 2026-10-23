import { useCallback, useState } from 'react';
import { toErrorMessage } from '../components/panels/panelUtils';

/**
 * Shared loading/result/error state for the tool panels. `run` clears the previous
 * error, awaits the task, stores its result, and reports failures as a message.
 */
export function useAnalysisRunner<T>() {
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (task: () => Promise<T>, errorFallback: string) => {
    setIsRunning(true);
    setError(null);

    try {
      setResult(await task());
    } catch (err: unknown) {
      setError(toErrorMessage(err, errorFallback));
    } finally {
      setIsRunning(false);
    }
  }, []);

  return { isRunning, result, error, run };
}
