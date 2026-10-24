/** Builds a fully wired MCP server instance: analysis services, resources and tools. */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ArchitectureInsightService } from '../analysis/ArchitectureInsightService';
import { BlastRadiusAnalyzer } from '../analysis/BlastRadiusAnalyzer';
import { ChangeCampaignService } from '../analysis/ChangeCampaignService';
import { ChangeContextService } from '../analysis/ChangeContextService';
import { HealthScoreAnalyzer } from '../analysis/HealthScoreAnalyzer';
import { PatternDetectionAnalyzer } from '../analysis/PatternDetectionAnalyzer';
import { ProjectInsightService } from '../analysis/ProjectInsightService';
import { ReviewContextService } from '../analysis/ReviewContextService';
import { SecurityScanner } from '../analysis/SecurityScanner';
import { SignatureSearchService } from '../analysis/SignatureSearchService';
import { TaskIntelligenceService } from '../analysis/TaskIntelligenceService';
import { registerResources } from './resources';
import { ServiceRegistry } from './ServiceRegistry';
import { registerTools } from './tools';

/** Version reported to MCP clients: the Electron app version, or `0.0.0` when Electron is unavailable (unit tests, plain Node). */
const resolveAppVersion = (): string => {
  try {
    // Lazy require keeps this module loadable in unit tests, where Electron is unavailable.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { app } = require('electron') as typeof import('electron');
    return app?.getVersion?.() || '0.0.0';
  } catch {
    return '0.0.0';
  }
};

/**
 * Creates one `McpServer` named `codemaps-mcp` with all services registered and every resource and tool attached.
 * Called once per client session; the services themselves live in the shared registry, so repeated calls re-register them and replace the previous instances.
 */
export const createMcpServerInstance = () => {
  const server = new McpServer(
    {
      name: 'codemaps-mcp',
      version: resolveAppVersion(),
      websiteUrl: 'https://github.com/Zilk102/CodeMaps',
    },
    {
      capabilities: {
        logging: {},
      },
    }
  );

  const registry = ServiceRegistry.getInstance();
  const projectInsightService = new ProjectInsightService();
  const changeContextService = new ChangeContextService();
  const reviewContextService = new ReviewContextService();

  registry.register('blastRadiusAnalyzer', new BlastRadiusAnalyzer());
  registry.register('healthScoreAnalyzer', new HealthScoreAnalyzer());
  registry.register('patternDetectionAnalyzer', new PatternDetectionAnalyzer());
  registry.register('securityScanner', new SecurityScanner());
  registry.register('signatureSearchService', new SignatureSearchService());
  registry.register('architectureInsightService', new ArchitectureInsightService());
  registry.register('changeContextService', changeContextService);
  registry.register('reviewContextService', reviewContextService);
  registry.register('projectInsightService', projectInsightService);
  registry.register(
    'taskIntelligenceService',
    new TaskIntelligenceService({
      projectInsight: projectInsightService,
      changeContext: changeContextService,
      reviewContext: reviewContextService,
    })
  );
  registry.register('changeCampaignService', new ChangeCampaignService());

  registerResources(server, projectInsightService);
  registerTools(server, registry);

  return server;
};
