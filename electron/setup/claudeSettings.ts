/**
 * Adds the CodeMaps validation hook to `.claude/settings.json` without disturbing anything else.
 * The file is parsed, the one hook entry is added or refreshed, and it is written back with every
 * other key and every other hook exactly as the user had them. A file that is not valid JSON is
 * never rewritten: the caller reports it and the user fixes it.
 */

/** The relative path that identifies a hook entry as CodeMaps' own. */
export const HOOK_SCRIPT_PATH = '.codemaps/hooks/validate.mjs';

/** The command Claude Code runs after an edit; `$CLAUDE_PROJECT_DIR` keeps it working from any cwd. */
export const HOOK_COMMAND = `node "$CLAUDE_PROJECT_DIR/${HOOK_SCRIPT_PATH}"`;

const HOOK_MATCHER = 'Edit|Write|MultiEdit';
const HOOK_TIMEOUT_SECONDS = 20;

type JsonObject = Record<string, unknown>;

/** The result of merging the hook into a settings file. */
export interface SettingsMerge {
  outcome: 'created' | 'merged' | 'unchanged' | 'invalid';
  /** New file text; undefined unless the file must be written. */
  text?: string;
  reason?: string;
}

const isObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isCodeMapsHook = (hook: unknown): boolean =>
  isObject(hook) && typeof hook.command === 'string' && hook.command.includes(HOOK_SCRIPT_PATH);

const ownHookEntry = (): JsonObject => ({
  type: 'command',
  command: HOOK_COMMAND,
  timeout: HOOK_TIMEOUT_SECONDS,
});

/** Indentation of the existing file (two spaces when it cannot be told), so the diff stays small. */
const detectIndent = (text: string): string | number => {
  const match = /^([ \t]+)"/m.exec(text);
  return match ? match[1] : 2;
};

/** Finds the CodeMaps hook inside the `PostToolUse` entries; returns it so it can be refreshed. */
const findOwnHook = (entries: unknown[]): JsonObject | null => {
  for (const entry of entries) {
    const hooks = isObject(entry) && Array.isArray(entry.hooks) ? entry.hooks : [];
    const own = hooks.find(isCodeMapsHook);
    if (own) return own as JsonObject;
  }
  return null;
};

/** Returns the `PostToolUse` array of `settings`, creating the containers; null when a foreign shape is in the way. */
const postToolUseOf = (settings: JsonObject): unknown[] | null => {
  const hooks = settings.hooks ?? (settings.hooks = {});
  if (!isObject(hooks)) return null;
  const entries = hooks.PostToolUse ?? (hooks.PostToolUse = []);
  return Array.isArray(entries) ? entries : null;
};

/** Parses the settings text; a missing or blank file is an empty object, anything unusable is reported. */
const parseSettings = (existing: string | null): { settings: JsonObject } | { reason: string } => {
  if (existing === null || existing.trim() === '') return { settings: {} };
  try {
    const parsed: unknown = JSON.parse(existing);
    return isObject(parsed) ? { settings: parsed } : { reason: 'the file is not a JSON object' };
  } catch {
    return { reason: 'the file is not valid JSON, fix it and run again' };
  }
};

/**
 * Merges the hook into the settings text (`null` for a missing file). Existing hooks, matchers
 * and unrelated keys are preserved; an existing CodeMaps hook is refreshed only when its command
 * differs. Invalid JSON, or a `hooks` value of the wrong type, yields `invalid` with a reason.
 */
export const mergeClaudeSettings = (existing: string | null): SettingsMerge => {
  const parsed = parseSettings(existing);
  if ('reason' in parsed) return { outcome: 'invalid', reason: parsed.reason };
  const entries = postToolUseOf(parsed.settings);
  if (!entries)
    return { outcome: 'invalid', reason: '"hooks.PostToolUse" has an unexpected shape' };

  const own = findOwnHook(entries);
  if (own && own.command === HOOK_COMMAND) return { outcome: 'unchanged' };
  if (own) own.command = HOOK_COMMAND;
  else entries.push({ matcher: HOOK_MATCHER, hooks: [ownHookEntry()] });

  const text = `${JSON.stringify(parsed.settings, null, existing ? detectIndent(existing) : 2)}
`;
  return { outcome: existing === null ? 'created' : 'merged', text };
};
