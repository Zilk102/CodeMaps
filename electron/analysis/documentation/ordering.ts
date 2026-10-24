/**
 * Locale-independent ordering, so the same project yields byte-identical reports on every machine.
 */

/** Compares two strings by code unit, which never depends on the user's locale. */
export const compareText = (a: string, b: string): number => {
  if (a === b) return 0;
  return a < b ? -1 : 1;
};
