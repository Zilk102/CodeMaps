import { describe, expect, it } from 'vitest';
import { MCP_TOOLS } from '../descriptors';
import { createMcpServerInstance } from '../bootstrap';
import { MAX_INSTRUCTIONS_LENGTH, SERVER_INSTRUCTIONS } from '../serverInstructions';

const registeredToolNames = (): string[] => {
  const server = createMcpServerInstance() as unknown as {
    _registeredTools: Record<string, unknown>;
  };
  return Object.keys(server._registeredTools);
};

describe('MCP server instructions', () => {
  it('stay short enough for every client to show them', () => {
    expect(SERVER_INSTRUCTIONS.length).toBeLessThanOrEqual(MAX_INSTRUCTIONS_LENGTH);
  });

  it('send the agent to setup_project first and describe the core loop', () => {
    expect(SERVER_INSTRUCTIONS).toContain('`setup_project`');
    expect(SERVER_INSTRUCTIONS).toContain('upToDate');
    for (const tool of [
      'prepare_task_context',
      'find_duplicates',
      'validate_architecture_changes',
      'check_documentation',
    ]) {
      expect(SERVER_INSTRUCTIONS).toContain(`\`${tool}\``);
    }
  });

  it('open with the trigger and demand the working directory as projectPath', () => {
    expect(
      SERVER_INSTRUCTIONS.startsWith(
        'At the start of every session in a project, before anything else, call `setup_project` with projectPath set to your current working directory'
      )
    ).toBe(true);
  });

  it('mention only tools that are registered on the server', () => {
    const mentioned = [...SERVER_INSTRUCTIONS.matchAll(/`([a-z]+(?:_[a-z0-9]+)+)`/g)].map(
      (match) => match[1]
    );
    const registered = registeredToolNames();
    expect(mentioned.length).toBeGreaterThan(5);
    for (const name of mentioned) {
      expect(registered, `${name} is mentioned but not registered`).toContain(name);
    }
  });

  it('are delivered through the server options', () => {
    const server = createMcpServerInstance() as unknown as {
      server: { _instructions?: string };
    };
    expect(server.server._instructions).toBe(SERVER_INSTRUCTIONS);
  });

  it('register exactly the tools the descriptors list, setup_project included', () => {
    expect(registeredToolNames().sort()).toEqual(MCP_TOOLS.map((tool) => tool.name).sort());
    expect(MCP_TOOLS.map((tool) => tool.name)).toContain('setup_project');
  });
});
