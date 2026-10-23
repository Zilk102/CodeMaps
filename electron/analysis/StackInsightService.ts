import * as fs from 'fs/promises';
import * as path from 'path';
import { GraphData } from '../store/types';
import {
  BUILTIN_STACK_DEFINITIONS,
  StackCategory,
  StackConfidence,
  StackDefinition,
  StackDetectionRule,
} from './stackCatalog';

export interface DetectedStack {
  id: string;
  displayName: string;
  category: StackCategory;
  ecosystem: string;
  confidence: StackConfidence;
  evidence: string[];
}

export interface StackInsightResult {
  packageManagers: DetectedStack[];
  buildSystems: DetectedStack[];
  frameworks: DetectedStack[];
}

type JsonRecord = Record<string, unknown>;

class StackDetectionContext {
  private readonly rootRelativeToAbsolute = new Map<string, string>();
  private readonly basenames = new Map<string, string[]>();
  private readonly rootSuffixMatches = new Map<string, string[]>();
  private readonly reader = new CachedFileReader();

  constructor(private readonly graph: GraphData) {
    for (const node of graph.nodes) {
      if (node.type !== 'file') {
        continue;
      }

      const absolutePath = node.id;
      const relativePath = this.toProjectRelativePath(absolutePath);
      this.rootRelativeToAbsolute.set(relativePath, absolutePath);

      const basename = path.basename(relativePath).toLowerCase();
      const current = this.basenames.get(basename) || [];
      current.push(absolutePath);
      this.basenames.set(basename, current);
    }
  }

  private toProjectRelativePath(filePath: string) {
    return path.relative(this.graph.projectRoot, filePath).replace(/\\/g, '/').toLowerCase();
  }

  hasRelativePath(relativePath: string) {
    return this.rootRelativeToAbsolute.has(relativePath.toLowerCase());
  }

  hasBasename(basename: string) {
    return this.basenames.has(basename.toLowerCase());
  }

  hasSuffix(suffix: string) {
    return this.findBySuffix(suffix).length > 0;
  }

  findBySuffix(suffix: string) {
    const normalizedSuffix = suffix.toLowerCase();
    if (this.rootSuffixMatches.has(normalizedSuffix)) {
      return this.rootSuffixMatches.get(normalizedSuffix)!;
    }

    const matches = Array.from(this.rootRelativeToAbsolute.entries())
      .filter(([relativePath]) => relativePath.endsWith(normalizedSuffix))
      .map(([, absolutePath]) => absolutePath);

    this.rootSuffixMatches.set(normalizedSuffix, matches);
    return matches;
  }

  async readTextByRelativePath(relativePath: string) {
    const absolutePath = this.rootRelativeToAbsolute.get(relativePath.toLowerCase());
    if (!absolutePath) {
      return null;
    }

    return this.readText(absolutePath);
  }

  async readTextsBySuffix(suffix: string) {
    const matches = this.findBySuffix(suffix);
    return Promise.all(matches.map((absolutePath) => this.readText(absolutePath)));
  }

  async readJsonByRelativePath(relativePath: string) {
    const absolutePath = this.rootRelativeToAbsolute.get(relativePath.toLowerCase());
    if (!absolutePath) {
      return null;
    }

    return this.reader.readJson(absolutePath);
  }

  private readText(absolutePath: string): Promise<string | null> {
    return this.reader.readText(absolutePath);
  }
}

/** Reads files once and caches both the raw text and the parsed JSON. */
class CachedFileReader {
  private readonly textCache = new Map<string, Promise<string | null>>();
  private readonly jsonCache = new Map<string, Promise<JsonRecord | null>>();

  readText(absolutePath: string): Promise<string | null> {
    if (!this.textCache.has(absolutePath)) {
      this.textCache.set(
        absolutePath,
        fs.readFile(absolutePath, 'utf-8').catch(() => null)
      );
    }

    return this.textCache.get(absolutePath)!;
  }

  readJson(absolutePath: string): Promise<JsonRecord | null> {
    if (!this.jsonCache.has(absolutePath)) {
      this.jsonCache.set(absolutePath, this.parseJson(absolutePath));
    }

    return this.jsonCache.get(absolutePath)!;
  }

  private async parseJson(absolutePath: string): Promise<JsonRecord | null> {
    const text = await this.readText(absolutePath);
    if (!text) {
      return null;
    }

    try {
      const parsed = JSON.parse(text) as JsonRecord;
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }
}

const readJsonField = (record: JsonRecord, field: string): unknown => {
  const segments = field.split('.');
  let current: unknown = record;

  for (const segment of segments) {
    if (!current || typeof current !== 'object' || !(segment in current)) {
      return undefined;
    }
    current = (current as JsonRecord)[segment];
  }

  return current;
};

const includesCaseInsensitive = (source: string, candidate: string) =>
  source.toLowerCase().includes(candidate.toLowerCase());

export class StackInsightService {
  constructor(private readonly definitions: StackDefinition[] = BUILTIN_STACK_DEFINITIONS) {}

  async analyze(graph: GraphData): Promise<StackInsightResult> {
    const context = new StackDetectionContext(graph);
    const detected = (
      await Promise.all(
        this.definitions.map((definition) => this.detectDefinition(context, definition))
      )
    ).filter((entry): entry is DetectedStack => !!entry);

    return {
      packageManagers: this.sortStacks(
        detected.filter((entry) => entry.category === 'package_manager')
      ),
      buildSystems: this.sortStacks(detected.filter((entry) => entry.category === 'build_system')),
      frameworks: this.sortStacks(detected.filter((entry) => entry.category === 'framework')),
    };
  }

  private sortStacks(entries: DetectedStack[]) {
    return entries.sort(
      (a, b) => a.displayName.localeCompare(b.displayName) || a.id.localeCompare(b.id)
    );
  }

  private async detectDefinition(
    context: StackDetectionContext,
    definition: StackDefinition
  ): Promise<DetectedStack | null> {
    const evidences = await Promise.all(
      definition.rules.map((rule) => this.evaluateRule(context, rule))
    );
    const matchedEvidence = evidences.flat();
    const matchedCount = evidences.filter((items) => items.length > 0).length;
    const shouldMatch =
      definition.matchMode === 'all' ? matchedCount === definition.rules.length : matchedCount > 0;

    if (!shouldMatch) {
      return null;
    }

    return {
      id: definition.id,
      displayName: definition.displayName,
      category: definition.category,
      ecosystem: definition.ecosystem,
      confidence: definition.confidence,
      evidence: Array.from(new Set(matchedEvidence)),
    };
  }

  private async evaluateRule(
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
}

type RuleOf<T extends StackDetectionRule['type']> = Extract<StackDetectionRule, { type: T }>;

const evidenceFor = (
  candidates: string[],
  matches: (candidate: string) => boolean,
  prefix: string
): string[] =>
  candidates.filter((candidate) => matches(candidate)).map((candidate) => `${prefix}:${candidate}`);

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
