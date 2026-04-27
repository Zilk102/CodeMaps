import { GraphData, oracleStore } from '../store';
import { oracle } from '../oracle';
import * as path from 'path';
import pLimit from 'p-limit';

const analyzeLimit = pLimit(1); // Only 1 analyzeProject at a time to prevent OOM

export const normalizePath = (value?: string) => value?.replace(/\\/g, '/');

export const getGraphSnapshot = (): GraphData => {
  return oracle.getGraph();
};

export const getGraphCountsByType = (graph: GraphData) => {
  return graph.nodes.reduce<Record<string, number>>((acc, node) => {
    acc[node.type] = (acc[node.type] || 0) + 1;
    return acc;
  }, {});
};

export const createGraphSummary = (graph: GraphData) => {
  const nodesCount = graph.nodes.length;
  const linksCount = graph.links.length;
  const nodeTypes = getGraphCountsByType(graph);
  
  return {
    projectRoot: graph.projectRoot,
    nodesCount,
    linksCount,
    nodeTypes,
  };
};

export const ensureGraphLoaded = async (projectPath?: string): Promise<GraphData> => {
  const state = oracleStore.getState();
  const SAFE_ROOT = process.env.CODEMAPS_ROOT || process.cwd();
  
  if (projectPath) {
    const resolved = path.resolve(SAFE_ROOT, projectPath);
    if (!resolved.startsWith(SAFE_ROOT)) {
      throw new Error('Path traversal detected');
    }
  }

  const targetPath = normalizePath(projectPath) || state.baseDir || normalizePath(SAFE_ROOT)!;

  if (
    !state.baseDir ||
    (projectPath && normalizePath(state.baseDir) !== normalizePath(projectPath))
  ) {
    return analyzeLimit(async () => {
      // Create a timeout promise
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('oracle.analyzeProject timed out')), 60000)
      );
      // Race the analyzeProject call against the timeout
      return Promise.race([oracle.analyzeProject(targetPath), timeout]);
    });
  }

  return oracle.getGraph();
};

export const getNodeDependencies = (graph: GraphData, nodeId: string) => {
  const dependencies = graph.links.filter((link) => link.source === nodeId);
  const dependents = graph.links.filter((link) => link.target === nodeId);
  return { dependencies, dependents };
};

export const searchGraph = (graph: GraphData, query: string, type?: string, limit = 20) => {
  const normalizedQuery = query.trim().toLowerCase();
  return graph.nodes
    .filter((node) => {
      if (type && node.type !== type) return false;
      if (!normalizedQuery) return true;
      return (
        node.label.toLowerCase().includes(normalizedQuery) ||
        node.id.toLowerCase().includes(normalizedQuery)
      );
    })
    .slice(0, limit);
};

export const createTextContent = (payload: unknown) => {
  if (typeof payload === 'string') return payload;
  return `\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\``;
};

export const createAgentPlaybook = () => ({
  version: 4,
  goal: 'A regular user connects CodeMaps to the agent, and the agent chooses the right tools automatically without needing MCP command knowledge.',
  preferredDefaultFlow: {
    openProject: 'analyze_project',
    naturalLanguageRequest: 'prepare_task_context',
    understandProject: 'prepare_project_context',
    largeScaleChange: 'prepare_change_campaign',
    codeChange: 'prepare_change_context',
    review: 'prepare_review_context',
  },
  rules: [
    'If the project is not open yet, call analyze_project first.',
    'If the user describes a problem, feature, degradation, or review in natural language, the agent should call prepare_task_context first.',
    'Immediately after opening a project, the agent should call prepare_project_context to build a mental model of entry points, orchestrators, and architectural boundaries.',
    'For mass migrations, library switches, and broad refactoring campaigns, use prepare_change_campaign instead of single-target prepare_change_context.',
    'For bugfix/feature/refactor, call prepare_change_context first.',
    'For review, architectural assessment, and post-change validation, call prepare_review_context first.',
    'Use low-level tools only as a fallback when the composite context is insufficient.',
  ],
  fallbackTools: [
    'search_graph',
    'get_node_dependencies',
    'get_blast_radius',
    'get_architecture_overview',
    'get_health_score',
    'detect_patterns',
    'run_security_scan',
    'search_signatures',
  ],
});
