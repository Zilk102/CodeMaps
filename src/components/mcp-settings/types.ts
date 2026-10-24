// Shape of the MCP server status that the main process reports to the settings modal.
/**
 * A tool as listed in the status: its name, title and description, whether agents should prefer it
 * and when to use it.
 */
export interface McpStatusToolDescriptor {
  name: string;
  title: string;
  description: string;
  preferredForAgents?: boolean;
  recommendedWhen?: string;
}

/**
 * A resource as listed in the status: URI, title, description and whether agents should prefer it.
 */
export interface McpStatusResourceDescriptor {
  uri: string;
  title: string;
  description: string;
  preferredForAgents?: boolean;
}

/**
 * Server status: whether it is enabled, where it listens (HTTP and WebSocket), the registered
 * tools and resources, the open project, graph size and a startup error if it failed.
 */
export interface McpStatus {
  enabled: boolean;
  host: string;
  port: number;
  path: string;
  endpoint: string;
  websocketUrl: string;
  resources: string[];
  tools: string[];
  resourceDetails?: McpStatusResourceDescriptor[];
  toolDetails?: McpStatusToolDescriptor[];
  projectRoot: string | null;
  nodesCount: number;
  linksCount: number;
  error?: 'port_in_use' | 'listen_failed' | null;
}

/** Tabs of the MCP settings modal. */
export type SettingsTab = 'overview' | 'tools' | 'resources' | 'clients' | 'agent-skill';
