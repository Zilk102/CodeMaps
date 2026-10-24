/**
 * Types and the file context shared by stack topology adapters, which extract framework and build structure.
 */
import * as fs from 'fs/promises';
import * as path from 'path';
import { GraphData } from '../store/types';
import { DetectedStack, StackInsightResult } from './StackInsightService';

/** Whether an adapter describes a framework or a build system. */
export type StackAdapterCategory = 'framework' | 'build';
/** Whether a relationship comes from framework wiring or from build configuration. */
export type StackRelationshipType = 'framework' | 'build';

/**
 * A directed link between two files or symbols discovered by an adapter; `reason` says why they are linked.
 */
export interface StackStructuralRelationship {
  source: string;
  target: string;
  type: StackRelationshipType;
  reason: string;
}

/**
 * What one adapter learned about a stack in the project: its evidence, key files, routes, modules and relationships.
 */
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

/**
 * The project view that adapters work against: the graph, the detected stacks and cached file queries.
 */
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

/**
 * Extracts the structure of one framework or build system. `supports` is a cheap check; `analyze` does the
 * file reading and returns null when nothing relevant is found.
 */
export interface StackAdapter {
  id: string;
  displayName: string;
  category: StackAdapterCategory;
  supports: (context: StackAdapterContext) => boolean;
  analyze: (context: StackAdapterContext) => Promise<StackStructuralInsight | null>;
}

/**
 * Default adapter context: indexes the graph's file nodes and caches file reads, so adapters share the I/O.
 * Paths in its queries are project-root-relative with forward slashes.
 */
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

  /** The detected stack with this id (package manager, build system or framework), if any. */
  getDetectedStack(stackId: string) {
    const all = [
      ...this.stackProfile.packageManagers,
      ...this.stackProfile.buildSystems,
      ...this.stackProfile.frameworks,
    ];
    return all.find((entry) => entry.id === stackId);
  }

  /** Copy of the absolute paths of all file nodes. */
  getAllFilePaths() {
    return this.filePaths.slice();
  }

  /** Project-root-relative path with forward slashes for an absolute file path. */
  getProjectRelativePath(filePath: string) {
    return (
      this.relativePathByAbsolute.get(filePath) ||
      this.normalize(path.relative(this.graph.projectRoot, filePath))
    );
  }

  /** Whether a file exists at this project-root-relative path. */
  hasRelativePath(relativePath: string) {
    return this.relativeToAbsolute.has(this.normalize(relativePath));
  }

  /** Absolute paths of files whose root-relative path starts with `prefix` (case-sensitive). */
  findByRelativePrefix(prefix: string) {
    const normalizedPrefix = this.normalize(prefix);
    return this.filePaths.filter((filePath) =>
      this.getProjectRelativePath(filePath).startsWith(normalizedPrefix)
    );
  }

  /** Absolute paths of files whose root-relative path ends with `suffix` (case-insensitive). */
  findBySuffix(suffix: string) {
    const normalizedSuffix = suffix.toLowerCase();
    return this.filePaths.filter((filePath) =>
      this.getProjectRelativePath(filePath).toLowerCase().endsWith(normalizedSuffix)
    );
  }

  /** Text of a file, read once and cached; null when it cannot be read. */
  async readText(filePath: string) {
    if (!this.textCache.has(filePath)) {
      this.textCache.set(
        filePath,
        fs.readFile(filePath, 'utf-8').catch(() => null)
      );
    }

    return this.textCache.get(filePath)!;
  }

  /** Texts of the given files, leaving out files that are unreadable or empty. */
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
