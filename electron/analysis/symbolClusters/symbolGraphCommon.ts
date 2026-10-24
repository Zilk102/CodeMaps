export const MAX_SYMBOLS = 800;
export const MAX_USES = 80;

/** Number of lines from `startLine` to `endLine` inclusive, at least 1. */
export const lineCountOf = (startLine: number, endLine: number) =>
  Math.max(1, endLine - startLine + 1);
