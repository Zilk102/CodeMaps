import { ParseResult } from './types';

export const createEmptyParseResult = (
  detectedLanguage?: string,
  adr?: string
): ParseResult => ({
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

export const extractAdrReference = (text: string) => {
  const adrMatch =
    text.match(/^\s*(?:\/\/\s*|#\s*|\/\*\s*|\*\s*)@adr\s+(.+)$/im) ||
    text.match(/^\s*(?:\/\/\s*|#\s*|\/\*\s*|\*\s*)ADR:\s+(.+)$/im);

  return adrMatch ? adrMatch[1].trim() : undefined;
};
