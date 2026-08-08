import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ServiceRegistry } from './ServiceRegistry';
import { registerAdvancedTools } from './registerAdvancedTools';
import { registerAnalysisTools } from './registerAnalysisTools';
import { registerContextTools } from './registerContextTools';
import { registerGraphTools } from './registerGraphTools';
import { resolveMcpToolContext } from './toolContext';

export function registerTools(server: McpServer, registry: ServiceRegistry) {
  const context = resolveMcpToolContext(registry);
  registerGraphTools(server, context);
  registerAnalysisTools(server, context);
  registerAdvancedTools(server);
  registerContextTools(server, context);
}
