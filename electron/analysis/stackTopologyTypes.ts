import * as fs from 'fs/promises';
import * as path from 'path';
import { GraphData } from '../store/types';
import { DetectedStack, StackInsightResult } from './StackInsightService';

export type StackAdapterCategory = 'framework' | 'build';
export type StackRelationshipType = 'framework' | 'build';

export interface StackStructuralRelationship {
  source: string;
  target: string;
  type: StackRelationshipType;
  reason: string;
}

export interface StackStructuralInsight {
  adapterId: string;
  displayName: string;
  category: StackAdapterCategory;
  summary: string;
  evidence: string[];
  entryFiles: string[];
  configFiles: string[];
  components: string[];
  routes: string[];
  modules: string[];
  relationships: StackStructuralRelationship[];
}

export interface StackAdapterContext {
  graph: GraphData;
  stackProfile: StackInsightResult;
  getDetectedStack: (stackId: string) => DetectedStack | undefined;
  getAllFilePaths: () => string[];
  getProjectRelativePath: (filePath: string) => string;
  hasRelativePath: (relativePath: string) => boolean;
  findByRelativePrefix: (prefix: string) => string[];
  findBySuffix: (suffix: string) => string[];
  readText: (filePath: string) => Promise<string | null>;
  readTexts: (filePaths: string[]) => Promise<Array<{ filePath: string; text: string }>>;
}

export interface StackAdapter {
  id: string;
  displayName: string;
  category: StackAdapterCategory;
  supports: (context: StackAdapterContext) => boolean;
  analyze: (context: StackAdapterContext) => Promise<StackStructuralInsight | null>;
}

export class ProjectFileContext implements StackAdapterContext {
  private readonly filePaths: string[];
  private readonly relativePathByAbsolute = new Map<string, string>();
  private readonly relativeToAbsolute = new Map<string, string>();
  private readonly textCache = new Map<string, Promise<string | null>>();

  constructor(
    public readonly graph: GraphData,
    public readonly stackProfile: StackInsightResult
  ) {
    this.filePaths = graph.nodes.filter((node) => node.type === 'file').map((node) => node.id);

    for (const filePath of this.filePaths) {
      const relativePath = this.normalize(path.relative(graph.projectRoot, filePath));
      this.relativePathByAbsolute.set(filePath, relativePath);
      this.relativeToAbsolute.set(relativePath, filePath);
    }
  }

  getDetectedStack(stackId: string) {
    const all = [
      ...this.stackProfile.packageManagers,
      ...this.stackProfile.buildSystems,
      ...this.stackProfile.frameworks,
    ];
    return all.find((entry) => entry.id === stackId);
  }

  getAllFilePaths() {
    return this.filePaths.slice();
  }

  getProjectRelativePath(filePath: string) {
    return (
      this.relativePathByAbsolute.get(filePath) ||
      this.normalize(path.relative(this.graph.projectRoot, filePath))
    );
  }

  hasRelativePath(relativePath: string) {
    return this.relativeToAbsolute.has(this.normalize(relativePath));
  }

  findByRelativePrefix(prefix: string) {
    const normalizedPrefix = this.normalize(prefix);
    return this.filePaths.filter((filePath) =>
      this.getProjectRelativePath(filePath).startsWith(normalizedPrefix)
    );
  }

  findBySuffix(suffix: string) {
    const normalizedSuffix = suffix.toLowerCase();
    return this.filePaths.filter((filePath) =>
      this.getProjectRelativePath(filePath).toLowerCase().endsWith(normalizedSuffix)
    );
  }

  async readText(filePath: string) {
    if (!this.textCache.has(filePath)) {
      this.textCache.set(
        filePath,
        fs.readFile(filePath, 'utf-8').catch(() => null)
      );
    }

    return this.textCache.get(filePath)!;
  }

  async readTexts(filePaths: string[]) {
    const results = await Promise.all(
      filePaths.map(async (filePath) => {
        const text = await this.readText(filePath);
        return text ? { filePath, text } : null;
      })
    );

    return results.filter((entry): entry is { filePath: string; text: string } => !!entry);
  }

  private normalize(value: string) {
    return value.replace(/\\/g, '/');
  }
}
