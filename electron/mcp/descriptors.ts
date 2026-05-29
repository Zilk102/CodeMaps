import { GraphData } from '../store';

export interface McpStatusToolDescriptor {
  name: string;
  title: string;
  description: string;
  preferredForAgents?: boolean;
  recommendedWhen?: string;
}

export interface McpStatusResourceDescriptor {
  uri: string;
  title: string;
  description: string;
  preferredForAgents?: boolean;
}

export interface McpStatus {
  enabled: boolean;
  host: string;
  port: number;
  path: string;
  endpoint: string;
  websocketUrl: string;
  resources: string[];
  tools: string[];
  resourceDetails: McpStatusResourceDescriptor[];
  toolDetails: McpStatusToolDescriptor[];
  projectRoot: string | null;
  nodesCount: number;
  linksCount: number;
}

export const MCP_RESOURCES: McpStatusResourceDescriptor[] = [
  {
    uri: 'codemaps://project/summary',
    title: 'Project Summary',
    description: 'Brief summary of the project graph: root, node count, link count, and node types.',
  },
  {
    uri: 'codemaps://graph/full',
    title: 'Full Graph',
    description:
      'Full JSON graph of the project for advanced analysis, client integrations, and debugging.',
  },
  {
    uri: 'codemaps://agent/playbook',
    title: 'Agent Playbook',
    description:
      'How the agent should use CodeMaps automatically: preferred tools, fallback path, and execution order.',
    preferredForAgents: true,
  },
  {
    uri: 'codemaps://agent/project-brain',
    title: 'Project Brain',
    description:
      'Ready-to-use architectural mental model of the current project for an agent-first start without manual tool orchestration.',
    preferredForAgents: true,
  },
];

