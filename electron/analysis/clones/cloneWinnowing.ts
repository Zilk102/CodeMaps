import type { TokenStream } from './tokenize';

const BASE = 1_000_003;

/** Hash of every `gram`-token window of one stream. */
export const rollingHashes = (ids: Int32Array, gram: number): Int32Array => {
  const count = Math.max(0, ids.length - gram + 1);
  const hashes = new Int32Array(count);
  if (count === 0) return hashes;
  let power = 1;
  for (let index = 1; index < gram; index += 1) power = Math.imul(power, BASE);
  let hash = 0;
  for (let index = 0; index < gram; index += 1) hash = (Math.imul(hash, BASE) + ids[index]) | 0;
  hashes[0] = hash;
  for (let start = 1; start < count; start += 1) {
    hash = (hash - Math.imul(ids[start - 1], power)) | 0;
    hash = (Math.imul(hash, BASE) + ids[start + gram - 1]) | 0;
    hashes[start] = hash;
  }
  return hashes;
};

/** Winnowing: keep the minimum hash of each window, so any long enough match shares a kept hash. */
export const selectPositions = (hashes: Int32Array, window: number): number[] => {
  const selected: number[] = [];
  let last = -1;
  const span = Math.min(window, hashes.length);
  for (let start = 0; start + span <= hashes.length; start += 1) {
    let best = start;
    for (let offset = 1; offset < span; offset += 1) {
      if (hashes[start + offset] <= hashes[best]) best = start + offset;
    }
    if (best !== last) {
      selected.push(best);
      last = best;
    }
  }
  return selected;
};

/** Tokens as integers, so hashing and comparing them is cheap. */
export const internStreams = (streams: TokenStream[]) => {
  const vocabulary = new Map<string, number>();
  const ids = streams.map((stream) => {
    const array = new Int32Array(stream.tokens.length);
    stream.tokens.forEach((token, index) => {
      let id = vocabulary.get(token);
      if (id === undefined) {
        id = vocabulary.size + 1;
        vocabulary.set(token, id);
      }
      array[index] = id;
    });
    return array;
  });
  return { ids, vocabulary };
};

/** Winnowed n-gram hash -> flattened (stream, position) occurrences. */
export const collectBuckets = (
  ids: Int32Array[],
  options: { gram: number; window: number }
): Map<number, number[]> => {
  const buckets = new Map<number, number[]>();
  ids.forEach((array, streamIndex) => {
    const hashes = rollingHashes(array, options.gram);
    for (const position of selectPositions(hashes, options.window)) {
      const key = hashes[position];
      const bucket = buckets.get(key);
      if (bucket) bucket.push(streamIndex, position);
      else buckets.set(key, [streamIndex, position]);
    }
  });
  return buckets;
};
