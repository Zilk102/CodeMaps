import * as fs from 'fs/promises';
import * as path from 'path';
import { GraphData } from '../store';
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
  private readonly textCache = new Map<string, Promise<string | null>>();
  private readonly jsonCache = new Map<string, Promise<JsonRecord | null>>();

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

    return this.readJson(absolutePath);
  }

  private async readText(absolutePath: string): Promise<string | null> {
    if (!this.textCache.has(absolutePath)) {
      this.textCache.set(
        absolutePath,
        fs.readFile(absolutePath, 'utf-8').catch(() => null)
      );
    }

    return this.textCache.get(absolutePath)!;
  }

  private async readJson(absolutePath: string): Promise<JsonRecord | null> {
    if (!this.jsonCache.has(absolutePath)) {
      this.jsonCache.set(
        absolutePath,
        (async () => {
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
        })()
      );
    }

    return this.jsonCache.get(absolutePath)!;
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
      await Promise.all(this.definitions.map((definition) => this.detectDefinition(context, definition)))
    ).filter((entry): entry is DetectedStack => !!entry);

    return {
      packageManagers: this.sortStacks(detected.filter((entry) => entry.category === 'package_manager')),
      buildSystems: this.sortStacks(detected.filter((entry) => entry.category === 'build_system')),
      frameworks: this.sortStacks(detected.filter((entry) => entry.category === 'framework')),
    };
  }

  private sortStacks(entries: DetectedStack[]) {
    return entries.sort(
      (a, b) =>
        a.displayName.localeCompare(b.displayName) ||
        a.id.localeCompare(b.id)
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
        return rule.anyOf
          .filter((candidate) => context.hasRelativePath(candidate))
          .map((candidate) => `file:${candidate}`);
      case 'basename':
        return rule.anyOf
          .filter((candidate) => context.hasBasename(candidate))
          .map((candidate) => `file:${candidate}`);
      case 'suffix':
        return rule.anyOf
          .filter((candidate) => context.hasSuffix(candidate))
          .map((candidate) => `suffix:${candidate}`);
      case 'json_dependency': {
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
      case 'json_field_includes': {
        const manifest = await context.readJsonByRelativePath(rule.file);
        if (!manifest) {
          return [];
        }

        const fieldValue = readJsonField(manifest, rule.field);
        if (typeof fieldValue !== 'string') {
          return [];
        }

        return rule.anyOf
          .filter((candidate) => includesCaseInsensitive(fieldValue, candidate))
          .map((candidate) => `field:${rule.file}:${rule.field}:${candidate}`);
      }
      case 'text_contains': {
        const text = await context.readTextByRelativePath(rule.file);
        if (!text) {
          return [];
        }

        return rule.anyOf
          .filter((candidate) => includesCaseInsensitive(text, candidate))
          .map((candidate) => `text:${rule.file}:${candidate}`);
      }
      case 'text_contains_in_suffix': {
        const texts = await Promise.all(
          rule.suffixes.flatMap(async (suffix) => {
            const entries = await context.readTextsBySuffix(suffix);
            return entries.map((text) => ({ suffix, text }));
          })
        );

        const flattened = texts.flat();
        const matches: string[] = [];
        for (const candidate of rule.anyOf) {
          if (flattened.some((entry) => entry.text && includesCaseInsensitive(entry.text, candidate))) {
            matches.push(`text-suffix:${candidate}`);
          }
        }
        return matches;
      }
      default:
        return [];
    }
  }
}