export const MCP_TOOLS: McpStatusToolDescriptor[] = [
  {
    name: 'analyze_project',
    title: 'Analyze Project',
    description:
      'Indexes the project and loads the graph into CodeMaps. Usually, the agent should call this automatically when changing projects.',
    recommendedWhen: 'When the project is not open yet or you need to switch the active workspace.',
  },
  {
    name: 'get_graph_context',
    title: 'Get Graph Context',
    description:
      'Returns a graph summary or the full graph payload. Useful as a low-level fallback when the raw graph is needed.',
    recommendedWhen: 'When the composite context is insufficient and the agent needs a full snapshot of the graph.',
  },
  {
    name: 'get_node_dependencies',
    title: 'Get Node Dependencies',
    description:
      'Shows incoming and outgoing links of a specific node. Usually needed as a fallback after prepare_change_context.',
    recommendedWhen: 'When you need to manually expand the local dependency context.',
  },
  {
    name: 'search_graph',
    title: 'Search Graph',
    description:
      'Searches nodes by label or id, optionally filtered by type. Low-level search for ambiguous targets.',
    recommendedWhen: 'When target resolution in a composite context requires manual refinement.',
  },
  {
    name: 'get_blast_radius',
    title: 'Get Blast Radius',
    description:
      'Calculates the direct and transitive impact of changes for a selected node. Usually already included in prepare_change_context.',
    recommendedWhen: 'When you need to separately deepen the impact analysis for a specific node.',
  },
  {
    name: 'get_health_score',
    title: 'Get Health Score',
    description:
      'Evaluates graph health and architectural risks as a score/grade. Usually already included in prepare_review_context.',
    recommendedWhen: 'When you need to quickly re-verify overall degradation after a series of changes.',
  },
  {
    name: 'get_architecture_overview',
    title: 'Get Architecture Overview',
    description:
      'Classifies layers, shows cross-layer dependencies, and boundary violations. Usually already included in prepare_review_context.',
    recommendedWhen: 'When a detailed layer overview is needed outside of a composite review context.',
  },
  {
    name: 'detect_patterns',
    title: 'Detect Patterns',
    description:
      'Finds hotspots, fan-in/fan-out issues, and architectural anti-pattern candidates. Usually already included in prepare_review_context.',
    recommendedWhen: 'When a separate structural hotspot scan is needed.',
  },
  {
    name: 'run_security_scan',
    title: 'Run Security Scan',
    description:
      'Scans indexed files for risky and suspicious patterns. Usually already included in prepare_review_context or prepare_change_context.',
    recommendedWhen: 'When the review is focused on security or there are already findings near the target.',
  },
  {
    name: 'search_signatures',
    title: 'Search Signatures',
    description:
      'Searches declaration-like signatures across source code and symbols. Used as a fallback for precise declaration-level target search.',
    recommendedWhen: 'When you need to quickly find declaration-like code by name or regex.',
  },
  {
    name: 'analyze_pr_impact',
    title: 'Analyze PR Impact',
    description: 'Analyzes the architectural blast radius of a Pull Request (or branch comparison).',
    recommendedWhen: 'When reviewing a PR or assessing the impact of a branch before merging.',
  },
  {
    name: 'analyze_activity_heatmap',
    title: 'Analyze Activity Heatmap',
    description: 'Generates a git churn heatmap to identify frequently modified files (hotspots).',
    recommendedWhen: 'When looking for technical debt or unstable code areas.',
  },
  {
    name: 'calculate_blast_radius_v2',
    title: 'Calculate Blast Radius V2',
    description: 'Return advanced direct and transitive impact using KuzuDB',
    recommendedWhen: 'When a deep transitive dependency analysis is needed.',
  },
  {
    name: 'prepare_task_context',
    title: 'Prepare Task Context',
    description:
      'Main agent-first tool for natural language user requests: determines intent, selects the right composite flow, and prepares change/review context if possible.',
    preferredForAgents: true,
    recommendedWhen:
      'Use first for standard human requests like "auth is broken", "find the cause", "add a feature", or "do a review".',
  },
  {
    name: 'prepare_change_campaign',
    title: 'Prepare Change Campaign',
    description:
      'Campaign-level tool for mass migrations and broad refactoring tasks: gathers seed targets, expanded scope, execution waves, and campaign risks.',
    preferredForAgents: true,
    recommendedWhen:
      'Use for tasks like "migrate all payment services to the new library", "replace SDK across the backend", or other multi-file campaigns.',
  },
  {
    name: 'prepare_project_context',
    title: 'Prepare Project Context',
    description:
      'Preferred starting tool for the agent: builds a project mental model, entry points, orchestrators, boundaries, and future work strategy.',
    preferredForAgents: true,
    recommendedWhen:
      'Use immediately after analyze_project when the agent needs to quickly understand any new project as a system.',
  },
  {
    name: 'prepare_change_context',
    title: 'Prepare Change Context',
    description:
      'Preferred tool for the agent before bugfix/feature/refactor: gathers target, dependencies, blast radius, architectural risks, and recommendations.',
    preferredForAgents: true,
    recommendedWhen: 'Use by default before any non-trivial code changes.',
  },
  {
    name: 'prepare_review_context',
    title: 'Prepare Review Context',
    description:
      'Preferred tool for the agent before review: gathers health, architecture, patterns, security, and check priorities.',
    preferredForAgents: true,
    recommendedWhen:
      'Use by default for reviews, architecture audits, and post-change validation.',
  },
];

export const buildMcpStatus = (
  graph: GraphData,
  config: {
    host: string;
    port: number;
    path: string;
    endpoint: string;
    websocketUrl: string;
  }
): McpStatus => ({
  enabled: true,
  host: config.host,
  port: config.port,
  path: config.path,
  endpoint: config.endpoint,
  websocketUrl: config.websocketUrl,
  resources: MCP_RESOURCES.map((resource) => resource.uri),
  tools: MCP_TOOLS.map((tool) => tool.name),
  resourceDetails: MCP_RESOURCES,
  toolDetails: MCP_TOOLS,
  projectRoot: graph.projectRoot || null,
  nodesCount: graph.nodes.length,
  linksCount: graph.links.length,
});
