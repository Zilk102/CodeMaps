import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod/v4';
import type { GraphData } from '../store';
import { BlastRadiusV2 } from '../services/BlastRadiusV2';
import { GitActivityService } from '../services/GitActivityService';
import { PRImpactAnalyzer } from '../services/PRImpactAnalyzer';
import { defineGraphTool, type ToolArgs, type ToolSpec } from './defineTool';
import { resolveNodeReference } from './utils';
import { boundedInt, nodeIdField, optionalString } from './toolSchemas';
import { okStatusToolResult, requireProjectRoot, withInitializedService } from './toolSupport';

interface OpenableService {
  init(): Promise<unknown>;
  close(): Promise<unknown>;
}

interface ServiceTool<Shape extends z.ZodRawShape, S extends OpenableService> {
  spec: ToolSpec<Shape>;
  /** What the tool needs the project root for, as in "Project root is required to <action>". */
  action: string;
  /** The service class, opened on the project root. */
  service: new (projectRoot: string) => S;
  run: (service: S, graph: GraphData, args: ToolArgs<Shape>) => unknown;
}

type Registration = (server: McpServer) => void;

/** A graph tool that runs its analysis in a service opened on the project root. */
const serviceTool =
  <Shape extends z.ZodRawShape, S extends OpenableService>(
    tool: ServiceTool<Shape, S>
  ): Registration =>
  (server) =>
    defineGraphTool(server, tool.spec, async (graph, args) => {
      const projectRoot = requireProjectRoot(graph, tool.action);

      return withInitializedService(new tool.service(projectRoot), async (service) =>
        okStatusToolResult(await tool.run(service, graph, args))
      );
    });

const PR_IMPACT_SPEC = {
  name: 'analyze_pr_impact',
  title: 'Analyze PR Impact',
  description: 'Analyze the architectural blast radius of a PR or branch comparison',
  inputSchema: {
    baseBranch: z.string().describe('Base branch name to compare against'),
    headBranch: z.string().describe('Head branch name with changes'),
  },
};

const HEATMAP_SPEC = {
  name: 'analyze_activity_heatmap',
  title: 'Analyze Activity Heatmap',
  description: 'Generate a git churn heatmap to identify hotspots',
  inputSchema: {
    since: optionalString('ISO date string for start of period'),
    until: optionalString('ISO date string for end of period'),
  },
};

const BLAST_RADIUS_SPEC = {
  name: 'calculate_blast_radius_v2',
  title: 'Calculate Blast Radius V2',
  description: 'Return advanced direct and transitive impact using KuzuDB',
  inputSchema: {
    nodeId: nodeIdField,
    maxDepth: boundedInt(20, 'Optional traversal depth limit'),
  },
};

const toDate = (iso: string | undefined) => (iso ? new Date(iso) : undefined);

const REGISTRATIONS: Registration[] = [
  serviceTool({
    spec: PR_IMPACT_SPEC,
    action: 'run PR impact analysis',
    service: PRImpactAnalyzer,
    run: (analyzer, _graph, { baseBranch, headBranch }) =>
      analyzer.analyzePR(baseBranch, headBranch),
  }),
  serviceTool({
    spec: HEATMAP_SPEC,
    action: 'run heatmap analysis',
    service: GitActivityService,
    run: (service, _graph, { since, until }) => service.analyzeChurn(toDate(since), toDate(until)),
  }),
  serviceTool({
    spec: BLAST_RADIUS_SPEC,
    action: 'calculate blast radius v2',
    service: BlastRadiusV2,
    run: (analyzer, graph, { nodeId, maxDepth }) =>
      analyzer.calculate(resolveNodeReference(graph, nodeId), maxDepth || 5),
  }),
];

export function registerAdvancedTools(server: McpServer) {
  for (const register of REGISTRATIONS) register(server);
}
