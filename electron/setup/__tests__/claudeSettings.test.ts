import { describe, expect, it } from 'vitest';
import { HOOK_COMMAND, mergeClaudeSettings } from '../claudeSettings';

describe('mergeClaudeSettings', () => {
  it('creates a settings file with the hook', () => {
    const result = mergeClaudeSettings(null);
    expect(result.outcome).toBe('created');
    const settings = JSON.parse(result.text!);
    expect(settings.hooks.PostToolUse[0].matcher).toBe('Edit|Write|MultiEdit');
    expect(settings.hooks.PostToolUse[0].hooks[0].command).toBe(HOOK_COMMAND);
  });

  it('keeps every other key and every existing hook', () => {
    const existing = JSON.stringify(
      {
        permissions: { allow: ['Bash(npm test)'] },
        hooks: {
          PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo pre' }] }],
          PostToolUse: [{ matcher: 'Edit', hooks: [{ type: 'command', command: 'prettier' }] }],
        },
      },
      null,
      4
    );
    const result = mergeClaudeSettings(existing);
    expect(result.outcome).toBe('merged');
    const settings = JSON.parse(result.text!);
    expect(settings.permissions).toEqual({ allow: ['Bash(npm test)'] });
    expect(settings.hooks.PreToolUse).toHaveLength(1);
    expect(settings.hooks.PostToolUse).toHaveLength(2);
    expect(settings.hooks.PostToolUse[0].hooks[0].command).toBe('prettier');
    expect(result.text).toContain('\n    "permissions"');
  });

  it('is idempotent', () => {
    const first = mergeClaudeSettings('{"model":"opus"}').text!;
    expect(mergeClaudeSettings(first).outcome).toBe('unchanged');
  });

  it('refreshes the command of an older CodeMaps hook without adding a second one', () => {
    const old = JSON.stringify({
      hooks: {
        PostToolUse: [
          {
            matcher: 'Edit',
            hooks: [{ type: 'command', command: 'node old/.codemaps/hooks/validate.mjs' }],
          },
        ],
      },
    });
    const result = mergeClaudeSettings(old);
    expect(result.outcome).toBe('merged');
    const entries = JSON.parse(result.text!).hooks.PostToolUse;
    expect(entries).toHaveLength(1);
    expect(entries[0].hooks[0].command).toBe(HOOK_COMMAND);
  });

  it('refuses invalid JSON and wrong shapes instead of clobbering them', () => {
    expect(mergeClaudeSettings('{ // comment\n}').outcome).toBe('invalid');
    expect(mergeClaudeSettings('[]').outcome).toBe('invalid');
    expect(mergeClaudeSettings('{"hooks":[]}').outcome).toBe('invalid');
    expect(mergeClaudeSettings('{"hooks":{"PostToolUse":{}}}').outcome).toBe('invalid');
  });
});
