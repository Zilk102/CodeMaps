import cors from 'cors';
import express from 'express';
import * as http from 'http';
import { randomUUID } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import * as z from 'zod/v4';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { oracle } from './oracle';
import { GraphData, GraphLink, GraphNode, oracleStore } from './store';
import { BlastRadiusAnalyzer } from './analysis/BlastRadiusAnalyzer';
import { HealthScoreAnalyzer } from './analysis/HealthScoreAnalyzer';
import { PatternDetectionAnalyzer } from './analysis/PatternDetectionAnalyzer';
import { SecurityScanner } from './analysis/SecurityScanner';
import { SignatureSearchService } from './analysis/SignatureSearchService';

const MCP_HOST = '127.0.0.1';
const MCP_PORT = 3005;
const MCP_PATH = '/mcp';
const MCP_HTTP_URL = `http://${MCP_HOST}:${MCP_PORT}${MCP_PATH}`;
const MCP_WS_URL = `ws://localhost:${MCP_PORT}`;

type McpTransportRecord = {
  transport: StreamableHTTPServerTransport;
  server: McpServer;
};

export interface McpStatus {
  enabled: boolean;
  host: string;
  port: number;
  path: string;
  endpoint: string;
  websocketUrl: string;
  resources: string[];
  tools: string[];
  projectRoot: string | null;
  nodesCount: number;
  linksCount: number;
}

type McpServiceHandle = {
  server: http.Server;
  getStatus: () => McpStatus;
};

let mcpService: McpServiceHandle | null = null;

const MCP_RESOURCE_URIS = [
  'codemaps://project/summary',
  'codemaps://graph/full',
];

const MCP_TOOL_NAMES = [
  'analyze_project',
  'get_graph_context',
  'get_node_dependencies',
  'get_blast_radius',
  'get_health_score',
  'detect_patterns',
  'run_security_scan',
  'search_graph',
  'search_signatures',
];

const normalizePath = (value?: string) => value?.replace(/\\/g, '/');

const getGraphSnapshot = (): GraphData => {
  return oracle.getGraph();
};

const getGraphCountsByType = (graph: GraphData) => {
  return graph.nodes.reduce<Record<string, number>>((acc, node) => {
    acc[node.type] = (acc[node.type] || 0) + 1;
    return acc;
  }, {});
};

const createGraphSummary = (graph: GraphData) => ({
  projectRoot: graph.projectRoot,
  nodesCount: graph.nodes.length,
  linksCount: graph.links.length,
  nodeTypes: getGraphCountsByType(graph),
});

const ensureGraphLoaded = async (projectPath?: string): Promise<GraphData> => {
  const state = oracleStore.getState();
  const targetPath = normalizePath(projectPath) || state.baseDir || normalizePath(process.cwd())!;

  if (!state.baseDir || (projectPath && normalizePath(state.baseDir) !== normalizePath(projectPath))) {
    return oracle.analyzeProject(targetPath);
  }

  return oracle.getGraph();
};

const getNodeDependencies = (graph: GraphData, nodeId: string) => {
  const dependencies = graph.links.filter((link) => link.source === nodeId);
  const dependents = graph.links.filter((link) => link.target === nodeId);
  return { dependencies, dependents };
};

const searchGraph = (graph: GraphData, query: string, type?: string, limit = 20) => {
  const normalizedQuery = query.trim().toLowerCase();
  return graph.nodes
    .filter((node) => {
      if (type && node.type !== type) return false;
      if (!normalizedQuery) return true;
      return node.label.toLowerCase().includes(normalizedQuery) || node.id.toLowerCase().includes(normalizedQuery);
    })
    .slice(0, limit);
};

const createTextContent = (payload: unknown) => JSON.stringify(payload, null, 2);

