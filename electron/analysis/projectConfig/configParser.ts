/**
 * Turns the parsed content of a config file into a `ProjectConfig`, field by field.
 *
 * The parser never throws and never rejects the file as a whole: a field that is missing or
 * invalid falls back to its default and adds one warning, so a typo in one place cannot switch
 * off the rest of the configuration.
 */
import {
  DEFAULT_PROJECT_CONFIG,
  type DocumentationSettings,
  type ProjectConfig,
  type ProjectMode,
  type QualityThresholds,
} from './types';

/** The configuration read from a file and the warnings collected on the way. */
export interface ParsedProjectConfig {
  config: ProjectConfig;
  warnings: string[];
}

const KNOWN_KEYS = ['version', 'mode', 'exclude', 'thresholds', 'documentation'];
const MODES: readonly ProjectMode[] = ['ratchet', 'strict'];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isPositiveInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0;

/** Reads a nested object, warning when the key is present but not an object. */
const sectionOf = (
  raw: Record<string, unknown>,
  key: string,
  warnings: string[]
): Record<string, unknown> => {
  const value = raw[key];
  if (value === undefined) return {};
  if (isRecord(value)) return value;
  warnings.push(`"${key}" must be an object; using defaults.`);
  return {};
};

const parseMode = (raw: Record<string, unknown>, warnings: string[]): ProjectMode => {
  const value = raw.mode;
  if (value === undefined) return DEFAULT_PROJECT_CONFIG.mode;
  if (MODES.includes(value as ProjectMode)) return value as ProjectMode;
  warnings.push(`"mode" must be "ratchet" or "strict"; using "${DEFAULT_PROJECT_CONFIG.mode}".`);
  return DEFAULT_PROJECT_CONFIG.mode;
};

/** Reads the exclusion globs; entries that are not non-empty strings are dropped with a warning. */
const parseExclude = (raw: Record<string, unknown>, warnings: string[]): string[] => {
  const value = raw.exclude;
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    warnings.push('"exclude" must be an array of glob strings; ignoring it.');
    return [];
  }
  const globs = value.filter(
    (item): item is string => typeof item === 'string' && item.trim() !== ''
  );
  if (globs.length !== value.length) {
    warnings.push('"exclude" holds entries that are not non-empty strings; they were ignored.');
  }
  return globs;
};

/** Reads the positive integer at `key`, or reports why the default is used instead. */
const readPositiveInteger = (
  section: Record<string, unknown>,
  path: string,
  key: string,
  warnings: string[]
): number | undefined => {
  const value = section[key];
  if (value === undefined) return undefined;
  if (isPositiveInteger(value)) return value;
  warnings.push(`"${path}.${key}" must be a positive integer; using the default.`);
  return undefined;
};

/**
 * Reads the three function thresholds. Returns the resolved values and the subset the file wrote
 * itself, because only written thresholds replace CodeMaps' built-in limits.
 */
const parseThresholds = (
  raw: Record<string, unknown>,
  warnings: string[]
): { thresholds: QualityThresholds; explicit: Partial<QualityThresholds> } => {
  const section = sectionOf(raw, 'thresholds', warnings);
  const explicit: Partial<QualityThresholds> = {};
  for (const key of Object.keys(DEFAULT_PROJECT_CONFIG.thresholds) as Array<
    keyof QualityThresholds
  >) {
    const value = readPositiveInteger(section, 'thresholds', key, warnings);
    if (value !== undefined) explicit[key] = value;
  }
  return { thresholds: { ...DEFAULT_PROJECT_CONFIG.thresholds, ...explicit }, explicit };
};

/** Reads the documentation settings; each invalid field falls back to its default with a warning. */
const parseDocumentation = (
  raw: Record<string, unknown>,
  warnings: string[]
): DocumentationSettings => {
  const section = sectionOf(raw, 'documentation', warnings);
  const defaults = DEFAULT_PROJECT_CONFIG.documentation;
  if (section.enabled !== undefined && typeof section.enabled !== 'boolean') {
    warnings.push('"documentation.enabled" must be true or false; using the default.');
  }
  return {
    enabled: typeof section.enabled === 'boolean' ? section.enabled : defaults.enabled,
    headerMinLines:
      readPositiveInteger(section, 'documentation', 'headerMinLines', warnings) ??
      defaults.headerMinLines,
    functionMinLines:
      readPositiveInteger(section, 'documentation', 'functionMinLines', warnings) ??
      defaults.functionMinLines,
  };
};

/** Warnings about a version this build does not know and about keys nobody reads. */
const structuralWarnings = (raw: Record<string, unknown>): string[] => {
  const warnings: string[] = [];
  if (raw.version !== undefined && raw.version !== 1) {
    warnings.push(`Unsupported config "version" ${JSON.stringify(raw.version)}; reading it as 1.`);
  }
  const unknown = Object.keys(raw).filter((key) => !KNOWN_KEYS.includes(key));
  if (unknown.length > 0) warnings.push(`Unknown config key(s) ignored: ${unknown.join(', ')}.`);
  return warnings;
};

/**
 * Resolves a parsed config file. A value that is not an object (an array, a number, `null`)
 * yields the defaults and one warning.
 */
export const parseProjectConfig = (raw: unknown): ParsedProjectConfig => {
  if (!isRecord(raw)) {
    return {
      config: { ...DEFAULT_PROJECT_CONFIG },
      warnings: ['The config file must contain a JSON object; using defaults.'],
    };
  }
  const warnings = structuralWarnings(raw);
  const { thresholds, explicit } = parseThresholds(raw, warnings);
  const config: ProjectConfig = {
    version: 1,
    mode: parseMode(raw, warnings),
    exclude: parseExclude(raw, warnings),
    thresholds,
    documentation: parseDocumentation(raw, warnings),
    explicitThresholds: explicit,
  };
  return { config, warnings };
};
