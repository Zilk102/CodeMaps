/** Evaluates catalog detection rules against a project and returns the evidence they found. */
import { StackDetectionRule } from './stackCatalog';
import {
  includesCaseInsensitive,
  JsonRecord,
  readJsonField,
  StackDetectionContext,
} from './stackDetectionContext';

/** Evidence strings one detection rule finds in the project; empty when it does not match. */
export async function evaluateStackRule(
  context: StackDetectionContext,
  rule: StackDetectionRule
): Promise<string[]> {
  switch (rule.type) {
    case 'relative_path':
      return evidenceFor(rule.anyOf, (c) => context.hasRelativePath(c), 'file');
    case 'basename':
      return evidenceFor(rule.anyOf, (c) => context.hasBasename(c), 'file');
    case 'suffix':
      return evidenceFor(rule.anyOf, (c) => context.hasSuffix(c), 'suffix');
    case 'json_dependency':
      return evaluateJsonDependency(context, rule);
    case 'json_field_includes':
      return evaluateJsonFieldIncludes(context, rule);
    case 'text_contains':
      return evaluateTextContains(context, rule);
    case 'text_contains_in_suffix':
      return evaluateTextContainsInSuffix(context, rule);
    default:
      return [];
  }
}

type RuleOf<T extends StackDetectionRule['type']> = Extract<StackDetectionRule, { type: T }>;

const evidenceFor = (
  candidates: string[],
  matches: (candidate: string) => boolean,
  prefix: string
): string[] =>
  candidates.filter((candidate) => matches(candidate)).map((candidate) => `${prefix}:${candidate}`);

/**
 * Evidence for each listed dependency name found as a key in any of the manifest's sections (for example `devDependencies`).
 */
async function evaluateJsonDependency(
  context: StackDetectionContext,
  rule: RuleOf<'json_dependency'>
): Promise<string[]> {
  const manifest = await context.readJsonByRelativePath(rule.file);
  if (!manifest) {
    return [];
  }

  const matches: string[] = [];
  for (const section of rule.sections) {
    const value = readJsonField(manifest, section);
    if (!value || typeof value !== 'object') {
      continue;
    }

    const keys = Object.keys(value as JsonRecord);
    for (const candidate of rule.anyOf) {
      if (keys.includes(candidate)) {
        matches.push(`dependency:${rule.file}:${section}:${candidate}`);
      }
    }
  }
  return matches;
}

/**
 * Evidence for each candidate contained, ignoring case, in a string field of a JSON manifest; non-string fields never match.
 */
async function evaluateJsonFieldIncludes(
  context: StackDetectionContext,
  rule: RuleOf<'json_field_includes'>
): Promise<string[]> {
  const manifest = await context.readJsonByRelativePath(rule.file);
  if (!manifest) {
    return [];
  }

  const fieldValue = readJsonField(manifest, rule.field);
  if (typeof fieldValue !== 'string') {
    return [];
  }

  return evidenceFor(
    rule.anyOf,
    (candidate) => includesCaseInsensitive(fieldValue, candidate),
    `field:${rule.file}:${rule.field}`
  );
}

/** Evidence for each candidate contained, ignoring case, in the text of one root-level file. */
async function evaluateTextContains(
  context: StackDetectionContext,
  rule: RuleOf<'text_contains'>
): Promise<string[]> {
  const text = await context.readTextByRelativePath(rule.file);
  if (!text) {
    return [];
  }

  return evidenceFor(
    rule.anyOf,
    (candidate) => includesCaseInsensitive(text, candidate),
    `text:${rule.file}`
  );
}

/**
 * Evidence for each candidate contained, ignoring case, in at least one file with one of the given suffixes.
 */
async function evaluateTextContainsInSuffix(
  context: StackDetectionContext,
  rule: RuleOf<'text_contains_in_suffix'>
): Promise<string[]> {
  const texts = (
    await Promise.all(rule.suffixes.map((suffix) => context.readTextsBySuffix(suffix)))
  ).flat();

  return evidenceFor(
    rule.anyOf,
    (candidate) => texts.some((text) => text && includesCaseInsensitive(text, candidate)),
    'text-suffix'
  );
}