const createMcpServer = () => {
  const server = new McpServer({
    name: 'codemaps-mcp',
    version: '1.0.0',
    websiteUrl: 'https://localhost/codemaps',
  }, {
    capabilities: {
      logging: {},
    },
  });
  const blastRadiusAnalyzer = new BlastRadiusAnalyzer();
  const healthScoreAnalyzer = new HealthScoreAnalyzer();
  const patternDetectionAnalyzer = new PatternDetectionAnalyzer();
  const securityScanner = new SecurityScanner();
  const signatureSearchService = new SignatureSearchService();

  server.registerResource('project-summary', 'codemaps://project/summary', {
    title: 'Project Summary',
    description: 'High-level graph summary for the currently opened project',
    mimeType: 'application/json',
  }, async () => {
    const graph = await ensureGraphLoaded();
    const summary = createGraphSummary(graph);
    return {
      contents: [
        {
          uri: 'codemaps://project/summary',
          mimeType: 'application/json',
          text: createTextContent(summary),
        },
      ],
    };
  });

  server.registerResource('graph-full', 'codemaps://graph/full', {
    title: 'Full Graph',
    description: 'Complete CodeMaps graph for the currently opened project',
    mimeType: 'application/json',
  }, async () => {
    const graph = await ensureGraphLoaded();
    return {
      contents: [
        {
          uri: 'codemaps://graph/full',
          mimeType: 'application/json',
          text: createTextContent(graph),
        },
      ],
    };
  });

  server.registerTool('analyze_project', {
    title: 'Analyze Project',
    description: 'Analyze a project directory and load it into CodeMaps',
    inputSchema: {
      projectPath: z.string().optional().describe('Absolute project path. Defaults to the current open project or process cwd.'),
    },
  }, async ({ projectPath }) => {
    const graph = await ensureGraphLoaded(projectPath);
    const summary = createGraphSummary(graph);
    return {
      content: [
        {
          type: 'text',
          text: createTextContent({
            status: 'ok',
            summary,
          }),
        },
      ],
    };
  });

  server.registerTool('get_graph_context', {
    title: 'Get Graph Context',
    description: 'Return the graph or a compact graph summary for the loaded project',
    inputSchema: {
      includeFullGraph: z.boolean().optional().describe('When true, return the full graph payload.'),
    },
  }, async ({ includeFullGraph = false }) => {
    const graph = await ensureGraphLoaded();
    const payload = includeFullGraph ? graph : createGraphSummary(graph);
    return {
      content: [
        {
          type: 'text',
          text: createTextContent(payload),
        },
      ],
    };
  });

  server.registerTool('get_node_dependencies', {
    title: 'Get Node Dependencies',
    description: 'Return outgoing and incoming links for a specific graph node',
    inputSchema: {
      nodeId: z.string().describe('Exact node id from the graph'),
    },
  }, async ({ nodeId }) => {
    const graph = await ensureGraphLoaded();
    const node = graph.nodes.find((candidate) => candidate.id === nodeId);

    if (!node) {
      return {
        content: [
          {
            type: 'text',
            text: createTextContent({ status: 'error', message: `Node not found: ${nodeId}` }),
          },
        ],
        isError: true,
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: createTextContent({
            status: 'ok',
            node,
            ...getNodeDependencies(graph, nodeId),
          }),
        },
      ],
    };
  });

  server.registerTool('search_graph', {
    title: 'Search Graph',
    description: 'Search nodes by label or id with optional type filter',
    inputSchema: {
      query: z.string().describe('Free-text query to search in node labels and ids'),
      type: z.string().optional().describe('Optional node type filter such as file, directory, class, function, adr'),
      limit: z.number().int().min(1).max(100).optional().describe('Maximum number of matches to return'),
    },
  }, async ({ query, type, limit = 20 }) => {
    const graph = await ensureGraphLoaded();
    const matches = searchGraph(graph, query, type, limit);
    return {
      content: [
        {
          type: 'text',
          text: createTextContent({
            status: 'ok',
            count: matches.length,
            matches,
          }),
        },
      ],
    };
  });

  server.registerTool('get_blast_radius', {
    title: 'Get Blast Radius',
    description: 'Return direct and transitive impact for changing a node',
    inputSchema: {
      nodeId: z.string().describe('Exact node id from the graph'),
      depth: z.number().int().min(1).max(20).optional().describe('Optional traversal depth limit'),
    },
  }, async ({ nodeId, depth }) => {
    const graph = await ensureGraphLoaded();
    const node = graph.nodes.find((candidate) => candidate.id === nodeId);

    if (!node) {
      return {
        content: [
          {
            type: 'text',
            text: createTextContent({ status: 'error', message: `Node not found: ${nodeId}` }),
          },
        ],
        isError: true,
      };
    }

    const blastRadius = blastRadiusAnalyzer.analyze(graph, nodeId, depth);
    return {
      content: [
        {
          type: 'text',
          text: createTextContent({
            status: 'ok',
            node,
            blastRadius,
          }),
        },
      ],
    };
  });

  server.registerTool('get_health_score', {
    title: 'Get Health Score',
    description: 'Compute structural graph health metrics and an overall score',
    inputSchema: {},
  }, async () => {
    const graph = await ensureGraphLoaded();
    const health = healthScoreAnalyzer.analyze(graph);
    return {
      content: [
        {
          type: 'text',
          text: createTextContent({
            status: 'ok',
            health,
          }),
        },
      ],
    };
  });

  server.registerTool('detect_patterns', {
    title: 'Detect Patterns',
    description: 'Detect architectural hotspots and anti-pattern candidates in the graph',
    inputSchema: {
      limit: z.number().int().min(1).max(100).optional().describe('Optional maximum number of patterns to return'),
    },
  }, async ({ limit = 20 }) => {
    const graph = await ensureGraphLoaded();
    const result = patternDetectionAnalyzer.analyze(graph);
    return {
      content: [
        {
          type: 'text',
          text: createTextContent({
            status: 'ok',
            count: Math.min(result.patterns.length, limit),
            patterns: result.patterns.slice(0, limit),
          }),
        },
      ],
    };
  });

  server.registerTool('run_security_scan', {
    title: 'Run Security Scan',
    description: 'Scan indexed source files for high-risk patterns and suspicious artifacts',
    inputSchema: {
      limit: z.number().int().min(1).max(500).optional().describe('Optional maximum number of findings to return'),
    },
  }, async ({ limit = 100 }) => {
    const graph = await ensureGraphLoaded();
    const scan = await securityScanner.analyze(graph);
    return {
      content: [
        {
          type: 'text',
          text: createTextContent({
            status: 'ok',
            summary: scan.summary,
            findings: scan.findings.slice(0, limit),
          }),
        },
      ],
    };
  });

  server.registerTool('search_signatures', {
    title: 'Search Signatures',
    description: 'Search declaration-like code signatures across indexed source files',
    inputSchema: {
      query: z.string().describe('Text or regex pattern to search in declaration signatures'),
      type: z.string().optional().describe('Optional symbol type filter such as function or class'),
      limit: z.number().int().min(1).max(100).optional().describe('Maximum number of matches to return'),
      caseSensitive: z.boolean().optional().describe('Enable case-sensitive matching'),
      regex: z.boolean().optional().describe('Treat query as a regular expression'),
    },
  }, async ({ query, type, limit = 20, caseSensitive = false, regex = false }) => {
    const graph = await ensureGraphLoaded();
    const result = await signatureSearchService.search(graph, query, {
      type,
      limit,
      caseSensitive,
      regex,
    });
    return {
      content: [
        {
          type: 'text',
          text: createTextContent({
            status: 'ok',
            ...result,
          }),
        },
      ],
    };
  });

  return server;
};

