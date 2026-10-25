// Configuration snippets that connect each supported AI client to the CodeMaps MCP server.

type ClientTitleKey =
  | 'trae'
  | 'cursor'
  | 'claudeCode'
  | 'claudeCodeProject'
  | 'claudeHook'
  | 'claudeHookScript'
  | 'claudeDesktop'
  | 'openCode'
  | 'deepSeek';

type ClientDescriptionKey = `${ClientTitleKey}Description`;

/**
 * One client setup example: its id, the keys of its translated title and description, and the text
 * to copy.
 */
export interface ClientExample {
  id: string;
  /** i18n key suffix under `mcpSettings.` for the title. */
  titleKey: ClientTitleKey;
  /** i18n key suffix under `mcpSettings.` for the description. */
  descriptionKey: ClientDescriptionKey;
  snippet: string;
}

const mcpServersJson = (server: Record<string, unknown>): string =>
  JSON.stringify({ mcpServers: { codemaps: server } }, null, 2);

/** JSON config for Trae pointing at the endpoint. */
export const traeSnippet = (endpoint: string): string => mcpServersJson({ url: endpoint });

/** JSON config for Cursor using the streamable-http transport. */
export const cursorSnippet = (endpoint: string): string =>
  mcpServersJson({ transport: 'streamable-http', url: endpoint });

/** Command that registers the server with Claude Code for the current user. */
export const claudeCodeSnippet = (endpoint: string): string =>
  `claude mcp add --transport http --scope user codemaps ${endpoint}`;

/** Project-level JSON config for Claude Code (.mcp.json) using the http type. */
export const claudeCodeProjectSnippet = (endpoint: string): string =>
  mcpServersJson({ type: 'http', url: endpoint });

/** Claude Desktop config that bridges to the HTTP endpoint through the mcp-remote package. */
export const claudeDesktopSnippet = (endpoint: string): string => `{
  "mcpServers": {
    "codemaps": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "${endpoint}", "--allow-http"]
    }
  }
}`;

/** `opencode.json` entry that registers CodeMaps as a remote MCP server in OpenCode. */
export const openCodeSnippet = (endpoint: string): string =>
  JSON.stringify(
    {
      $schema: 'https://opencode.ai/config.json',
      mcp: { codemaps: { type: 'remote', url: endpoint, enabled: true } },
    },
    null,
    2
  );

/**
 * `cordis.patch.yml` overlay that registers CodeMaps in the DeepSeek Harness (developer preview).
 * DSH configures MCP host-wide, so the file is passed with `--patch` or merged into the DSH home.
 */
export const deepSeekSnippet = (endpoint: string): string => `- insert:
  - id: mcp-codemaps
    name: '@deepseek-ai/dsh-mcp-client'
    config:
      serverName: codemaps
      transport: streamable-http
      url: ${endpoint}`;

/**
 * Claude Code settings that run the validation hook script after Edit, Write and MultiEdit tool
 * calls.
 */
export const claudeHookSnippet = (): string =>
  JSON.stringify(
    {
      hooks: {
        PostToolUse: [
          {
            matcher: 'Edit|Write|MultiEdit',
            hooks: [
              {
                type: 'command',
                command: 'node "$CLAUDE_PROJECT_DIR/.claude/hooks/codemaps-validate-hook.mjs"',
                timeout: 20,
              },
            ],
          },
        ],
      },
    },
    null,
    2
  );

/** All client setup examples, in display order. */
export const buildClientExamples = (endpoint: string, hookScript: string): ClientExample[] => [
  {
    id: 'trae',
    titleKey: 'trae',
    descriptionKey: 'traeDescription',
    snippet: traeSnippet(endpoint),
  },
  {
    id: 'cursor',
    titleKey: 'cursor',
    descriptionKey: 'cursorDescription',
    snippet: cursorSnippet(endpoint),
  },
  {
    id: 'claude-code',
    titleKey: 'claudeCode',
    descriptionKey: 'claudeCodeDescription',
    snippet: claudeCodeSnippet(endpoint),
  },
  {
    id: 'claude-code-project',
    titleKey: 'claudeCodeProject',
    descriptionKey: 'claudeCodeProjectDescription',
    snippet: claudeCodeProjectSnippet(endpoint),
  },
  {
    id: 'claude-hook',
    titleKey: 'claudeHook',
    descriptionKey: 'claudeHookDescription',
    snippet: claudeHookSnippet(),
  },
  {
    id: 'claude-hook-script',
    titleKey: 'claudeHookScript',
    descriptionKey: 'claudeHookScriptDescription',
    snippet: hookScript,
  },
  {
    id: 'claude-desktop',
    titleKey: 'claudeDesktop',
    descriptionKey: 'claudeDesktopDescription',
    snippet: claudeDesktopSnippet(endpoint),
  },
  {
    id: 'opencode',
    titleKey: 'openCode',
    descriptionKey: 'openCodeDescription',
    snippet: openCodeSnippet(endpoint),
  },
  {
    id: 'deepseek-harness',
    titleKey: 'deepSeek',
    descriptionKey: 'deepSeekDescription',
    snippet: deepSeekSnippet(endpoint),
  },
];
