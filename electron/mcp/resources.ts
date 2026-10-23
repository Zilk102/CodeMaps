import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ProjectInsightService } from '../analysis/ProjectInsightService';
import {
  ensureGraphLoaded,
  createGraphSummary,
  createTextContent,
  createAgentPlaybook,
} from './utils';

interface ResourceDefinition {
  name: string;
  uri: string;
  title: string;
  description: string;
  /** Builds the JSON payload served for the resource. */
  read: () => Promise<unknown> | unknown;
}

const registerJsonResource = (server: McpServer, definition: ResourceDefinition) => {
  const { name, uri, title, description, read } = definition;
  server.registerResource(
    name,
    uri,
    { title, description, mimeType: 'application/json' },
    async () => ({
      contents: [{ uri, mimeType: 'application/json', text: createTextContent(await read()) }],
    })
  );
};

export function registerResources(server: McpServer, projectInsightService: ProjectInsightService) {
  const definitions: ResourceDefinition[] = [
    {
      name: 'project-summary',
      uri: 'codemaps://project/summary',
      title: 'Project Summary',
      description: 'High-level graph summary for the currently opened project',
      read: async () => createGraphSummary(await ensureGraphLoaded()),
    },
    {
      name: 'graph-full',
      uri: 'codemaps://graph/full',
      title: 'Full Graph',
      description: 'Complete CodeMaps graph for the currently opened project',
      read: () => ensureGraphLoaded(),
    },
    {
      name: 'agent-playbook',
      uri: 'codemaps://agent/playbook',
      title: 'Agent Playbook',
      description: 'Preferred agent-first workflow for CodeMaps',
      read: () => createAgentPlaybook(),
    },
    {
      name: 'project-brain',
      uri: 'codemaps://agent/project-brain',
      title: 'Project Brain',
      description: 'Project-level architectural mental model for agent-first understanding',
      read: async () =>
        projectInsightService.prepareContext(await ensureGraphLoaded(), {
          includeSecurityFindings: true,
          includeClassifications: false,
          limit: 8,
        }),
    },
  ];

  for (const definition of definitions) registerJsonResource(server, definition);
}
