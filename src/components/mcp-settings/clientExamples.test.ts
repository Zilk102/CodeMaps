import { describe, expect, it } from 'vitest';
import {
  buildClientExamples,
  claudeCodeSnippet,
  claudeDesktopSnippet,
  cursorSnippet,
  deepSeekSnippet,
  openCodeSnippet,
  traeSnippet,
} from './clientExamples';

const endpoint = 'http://127.0.0.1:3005/mcp';

describe('clientExamples', () => {
  it('produces the same snippets the settings dialog always showed', () => {
    expect(traeSnippet(endpoint)).toBe(
      `{\n  "mcpServers": {\n    "codemaps": {\n      "url": "${endpoint}"\n    }\n  }\n}`
    );
    expect(cursorSnippet(endpoint)).toBe(
      `{\n  "mcpServers": {\n    "codemaps": {\n      "transport": "streamable-http",\n      "url": "${endpoint}"\n    }\n  }\n}`
    );
    expect(claudeCodeSnippet(endpoint)).toBe(
      `claude mcp add --transport http --scope user codemaps ${endpoint}`
    );
    expect(claudeDesktopSnippet(endpoint)).toContain(
      `"args": ["-y", "mcp-remote", "${endpoint}", "--allow-http"]`
    );
  });

  it('builds the OpenCode remote entry and the DeepSeek Harness overlay', () => {
    expect(JSON.parse(openCodeSnippet(endpoint))).toEqual({
      $schema: 'https://opencode.ai/config.json',
      mcp: { codemaps: { type: 'remote', url: endpoint, enabled: true } },
    });
    const yaml = deepSeekSnippet(endpoint);
    expect(yaml.startsWith('- insert:\n  - id: mcp-codemaps\n')).toBe(true);
    expect(yaml).toContain('transport: streamable-http');
    expect(yaml).toContain(`url: ${endpoint}`);
  });

  it('lists every client in order and embeds the hook script', () => {
    const examples = buildClientExamples(endpoint, 'SCRIPT');
    expect(examples.map((e) => e.id)).toEqual([
      'trae',
      'cursor',
      'claude-code',
      'claude-code-project',
      'claude-hook',
      'claude-hook-script',
      'claude-desktop',
      'opencode',
      'deepseek-harness',
    ]);
    expect(examples.find((e) => e.id === 'claude-hook-script')?.snippet).toBe('SCRIPT');
    expect(JSON.parse(examples[4].snippet).hooks.PostToolUse[0].matcher).toBe(
      'Edit|Write|MultiEdit'
    );
  });
});
