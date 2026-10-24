import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as path from 'path';
import * as z from 'zod/v4';
import { documentationIndex } from '../analysis/documentation';
import { validateChanges } from '../analysis/ChangeValidationService';
import { GitService } from '../services/GitService';
import { oracle } from '../oracle';
import { defineGraphTool } from './defineTool';
import { ensureGraphLoaded, resolveNodeReference, resolveProjectFilePath } from './utils';
import { McpToolContext } from './toolContext';
import {
  boundedInt,
  includeClassificationsField,
  optionalBoolean,
  optionalString,
} from './toolSchemas';
import { okStatusToolResult } from './toolSupport';

export function registerAnalysisTools(server: McpServer, context: McpToolContext) {
  registerHealthScore(server, context);
  registerArchitectureOverview(server, context);
  registerDetectPatterns(server, context);
  registerSecurityScan(server, context);
  registerSearchSignatures(server, context);
  registerDecomposition(server);
  registerSemanticSkeleton(server);
  registerValidateChanges(server, context);
}

function registerHealthScore(server: McpServer, context: McpToolContext) {
  defineGraphTool(
    server,
    {
      name: 'get_health_score',
      title: 'Get Health Score',
      description: 'Compute structural graph health metrics and an overall score',
      inputSchema: {},
    },
    (graph) => okStatusToolResult({ health: context.healthScoreAnalyzer.analyze(graph) })
  );
}

function registerArchitectureOverview(server: McpServer, context: McpToolContext) {
  defineGraphTool(
    server,
    {
      name: 'get_architecture_overview',
      title: 'Get Architecture Overview',
      description:
        'Return architectural layer classification, cross-layer dependencies and boundary violations',
      inputSchema: {
        includeClassifications: includeClassificationsField,
      },
    },
    (graph, { includeClassifications = false }) => {
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
}

function registerDetectPatterns(server: McpServer, context: McpToolContext) {
  defineGraphTool(
    server,
    {
      name: 'detect_patterns',
      title: 'Detect Patterns',
      description: 'Detect architectural hotspots and anti-pattern candidates in the graph',
      inputSchema: {
        limit: boundedInt(100, 'Optional maximum number of patterns to return'),
      },
    },
    (graph, { limit = 20 }) => {
      const result = context.patternDetectionAnalyzer.analyze(graph);
      return okStatusToolResult({
        count: Math.min(result.patterns.length, limit),
        patterns: result.patterns.slice(0, limit),
      });
    }
  );
}

function registerSecurityScan(server: McpServer, context: McpToolContext) {
  defineGraphTool(
    server,
    {
      name: 'run_security_scan',
      title: 'Run Security Scan',
      description: 'Scan indexed source files for high-risk patterns and suspicious artifacts',
      inputSchema: {
        limit: boundedInt(500, 'Optional maximum number of findings to return'),
      },
    },
    async (graph, { limit = 100 }) => {
      const scan = await context.securityScanner.analyze(graph);
      return okStatusToolResult({
        summary: scan.summary,
        findings: scan.findings.slice(0, limit),
      });
    }
  );
}

function registerSearchSignatures(server: McpServer, context: McpToolContext) {
  defineGraphTool(
    server,
    {
      name: 'search_signatures',
      title: 'Search Signatures',
      description: 'Search declaration-like code signatures across indexed source files',
      inputSchema: {
        query: z.string().describe('Text or regex pattern to search in declaration signatures'),
        type: optionalString('Optional symbol type filter such as function or class'),
        limit: boundedInt(100, 'Maximum number of matches to return'),
        caseSensitive: optionalBoolean('Enable case-sensitive matching'),
        regex: optionalBoolean('Treat query as a regular expression'),
        filePath: optionalString(
          'Only search files whose path contains this text, e.g. "moduleQualityMetrics"'
        ),
      },
    },
    async (graph, { query, type, limit = 20, caseSensitive = false, regex = false, filePath }) =>
      okStatusToolResult(
        await context.signatureSearchService.search(graph, query, {
          type,
          limit,
          caseSensitive,
          regex,
          filePath,
        })
      )
  );
}

function registerDecomposition(server: McpServer) {
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
        filePath: optionalString(
          'Optional path of one file to plan a split for (absolute, or relative to the project root).'
        ),
        limit: boundedInt(50, 'Maximum number of refactoring candidates to return (default 12).'),
      },
    },
    analyzeDecomposition
  );
}

async function analyzeDecomposition({
  focusNodeIds,
  filePath,
  limit = 12,
}: {
  focusNodeIds?: string[];
  filePath?: string;
  limit?: number;
}) {
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

function registerSemanticSkeleton(server: McpServer) {
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
}

function registerValidateChanges(server: McpServer, context: McpToolContext) {
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
        baseRef: optionalString(
          'Git revision to diff against (default HEAD, i.e. uncommitted changes).'
        ),
        scope: z
          .enum(['auto', 'changed', 'project'])
          .optional()
          .describe('auto (default): changed files when any, otherwise the whole project.'),
      },
    },
    (args: ValidateChangesArgs) => validateArchitectureChanges(context, args)
  );
}

interface ValidateChangesArgs {
  changedFiles?: string[];
  baseRef?: string;
  scope?: 'auto' | 'changed' | 'project';
}

async function validateArchitectureChanges(
  context: McpToolContext,
  { changedFiles, baseRef, scope = 'auto' }: ValidateChangesArgs
) {
  // The edits being validated were probably saved a moment ago; wait for the indexer.
  await oracle.whenIdle();
  const graph = await ensureGraphLoaded();
  const health = context.healthScoreAnalyzer.analyze(graph);
  const patterns = context.patternDetectionAnalyzer.analyze(graph);

  const root = graph.projectRoot ?? '';
  const resolved = scope === 'project' ? [] : filesToValidate(root, changedFiles, baseRef);

  const result = validateChanges({
    patterns: patterns.patterns,
    changedFiles: resolved,
    healthScore: health.score,
    documentation: documentationIndex.peek(graph.projectRoot),
  });

  return okStatusToolResult({
    ...result,
    projectHealth: { score: health.score, grade: health.grade },
  });
}

const filesToValidate = (root: string, changedFiles: string[] | undefined, baseRef?: string) =>
  changedFiles?.length
    ? changedFiles.map((file) => resolveProjectFile(root, file))
    : detectChangedFiles(root, baseRef);

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
