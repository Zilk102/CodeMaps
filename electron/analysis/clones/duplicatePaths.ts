export const toPosix = (value: string) => value.replace(/\\/g, '/');

/** `file` relative to `root` with forward slashes; unchanged when it lies outside the root. */
export const relativeToRoot = (root: string, file: string): string => {
  const normalizedRoot = toPosix(root).replace(/\/$/, '');
  const normalized = toPosix(file);
  return normalizedRoot && normalized.toLowerCase().startsWith(`${normalizedRoot.toLowerCase()}/`)
    ? normalized.slice(normalizedRoot.length + 1)
    : normalized;
};
