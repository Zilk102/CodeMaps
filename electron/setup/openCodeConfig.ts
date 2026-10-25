/**
 * Adds the `codemaps` MCP server to an OpenCode project config (`opencode.json`) without
 * disturbing anything else. Only plain JSON is edited: a file with comments, a `.jsonc` file or any
 * unexpected shape is left alone and the exact snippet is handed to the user instead. The entry
 * shape follows the OpenCode documentation (`mcp.<name>` with `type: "remote"`); the newer
 * `mcp.servers.<name>` layout is used only when the file already has it. That the server speaks
 * the transport OpenCode expects (Streamable HTTP) is not confirmed by the documentation.
 */

/** Plain-JSON project config of OpenCode, relative to the project root. */
export const OPENCODE_CONFIG_PATH = 'opencode.json';

/** JSONC variant of the config; it may hold comments, so CodeMaps never edits it. */
export const OPENCODE_JSONC_PATH = 'opencode.jsonc';

/** Schema URL OpenCode documents for its config. */
const OPENCODE_SCHEMA = 'https://opencode.ai/config.json';

type JsonObject = Record<string, unknown>;

/** The result of merging the server entry into a config file. */
export interface OpenCodeMerge {
  outcome: 'created' | 'merged' | 'unchanged' | 'skipped';
  /** New file text; undefined unless the file must be written. */
  text?: string;
  reason?: string;
}

const isObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The `codemaps` server entry for `endpoint`. */
export const openCodeServerEntry = (endpoint: string): JsonObject => ({
  type: 'remote',
  url: endpoint,
  enabled: true,
});

/** The complete config a user can paste when CodeMaps cannot edit their file. */
export const openCodeSnippet = (endpoint: string): string =>
  JSON.stringify(
    { $schema: OPENCODE_SCHEMA, mcp: { codemaps: openCodeServerEntry(endpoint) } },
    null,
    2
  );

const indentOf = (text: string): string | number => {
  const match = /^([ \t]+)"/m.exec(text);
  return match ? match[1] : 2;
};

const skipped = (reason: string): OpenCodeMerge => ({ outcome: 'skipped', reason });

/** The object that should hold the `codemaps` entry: `mcp.servers` when the file uses it, otherwise `mcp`; null when `mcp` is not an object. */
const serverContainer = (config: JsonObject): JsonObject | null => {
  const mcp = config.mcp ?? (config.mcp = {});
  if (!isObject(mcp)) return null;
  return isObject(mcp.servers) ? mcp.servers : mcp;
};

const parseConfig = (text: string): JsonObject | null => {
  try {
    const parsed: unknown = JSON.parse(text);
    return isObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

/**
 * Merges the `codemaps` entry into the config text (`null` for a missing file). A missing file is
 * created with `$schema`; existing servers and keys are kept; an existing `codemaps` entry is
 * never changed. Text that is not a plain JSON object is skipped with a reason.
 */
export const mergeOpenCodeConfig = (existing: string | null, endpoint: string): OpenCodeMerge => {
  if (existing === null || existing.trim() === '') {
    return { outcome: 'created', text: `${openCodeSnippet(endpoint)}\n` };
  }
  const config = parseConfig(existing);
  if (!config) {
    return skipped('is not plain JSON (comments or invalid), add the codemaps entry by hand');
  }
  const container = serverContainer(config);
  if (!container) return skipped('"mcp" is not an object, add the codemaps entry by hand');
  if (container.codemaps !== undefined) return { outcome: 'unchanged' };
  container.codemaps = openCodeServerEntry(endpoint);
  return { outcome: 'merged', text: `${JSON.stringify(config, null, indentOf(existing))}\n` };
};
