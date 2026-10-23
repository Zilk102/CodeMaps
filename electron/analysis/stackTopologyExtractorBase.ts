export const extractMethodNames = (text: string, patterns: RegExp[]) => {
  const names = new Set<string>();

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      if (match[1]) {
        names.add(match[1]);
      }
    }
  }

  return Array.from(names).sort();
};

/** The first capture group of every match of every pattern, without duplicates, in match order. */
export const uniqueCaptures = (text: string, patterns: RegExp[]): string[] =>
  Array.from(
    new Set(
      patterns.flatMap((pattern) =>
        Array.from(text.matchAll(pattern), (match) => match[1]).filter((value): value is string =>
          Boolean(value)
        )
      )
    )
  );
