import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
const server = new McpServer({ name: 'test', version: '1' });
server.server.notification({ method: 'notifications/resources/list_changed' });
