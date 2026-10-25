/**
 * The OpenCode plugin `setup_project` writes to `.opencode/plugins/codemaps-validate.ts`. It is
 * plain JavaScript (valid TypeScript as well) so it needs no build step, and it is the OpenCode
 * counterpart of the Claude Code edit hook: after an edit it runs the installed
 * `.codemaps/hooks/validate.mjs` and hands the problems back to the model.
 *
 * Best-effort by design: OpenCode's plugin payload shapes (the path inside `file.edited`, the
 * `input` and `output` of `tool.execute.after`) are not documented precisely, so the plugin reads
 * the path from several possible properties and stays silent on any shape it does not understand.
 */

/** The OpenCode plugin source; the marker token receives the version marker. */
export const OPENCODE_PLUGIN_TEMPLATE = `{{CODEMAPS_FILE_MARKER}}
/**
 * CodeMaps edit validation for OpenCode. BEST-EFFORT: the payload shapes of OpenCode plugin events
 * are not fully documented, so this plugin looks for the edited path in several places and does
 * nothing when it finds none. It never throws, never blocks a tool call and stays silent unless the
 * CodeMaps hook (.codemaps/hooks/validate.mjs) reports a new problem. Written by CodeMaps
 * setup_project; delete the file to remove it. Set CODEMAPS_HOOK_DISABLED=1 to turn it off.
 */
import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

const HOOK_PATH = path.join('.codemaps', 'hooks', 'validate.mjs');
const EDIT_TOOL = /edit|write|patch/i;
const PATH_KEYS = ['filePath', 'file_path', 'filepath', 'path', 'file', 'filename'];
const CONTAINER_KEYS = ['args', 'input', 'properties', 'metadata', 'state'];
const HOOK_TIMEOUT_MS = 20000;
const RECENT_MS = 10000;
const MAX_MESSAGE_CHARS = 2000;

/** The first file path found in \`value\` or one level inside its usual containers; null when there is none. */
const pathIn = (value, depth = 0) => {
  if (typeof value !== 'object' || value === null || depth > 1) return null;
  for (const key of PATH_KEYS) {
    if (typeof value[key] === 'string' && value[key] !== '') return value[key];
  }
  for (const key of CONTAINER_KEYS) {
    const found = pathIn(value[key], depth + 1);
    if (found) return found;
  }
  return null;
};

/** Runs the CodeMaps hook for one edited file; resolves with its problem report, or '' when there is none. Never rejects. */
const runHook = (directory, file) =>
  new Promise((resolve) => {
    try {
      if (!fs.existsSync(path.join(directory, HOOK_PATH))) return resolve('');
      const child = execFile(
        'node',
        [HOOK_PATH],
        { cwd: directory, timeout: HOOK_TIMEOUT_MS, windowsHide: true },
        (error, _stdout, stderr) =>
          resolve(error && error.code === 2 ? String(stderr).trim().slice(0, MAX_MESSAGE_CHARS) : '')
      );
      child.stdin.on('error', () => undefined);
      child.stdin.end(
        JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: file }, cwd: directory })
      );
    } catch {
      resolve('');
    }
  });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** The plugin: validates files OpenCode edits and appends new problems to the tool output. */
export const CodeMapsValidate = async (context) => {
  try {
    const directory =
      typeof context?.directory === 'string' && context.directory ? context.directory : process.cwd();
    const recent = new Map();
    const keyOf = (file) => path.resolve(directory, file).toLowerCase();

    return {
      'tool.execute.after': async (input, output) => {
        try {
          if (typeof input?.tool !== 'string' || !EDIT_TOOL.test(input.tool)) return;
          const file = pathIn(input) ?? pathIn(output);
          if (!file) return;
          recent.set(keyOf(file), Date.now());
          const message = await runHook(directory, file);
          if (message && typeof output?.output === 'string') {
            output.output = output.output + '\\n\\n[CodeMaps] ' + message;
          }
        } catch {
          // Best-effort: a validation problem must never disturb the tool call.
        }
      },
      event: async (payload) => {
        try {
          const event = payload?.event;
          if (event?.type !== 'file.edited') return;
          const file = pathIn(event.properties) ?? pathIn(event);
          if (!file) return;
          await sleep(300);
          const handled = recent.get(keyOf(file));
          if (handled !== undefined && Date.now() - handled < RECENT_MS) return;
          const message = await runHook(directory, file);
          if (message) {
            await context?.client?.app?.log?.({
              body: { service: 'codemaps', level: 'warn', message },
            });
          }
        } catch {
          // Best-effort, see above.
        }
      },
    };
  } catch {
    return {};
  }
};
`;
