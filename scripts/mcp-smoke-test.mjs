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
  console.log('[MCP] analyze_project:', JSON.stringify(analyze.content, null, 2));

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
