import * as path from 'path';
import { StackAdapterContext } from './stackTopologyTypes';

export const basename = (filePath: string) => path.basename(filePath);

export const toRelativeList = (context: StackAdapterContext, filePaths: string[]) =>
  Array.from(new Set(filePaths.map((filePath) => context.getProjectRelativePath(filePath)))).sort();

export type FileContentEntry = { filePath: string; text: string };
export type GraphSymbolIndex = Map<string, Set<string>>;

export const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const normalizeIdentifierForComparison = (value: string) =>
  value.replace(/[^A-Za-z0-9]+/g, '').toLowerCase();

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

export const toPascalCase = (parts: string[]) =>
  parts.map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join('');

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

export const matchesIdentifierVariantInText = (text: string, identifier: string) =>
  buildIdentifierVariants(identifier).some((variant) =>
    new RegExp(`\\b${escapeRegExp(variant)}\\b`, 'i').test(text)
  );

export const containsIdentifierVariantInNormalizedText = (text: string, identifier: string) => {
  const normalizedText = normalizeIdentifierForComparison(text);
  return buildIdentifierVariants(identifier)
    .map((variant) => normalizeIdentifierForComparison(variant))
    .filter(Boolean)
    .some((variant) => normalizedText.includes(variant));
};

export const findMatchingIdentifierSymbols = (symbols: string[], identifier: string) => {
  const normalizedVariants = new Set(
    buildIdentifierVariants(identifier).map((variant) => normalizeIdentifierForComparison(variant))
  );

  return symbols.filter((symbol) =>
    normalizedVariants.has(normalizeIdentifierForComparison(symbol))
  );
};

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

export const stripKnownExtension = (filePath: string) =>
  filePath.replace(/\.(tsx|ts|jsx|js|java|kt|cs)$/i, '');

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

export const inferClassSymbolsForFile = (text: string) =>
  Array.from(
    new Set(
      Array.from(text.matchAll(/\b(?:class|interface|enum|type)\s+([A-Z][A-Za-z0-9_]*)/g))
        .map((match) => match[1])
        .filter((value): value is string => Boolean(value))
    )
  );