const getMcpStatusInternal = (): McpStatus => {
  const graph = getGraphSnapshot();
  return {
    enabled: true,
    host: MCP_HOST,
    port: MCP_PORT,
    path: MCP_PATH,
    endpoint: MCP_HTTP_URL,
    websocketUrl: MCP_WS_URL,
    resources: MCP_RESOURCE_URIS,
    tools: MCP_TOOL_NAMES,
    projectRoot: graph.projectRoot || null,
    nodesCount: graph.nodes.length,
    linksCount: graph.links.length,
  };
};

export const getMcpStatus = (): McpStatus => {
  return mcpService?.getStatus() || getMcpStatusInternal();
};

export function setupMcpServer() {
  if (mcpService) {
    return mcpService;
  }

  const app = createMcpExpressApp({ host: MCP_HOST });
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  app.get('/mcp/status', (_req, res) => {
    res.json({ status: 'ok', ...getMcpStatusInternal() });
  });

  // Legacy compatibility endpoints
  app.get('/mcp/context', async (_req, res) => {
    try {
      const graph = await ensureGraphLoaded();
      res.json({
        status: 'ok',
        projectRoot: graph.projectRoot,
        context: graph,
        metadata: {
          nodesCount: graph.nodes.length,
          linksCount: graph.links.length,
        },
      });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  app.get('/mcp/dependencies', async (req, res) => {
    const targetId = req.query.id as string;
    if (!targetId) {
      return res.status(400).json({ status: 'error', message: 'Missing target id query parameter' });
    }

    const graph = await ensureGraphLoaded();
    return res.json({
      status: 'ok',
      target: targetId,
      ...getNodeDependencies(graph, targetId),
    });
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server });
  const clients = new Set<WebSocket>();
  const transports: Record<string, McpTransportRecord> = {};

  wss.on('connection', (ws) => {
    clients.add(ws);

    const state = oracleStore.getState();
    if (state.baseDir) {
      ws.send(JSON.stringify({
        type: 'graph-updated',
        payload: oracle.getGraph(),
      }));
    }

    ws.on('close', () => {
      clients.delete(ws);
    });
  });

  const handleMcpPost = async (req: express.Request, res: express.Response) => {
    const sessionId = req.headers['mcp-session-id'];

    try {
      let record: McpTransportRecord | undefined;

      if (typeof sessionId === 'string' && transports[sessionId]) {
        record = transports[sessionId];
      } else if (!sessionId && isInitializeRequest(req.body)) {
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (initializedSessionId) => {
            transports[initializedSessionId] = {
              transport,
              server: record!.server,
            };
          },
        });

        transport.onclose = () => {
          const currentSessionId = transport.sessionId;
          if (currentSessionId) {
            delete transports[currentSessionId];
          }
        };

        record = {
          transport,
          server: createMcpServer(),
        };

        await record.server.connect(transport);
        await transport.handleRequest(req, res, req.body);
        return;
      } else {
        res.status(400).json({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Bad Request: No valid MCP session id provided',
          },
          id: null,
        });
        return;
      }

      await record.transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error('Error handling MCP POST request:', error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal server error',
          },
          id: null,
        });
      }
    }
  };

  const handleMcpGet = async (req: express.Request, res: express.Response) => {
    const sessionId = req.headers['mcp-session-id'];
    if (typeof sessionId !== 'string' || !transports[sessionId]) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }

    await transports[sessionId].transport.handleRequest(req, res);
  };

  const handleMcpDelete = async (req: express.Request, res: express.Response) => {
    const sessionId = req.headers['mcp-session-id'];
    if (typeof sessionId !== 'string' || !transports[sessionId]) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }

    await transports[sessionId].transport.handleRequest(req, res);
  };

  app.post(MCP_PATH, handleMcpPost);
  app.get(MCP_PATH, handleMcpGet);
  app.delete(MCP_PATH, handleMcpDelete);

  oracle.on('graph-updated', (graphData) => {
    const diff = oracleStore.getState().getAndResetDiff();
    const message = JSON.stringify({
      type: 'graph-diff',
      payload: {
        graph: graphData,
        diff,
      },
    });

    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  });

  oracle.on('parsing-progress', (progress) => {
    const message = JSON.stringify({
      type: 'parsing-progress',
      payload: progress,
    });

    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  });

  server.listen(MCP_PORT, MCP_HOST, () => {
    console.log(`[MCP] Streamable HTTP endpoint: ${MCP_HTTP_URL}`);
    console.log(`[WS] Graph updates endpoint: ${MCP_WS_URL}`);
  });

  mcpService = {
    server,
    getStatus: getMcpStatusInternal,
  };

  return mcpService;
}
