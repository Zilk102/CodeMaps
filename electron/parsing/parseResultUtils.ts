// Helpers shared by the parse adapters: the empty result and ADR comment detection.

import { ParseResult } from './types';

/**
 * A parse result with nothing found, for files that are unsupported, skipped or failed to parse.
 */
export const createEmptyParseResult = (detectedLanguage?: string, adr?: string): ParseResult => ({
  sizeExceeded: false,
  imports: [],
  entities: [],
  exports: [],
  adr,
  variables: [],
  calls: [],
  comments: [],
  detectedLanguage,
});

/**
 * Reference to an architecture decision record in a source comment (`@adr <id>` or `ADR: <id>`,
 * behind `//`, `#`, `/*` or `*`). Returns the trimmed text after the marker, or undefined.
 */
export const extractAdrReference = (text: string) => {
  const adrMatch =
    text.match(/^\s*(?:\/\/\s*|#\s*|\/\*\s*|\*\s*)@adr\s+(.+)$/im) ||
    text.match(/^\s*(?:\/\/\s*|#\s*|\/\*\s*|\*\s*)ADR:\s+(.+)$/im);

  return adrMatch ? adrMatch[1].trim() : undefined;
};
