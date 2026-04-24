import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const endpoint = process.env.MCP_ENDPOINT || 'http://127.0.0.1:3005/mcp';
const projectPath = process.env.MCP_PROJECT_PATH || 'D:/PROJECT/CodeMaps';

const client = new Client({
  name: 'codemaps-smoke-test',
  version: '1.0.0',
}, {
  capabilities: {},
});

const transport = new StreamableHTTPClientTransport(new URL(endpoint));

const parseFirstTextPayload = (response, toolName) => {
  const textItem = response.content?.find((item) => item.type === 'text');
  if (!textItem?.text) {
    throw new Error(`[MCP] ${toolName}: empty text payload`);
  }

  let payload;
  try {
    payload = JSON.parse(textItem.text);
  } catch {
    throw new Error(`[MCP] ${toolName}: non-JSON payload: ${textItem.text}`);
  }

  if (payload?.status === 'error') {
    throw new Error(`[MCP] ${toolName}: ${payload.message || 'unknown error'}`);
  }

  return payload;
};

try {
  await client.connect(transport);

  const tools = await client.listTools();
  console.log('[MCP] tools:', tools.tools.map((tool) => tool.name).join(', '));

  const analyze = await client.callTool({
    name: 'analyze_project',
    arguments: {
      projectPath,
    },
  });
  const analyzePayload = parseFirstTextPayload(analyze, 'analyze_project');
  console.log('[MCP] analyze_project:', JSON.stringify(analyzePayload, null, 2));

  const graphContext = await client.callTool({
    name: 'get_graph_context',
    arguments: {
      includeFullGraph: true,
    },
  });
  const fullGraph = parseFirstTextPayload(graphContext, 'get_graph_context');
  const incomingCounts = new Map();
  for (const link of fullGraph.links) {
    incomingCounts.set(link.target, (incomingCounts.get(link.target) || 0) + 1);
  }
  const blastTarget = fullGraph.nodes.find((node) => (incomingCounts.get(node.id) || 0) > 0) || fullGraph.nodes.find((node) => node.type === 'file') || fullGraph.nodes[0];
  if (!blastTarget) {
    throw new Error('[MCP] No nodes returned from graph context');
  }

  const healthScore = await client.callTool({
    name: 'get_health_score',
    arguments: {},
  });
  console.log('[MCP] get_health_score:', JSON.stringify(parseFirstTextPayload(healthScore, 'get_health_score'), null, 2));

  const patterns = await client.callTool({
    name: 'detect_patterns',
    arguments: {
      limit: 10,
    },
  });
  console.log('[MCP] detect_patterns:', JSON.stringify(parseFirstTextPayload(patterns, 'detect_patterns'), null, 2));

  const security = await client.callTool({
    name: 'run_security_scan',
    arguments: {
      limit: 20,
    },
  });
  console.log('[MCP] run_security_scan:', JSON.stringify(parseFirstTextPayload(security, 'run_security_scan'), null, 2));

  const signatureSearch = await client.callTool({
    name: 'search_signatures',
    arguments: {
      query: 'analyze',
      limit: 10,
    },
  });
  console.log('[MCP] search_signatures:', JSON.stringify(parseFirstTextPayload(signatureSearch, 'search_signatures'), null, 2));

  const blastRadius = await client.callTool({
    name: 'get_blast_radius',
    arguments: {
      nodeId: blastTarget.id,
      depth: 3,
    },
  });
  console.log('[MCP] get_blast_radius:', JSON.stringify(parseFirstTextPayload(blastRadius, 'get_blast_radius'), null, 2));

  const resources = await client.listResources();
  console.log('[MCP] resources:', resources.resources.map((resource) => resource.uri).join(', '));

  const summary = await client.readResource({
    uri: 'codemaps://project/summary',
  });
  console.log('[MCP] project summary:', JSON.stringify(summary.contents, null, 2));

  await transport.terminateSession().catch(() => undefined);
  await client.close();
} catch (error) {
  console.error('[MCP] smoke test failed:', error);
  process.exitCode = 1;
}
