import { parseFile } from './parsing/parseFile';
import { ParseWorkerInput } from './parsing/types';

export default async function parseWorker(input: string | ParseWorkerInput) {
  const payload = typeof input === 'string' ? { filePath: input } : input;
  return parseFile(payload);
}
