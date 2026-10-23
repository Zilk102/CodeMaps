import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as path from 'path';
import * as z from 'zod/v4';
import { validateChanges } from '../analysis/ChangeValidationService';
import { GitService } from '../services/GitService';
import { oracle } from '../oracle';
import { ensureGraphLoaded, resolveNodeReference, resolveProjectFilePath } from './utils';
import { McpToolContext } from './toolContext';
import { okStatusToolResult } from './toolSupport';

export function registerAnalysisTools(server: McpServer, context: McpToolContext) {
  server.registerTool(
    'get_health_score',
    {
      title: 'Get Health Score',
      description: 'Compute structural graph health metrics and an overall score',
      inputSchema: {},
    },
    async () => {
      const graph = await ensureGraphLoaded();
      const health = context.healthScoreAnalyzer.analyze(graph);
      return okStatusToolResult({ health });
    }
  );

  server.registerTool(
    'get_architecture_overview',
    {
      title: 'Get Architecture Overview',
      description:
        'Return architectural layer classification, cross-layer dependencies and boundary violations',
      inputSchema: {
        includeClassifications: z
          .boolean()
          .optional()
          .describe('When true, include per-node layer classifications'),
      },
    },
    async ({ includeClassifications = false }: { includeClassifications?: boolean }) => {
      const graph = await ensureGraphLoaded();
      const overview = context.architectureInsightService.analyze(graph);
      return okStatusToolResult({
        architecture: includeClassifications
          ? overview
          : {
              layers: overview.layers,
              dependencies: overview.dependencies,
              violations: overview.violations,
              summary: overview.summary,
            },
      });
    }
  );

  server.registerTool(
    'detect_patterns',
    {
      title: 'Detect Patterns',
      description: 'Detect architectural hotspots and anti-pattern candidates in the graph',
      inputSchema: {
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe('Optional maximum number of patterns to return'),
      },
    },
    async ({ limit = 20 }: { limit?: number }) => {
      const graph = await ensureGraphLoaded();
      const result = context.patternDetectionAnalyzer.analyze(graph);
      return okStatusToolResult({
        count: Math.min(result.patterns.length, limit),
        patterns: result.patterns.slice(0, limit),
      });
    }
  );

  server.registerTool(
    'run_security_scan',
    {
      title: 'Run Security Scan',
      description: 'Scan indexed source files for high-risk patterns and suspicious artifacts',
      inputSchema: {
        limit: z
          .number()
          .int()
          .min(1)
          .max(500)
          .optional()
          .describe('Optional maximum number of findings to return'),
      },
    },
    async ({ limit = 100 }: { limit?: number }) => {
      const graph = await ensureGraphLoaded();
      const scan = await context.securityScanner.analyze(graph);
      return okStatusToolResult({
        summary: scan.summary,
        findings: scan.findings.slice(0, limit),
      });
    }
  );

  server.registerTool(
    'search_signatures',
    {
      title: 'Search Signatures',
      description: 'Search declaration-like code signatures across indexed source files',
      inputSchema: {
        query: z.string().describe('Text or regex pattern to search in declaration signatures'),
        type: z
          .string()
          .optional()
          .describe('Optional symbol type filter such as function or class'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe('Maximum number of matches to return'),
        caseSensitive: z.boolean().optional().describe('Enable case-sensitive matching'),
        regex: z.boolean().optional().describe('Treat query as a regular expression'),
        filePath: z
          .string()
          .optional()
          .describe('Only search files whose path contains this text, e.g. "moduleQualityMetrics"'),
      },
    },
    async ({
      query,
      type,
      limit = 20,
      caseSensitive = false,
      regex = false,
      filePath,
    }: {
      query: string;
      type?: string;
      limit?: number;
      caseSensitive?: boolean;
      regex?: boolean;
      filePath?: string;
    }) => {
      const graph = await ensureGraphLoaded();
      const result = await context.signatureSearchService.search(graph, query, {
        type,
        limit,
        caseSensitive,
        regex,
        filePath,
      });
      return okStatusToolResult(result);
    }
  );

  server.registerTool(
    'analyze_decomposition',
    {
      title: 'Analyze Decomposition',
      description:
        'Finds and suggests splits for God classes, duplicate clones, and oversized monoliths. For the worst files (or the file you pass) it also returns splitPlans: the declarations grouped into clusters that belong together, each with a suggested file name, its symbols and line count, the shared helpers it needs and the clusters it calls into, so a god file can be split without reading it.',
      inputSchema: {
        focusNodeIds: z
          .array(z.string())
          .optional()
          .describe('Optional array of specific node IDs to focus the decomposition analysis on.'),
        filePath: z
          .string()
          .optional()
          .describe(
            'Optional path of one file to plan a split for (absolute, or relative to the project root).'
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .describe('Maximum number of refactoring candidates to return (default 12).'),
      },
    },
    async ({
      focusNodeIds,
      filePath,
      limit = 12,
    }: {
      focusNodeIds?: string[];
      filePath?: string;
      limit?: number;
    }) => {
      const graph = await ensureGraphLoaded();
      const { DecompositionGuidanceService } =
        await import('../analysis/DecompositionGuidanceService.js');
      const { SymbolClusterService } =
        await import('../analysis/symbolClusters/SymbolClusterService.js');
      const focus = [...(focusNodeIds ?? []), ...(filePath ? [filePath] : [])].map((reference) =>
        resolveNodeReference(graph, reference)
      );
      const result = new DecompositionGuidanceService().prepareGuidance(graph, {
        focusNodeIds: focus.length > 0 ? focus : undefined,
        limit,
      });
      // Plans for what was asked about, otherwise for the files the candidates point at.
      const planTargets =
        focus.length > 0
          ? focus
          : result.candidates
              .filter((candidate) => candidate.targetType !== 'method')
              .map((candidate) => candidate.fileNodeId);
      const splitPlans = await new SymbolClusterService().planFiles(graph, planTargets, 3);
      return okStatusToolResult({ ...result, splitPlans });
    }
  );

  server.registerTool(
    'get_semantic_skeleton',
    {
      title: 'Get Semantic Skeleton',
      description:
        'Strips out function/method bodies from a file, returning only the structural skeleton (imports, interfaces, signatures). Use this to save tokens when exploring large files.',
      inputSchema: {
        filePath: z
          .string()
          .describe('Path of the file to skeletonize (absolute, or relative to the project root)'),
      },
    },
    async ({ filePath: requestedPath }: { filePath: string }) => {
      try {
        const graph = await ensureGraphLoaded();
        const filePath = resolveProjectFilePath(graph, requestedPath);
        const { SemanticSkeletonService } = await import('../analysis/SemanticSkeletonService.js');
        const service = new SemanticSkeletonService();
        const skeleton = await service.generateSkeleton(filePath);
        const outline = await service.generateOutline(filePath);
        return okStatusToolResult({ skeleton, outline }, { unbounded: true });
      } catch (err: any) {
        return {
          content: [{ type: 'text', text: `Failed to generate skeleton: ${err.message}` }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    'validate_architecture_changes',
    {
      title: 'Validate Architecture Changes',
      description:
        'Validates your edits against SOLID and duplication heuristics. By default it checks only the files changed in the git working tree (or against baseRef) and returns just the problems in them, each with a fix hint; with no detectable changes it checks the whole project. Run it before finalizing code changes.',
      inputSchema: {
        changedFiles: z
          .array(z.string())
          .optional()
          .describe('Files to validate (absolute or project-relative). Overrides git detection.'),
        baseRef: z
          .string()
          .optional()
          .describe('Git revision to diff against (default HEAD, i.e. uncommitted changes).'),
        scope: z
          .enum(['auto', 'changed', 'project'])
          .optional()
          .describe('auto (default): changed files when any, otherwise the whole project.'),
      },
    },
    async ({
      changedFiles,
      baseRef,
      scope = 'auto',
    }: {
      changedFiles?: string[];
      baseRef?: string;
      scope?: 'auto' | 'changed' | 'project';
    }) => {
      // The edits being validated were probably saved a moment ago; wait for the indexer.
      await oracle.whenIdle();
      const graph = await ensureGraphLoaded();
      const health = context.healthScoreAnalyzer.analyze(graph);
      const patterns = context.patternDetectionAnalyzer.analyze(graph);

      const root = graph.projectRoot ?? '';
      let resolved: string[] = [];
      if (scope !== 'project') {
        resolved = changedFiles?.length
          ? changedFiles.map((file) => resolveProjectFile(root, file))
          : detectChangedFiles(root, baseRef);
      }

      const result = validateChanges({
        patterns: patterns.patterns,
        changedFiles: resolved,
        healthScore: health.score,
      });

      return okStatusToolResult({
        ...result,
        projectHealth: { score: health.score, grade: health.grade },
      });
    }
  );
}

const resolveProjectFile = (root: string, file: string) => {
  const normalized = file.replace(/\\/g, '/');
  return path.isAbsolute(file) ? normalized : path.posix.join(root.replace(/\\/g, '/'), normalized);
};

const detectChangedFiles = (root: string, baseRef?: string): string[] => {
  if (!root) return [];
  const git = new GitService(root);
  if (baseRef && !git.isSafeGitRevision(baseRef)) return [];

  const tracked = git.execGit(['diff', '--name-only', '--relative', baseRef ?? 'HEAD']) ?? '';
  const untracked = git.execGit(['ls-files', '--others', '--exclude-standard']) ?? '';
  return Array.from(new Set([...tracked.split(/\r?\n/), ...untracked.split(/\r?\n/)]))
    .filter(Boolean)
    .map((file) => resolveProjectFile(root, file));
};
