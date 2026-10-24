/**
 * Helpers to compare identifiers across naming styles (camelCase, snake_case, kebab-case, ...) and
 * to guess the symbols a file defines, used to link files to symbols by name.
 */
import * as path from 'path';
import { StackAdapterContext } from './stackTopologyTypes';

/** File name with its extension, without directories. */
export const basename = (filePath: string) => path.basename(filePath);

/** Sorted, deduplicated project-root-relative paths of the given absolute paths. */
export const toRelativeList = (context: StackAdapterContext, filePaths: string[]) =>
  Array.from(new Set(filePaths.map((filePath) => context.getProjectRelativePath(filePath)))).sort();

/** A file path with the text of that file. */
export type FileContentEntry = { filePath: string; text: string };
/** Maps a file path to the names of the graph symbols declared in it. */
export type GraphSymbolIndex = Map<string, Set<string>>;

/** Escapes regex metacharacters so the text matches literally inside a RegExp. */
export const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Lower-cased identifier with everything but letters and digits removed, so `user_id`, `UserId` and `user-id` compare equal.
 */
export const normalizeIdentifierForComparison = (value: string) =>
  value.replace(/[^A-Za-z0-9]+/g, '').toLowerCase();

/**
 * Lower-case words of an identifier, splitting on camelCase humps, acronyms and non-alphanumeric separators.
 */
export const splitIdentifierWords = (value: string) =>
  value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/g)
    .flatMap((part) =>
      part
        .split(/(?<=[A-Z])(?=[A-Z][a-z])|(?<=[a-z])(?=[A-Z])/g)
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean)
    );

/** Joins words into PascalCase. */
export const toPascalCase = (parts: string[]) =>
  parts.map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join('');

/**
 * Spellings of an identifier in the common naming styles (as written, snake, kebab, Pascal, camel, flat lower), without duplicates.
 */
export const buildIdentifierVariants = (value: string) => {
  const trimmed = value.trim();
  const words = splitIdentifierWords(trimmed);
  const variants = new Set<string>([trimmed]);

  if (words.length > 0) {
    const snakeCase = words.join('_');
    const kebabCase = words.join('-');
    const pascalCase = toPascalCase(words);
    const camelCase = `${words[0]}${words
      .slice(1)
      .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
      .join('')}`;
    const flatLower = words.join('');

    [snakeCase, kebabCase, pascalCase, camelCase, flatLower].forEach((candidate) => {
      if (candidate) {
        variants.add(candidate);
      }
    });
  }

  return Array.from(variants);
};

/** Whether any naming variant of `identifier` occurs in `text` as a whole word, ignoring case. */
export const matchesIdentifierVariantInText = (text: string, identifier: string) =>
  buildIdentifierVariants(identifier).some((variant) =>
    new RegExp(`\\b${escapeRegExp(variant)}\\b`, 'i').test(text)
  );

/**
 * Whether `text` contains any naming variant of `identifier` once separators and case are ignored on both sides (a substring match).
 */
export const containsIdentifierVariantInNormalizedText = (text: string, identifier: string) => {
  const normalizedText = normalizeIdentifierForComparison(text);
  return buildIdentifierVariants(identifier)
    .map((variant) => normalizeIdentifierForComparison(variant))
    .filter(Boolean)
    .some((variant) => normalizedText.includes(variant));
};

/** Symbols that equal `identifier` in some naming style, compared without separators and case. */
export const findMatchingIdentifierSymbols = (symbols: string[], identifier: string) => {
  const normalizedVariants = new Set(
    buildIdentifierVariants(identifier).map((variant) => normalizeIdentifierForComparison(variant))
  );

  return symbols.filter((symbol) =>
    normalizedVariants.has(normalizeIdentifierForComparison(symbol))
  );
};

/**
 * Symbols whose normalized name contains a naming variant of `identifier`, for example `UserService` for `user`.
 */
export const findContainingIdentifierSymbols = (symbols: string[], identifier: string) => {
  const normalizedVariants = Array.from(
    new Set(
      buildIdentifierVariants(identifier).map((variant) =>
        normalizeIdentifierForComparison(variant)
      )
    )
  ).filter(Boolean);

  return symbols.filter((symbol) => {
    const normalizedSymbol = normalizeIdentifierForComparison(symbol);
    return normalizedVariants.some((variant) => normalizedSymbol.includes(variant));
  });
};

/** Removes a trailing .ts, .tsx, .js, .jsx, .java, .kt or .cs extension. */
export const stripKnownExtension = (filePath: string) =>
  filePath.replace(/\.(tsx|ts|jsx|js|java|kt|cs)$/i, '');

/**
 * Guesses the symbols a file declares: its base name, capitalized class/interface/enum/type names and capitalized exported classes, functions and constants.
 */
export const inferSymbolsForFile = (filePath: string, text: string) => {
  const symbols = new Set<string>();
  const baseName = basename(stripKnownExtension(filePath));

  if (baseName) {
    symbols.add(baseName);
  }

  for (const match of text.matchAll(/\b(?:class|interface|enum|type)\s+([A-Z][A-Za-z0-9_]*)/g)) {
    if (match[1]) {
      symbols.add(match[1]);
    }
  }

  for (const match of text.matchAll(
    /\bexport\s+(?:default\s+)?(?:class|function|const)\s+([A-Z][A-Za-z0-9_]*)/g
  )) {
    if (match[1]) {
      symbols.add(match[1]);
    }
  }

  return Array.from(symbols);
};

/** Capitalized class, interface, enum and type names declared in `text`, without duplicates. */
export const inferClassSymbolsForFile = (text: string) =>
  Array.from(
    new Set(
      Array.from(text.matchAll(/\b(?:class|interface|enum|type)\s+([A-Z][A-Za-z0-9_]*)/g))
        .map((match) => match[1])
        .filter((value): value is string => Boolean(value))
    )
  );
