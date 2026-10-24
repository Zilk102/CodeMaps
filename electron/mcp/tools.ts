/** Single entry point that attaches every MCP tool group to a server. */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ServiceRegistry } from './ServiceRegistry';
import { registerAdvancedTools } from './registerAdvancedTools';
import { registerAnalysisTools } from './registerAnalysisTools';
import { registerContextTools } from './registerContextTools';
import { registerDocumentationTools } from './registerDocumentationTools';
import { registerDuplicateTools } from './registerDuplicateTools';
import { registerGraphTools } from './registerGraphTools';
import { registerSetupTools } from './registerSetupTools';
import { resolveMcpToolContext } from './toolContext';

/** Resolves the services from `registry` and registers the graph, analysis, duplicate, documentation, setup, advanced and context tool groups on `server`. */
export function registerTools(server: McpServer, registry: ServiceRegistry) {
  const context = resolveMcpToolContext(registry);
  registerGraphTools(server, context);
  registerAnalysisTools(server, context);
  registerDuplicateTools(server);
  registerDocumentationTools(server);
  registerSetupTools(server);
  registerAdvancedTools(server);
  registerContextTools(server, context);
}
