import { describe, expect, it } from 'vitest';
import en from '../../../src/i18n/locales/en.json';
import { MCP_RESOURCES, MCP_TOOLS } from '../descriptors';

describe('MCP descriptors', () => {
  it('lists every tool and resource exactly once', () => {
    const toolNames = MCP_TOOLS.map((tool) => tool.name);
    const resourceUris = MCP_RESOURCES.map((resource) => resource.uri);
    expect(new Set(toolNames).size).toBe(toolNames.length);
    expect(new Set(resourceUris).size).toBe(resourceUris.length);
  });

  it('has localized title, description and usage hint for every tool', () => {
    const localized = en.mcpSettings.tools as Record<string, Record<string, string>>;
    for (const tool of MCP_TOOLS) {
      const entry = localized[tool.name];
      expect(entry, `missing en.mcpSettings.tools.${tool.name}`).toBeDefined();
      expect(entry.title).toBeTruthy();
      expect(entry.description).toBeTruthy();
      expect(entry.recommendedWhen).toBeTruthy();
    }
  });
});
