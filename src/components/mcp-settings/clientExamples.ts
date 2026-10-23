type ClientTitleKey =
  | 'trae'
  | 'cursor'
  | 'claudeCode'
  | 'claudeCodeProject'
  | 'claudeHook'
  | 'claudeHookScript'
  | 'claudeDesktop';

type ClientDescriptionKey = `${ClientTitleKey}Description`;

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

export const traeSnippet = (endpoint: string): string => mcpServersJson({ url: endpoint });

export const cursorSnippet = (endpoint: string): string =>
  mcpServersJson({ transport: 'streamable-http', url: endpoint });

export const claudeCodeSnippet = (endpoint: string): string =>
  `claude mcp add --transport http --scope user codemaps ${endpoint}`;

export const claudeCodeProjectSnippet = (endpoint: string): string =>
  mcpServersJson({ type: 'http', url: endpoint });

export const claudeDesktopSnippet = (endpoint: string): string => `{
  "mcpServers": {
    "codemaps": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "${endpoint}", "--allow-http"]
    }
  }
}`;

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
];
