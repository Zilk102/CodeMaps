import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ProjectInsightService } from '../analysis/ProjectInsightService';
import {
  ensureGraphLoaded,
  createGraphSummary,
  createTextContent,
  createAgentPlaybook,
} from './utils';

export function registerResources(
  server: McpServer,
  projectInsightService: ProjectInsightService
) {
  server.registerResource(
    'project-summary',
    'codemaps://project/summary',
    {
      title: 'Project Summary',
      description: 'High-level graph summary for the currently opened project',
      mimeType: 'application/json',
    },
    async () => {
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
    }
  );

  server.registerResource(
    'graph-full',
    'codemaps://graph/full',
    {
      title: 'Full Graph',
      description: 'Complete CodeMaps graph for the currently opened project',
      mimeType: 'application/json',
    },
    async () => {
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
    }
  );

  server.registerResource(
    'agent-playbook',
    'codemaps://agent/playbook',
    {
      title: 'Agent Playbook',
      description: 'Preferred agent-first workflow for CodeMaps',
      mimeType: 'application/json',
    },
    async () => {
      return {
        contents: [
          {
            uri: 'codemaps://agent/playbook',
            mimeType: 'application/json',
            text: createTextContent(createAgentPlaybook()),
          },
        ],
      };
    }
  );

  server.registerResource(
    'project-brain',
    'codemaps://agent/project-brain',
    {
      title: 'Project Brain',
      description: 'Project-level architectural mental model for agent-first understanding',
      mimeType: 'application/json',
    },
    async () => {
      const graph = await ensureGraphLoaded();
      const context = await projectInsightService.prepareContext(graph, {
        includeSecurityFindings: true,
        includeClassifications: false,
        limit: 8,
      });
      return {
        contents: [
          {
            uri: 'codemaps://agent/project-brain',
            mimeType: 'application/json',
            text: createTextContent(context),
          },
        ],
      };
    }
  );
}
