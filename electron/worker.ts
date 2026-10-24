/** Entry point of the worker-thread pool that parses source files off the main thread. */

import { parseFile } from './parsing/parseFile';
import { ParseWorkerInput } from './parsing/types';

/** Parses one file. Accepts a bare path or a full parse request and returns the parse result. */
export default async function parseWorker(input: string | ParseWorkerInput) {
  const payload = typeof input === 'string' ? { filePath: input } : input;
  return parseFile(payload);
}
