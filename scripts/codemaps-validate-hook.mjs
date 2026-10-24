#!/usr/bin/env node
/**
 * Claude Code PostToolUse hook: after Claude edits a source file, ask a running CodeMaps
 * to validate that file (god files, clones, long/complex methods, hubs, mixed
 * responsibilities) and hand the problems straight back to Claude.
 *
 * Silent when everything is fine, when CodeMaps is not running, or when CodeMaps has a
 * different project open (the hook never switches CodeMaps' active project). Dependency
 * free: it speaks MCP Streamable HTTP with plain fetch, so it works from any project.
 *
 * Environment:
 *   CODEMAPS_MCP_URL          MCP endpoint (default http://127.0.0.1:3005/mcp)
 *   CODEMAPS_HOOK_SETTLE_MS   wait for CodeMaps to re-index the saved file (default 1200)
 *   CODEMAPS_HOOK_DISABLED    set to 1 to turn the hook off
 *   CODEMAPS_HOOK_DEBUG       set to 1 to print why the hook stayed silent
 *   CODEMAPS_HOOK_STATE_DIR   where the "already reported" memory lives (default: temp dir)
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const SOURCE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.py',
  '.java',
  '.kt',
  '.go',
  '.rs',
  '.cs',
  '.cpp',
  '.cc',
  '.c',
  '.h',
  '.hpp',
  '.swift',
  '.rb',
  '.php',
]);
const IGNORED_SEGMENTS = [
  'node_modules',
  'dist',
  'dist-electron',
  'dist-renderer',
  'release',
  '.git',
  'build',
];
const REPEAT_WINDOW_MS = 15 * 60 * 1000;
const MAX_REPORT_CHARS = 1600;
const REQUEST_TIMEOUT_MS = 8000;

const normalize = (value) => value.replace(/\\/g, '/');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// A Windows drive path is absolute on every platform; CodeMaps reports project roots that way.
const isAbsolutePath = (value) => path.isAbsolute(value) || /^[A-Za-z]:[\\/]/.test(value);

/** Whether an edited path is a source file worth validating: a known source extension and no dependency, build or VCS folder in its path. */
export const isCandidateFile = (filePath) => {
  if (!filePath || !SOURCE_EXTENSIONS.has(path.extname(filePath).toLowerCase())) return false;
  const segments = normalize(filePath).split('/');
  return !segments.some((segment) => IGNORED_SEGMENTS.includes(segment));
};

/** Whether `filePath` lies inside `projectRoot` (case-insensitive, either slash style). False when no project is open. */
export const isInsideProject = (filePath, projectRoot) => {
  if (!projectRoot) return false;
  const root = normalize(projectRoot).replace(/\/$/, '').toLowerCase();
  return normalize(filePath).toLowerCase().startsWith(`${root}/`);
};

const relativeTo = (projectRoot, file) => {
  const root = normalize(projectRoot).replace(/\/$/, '');
  const normalized = normalize(file);
  return normalized.toLowerCase().startsWith(`${root.toLowerCase()}/`)
    ? normalized.slice(root.length + 1)
    : normalized;
};

/** Short, actionable text for Claude, or null when there is nothing to fix. */
export const buildReport = (validation, projectRoot, editedFile) => {
  const blocking = (validation?.findings ?? []).filter((finding) => finding.severity === 'high');
  if (blocking.length === 0) return null;

  const lines = [
    `CodeMaps found ${blocking.length} problem(s) in ${relativeTo(projectRoot, editedFile)}:`,
  ];
  for (const finding of blocking) {
    const files = finding.files.map((file) => relativeTo(projectRoot, file)).join(', ');
    lines.push(`- ${finding.title} (${files}): ${finding.fix}`);
    const evidence = finding.evidence?.[0]?.message;
    if (evidence) lines.push(`  ${evidence}`);
  }
  lines.push('Fix them before moving on; call validate_architecture_changes to re-check.');

  const report = lines.join('\n');
  return report.length > MAX_REPORT_CHARS ? `${report.slice(0, MAX_REPORT_CHARS)}…` : report;
};

const signatureOf = (report) => crypto.createHash('sha1').update(report).digest('hex');

const stateFileFor = (projectRoot, stateDir = os.tmpdir()) =>
  path.join(
    stateDir,
    `codemaps-hook-${crypto.createHash('sha1').update(projectRoot.toLowerCase()).digest('hex').slice(0, 12)}.json`
  );

const readState = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
};

/** The same findings repeated on every edit would only add noise, so say them once. */
export const isRepeat = (stateFile, editedFile, report, now = Date.now()) => {
  const state = readState(stateFile);
  const previous = state[editedFile];
  const signature = signatureOf(report);
  const repeated =
    Boolean(previous) && previous.signature === signature && now - previous.at < REPEAT_WINDOW_MS;
  if (!repeated) {
    state[editedFile] = { signature, at: now };
    try {
      fs.writeFileSync(stateFile, JSON.stringify(state));
    } catch {
      // A missing state file only means the next edit repeats the message.
    }
  }
  return repeated;
};

const parseRpcBody = async (response) => {
  const text = await response.text();
  if ((response.headers.get('content-type') ?? '').includes('text/event-stream')) {
    const dataLines = text.split(/\r?\n/).filter((line) => line.startsWith('data:'));
    return dataLines.length ? JSON.parse(dataLines[dataLines.length - 1].slice(5).trim()) : null;
  }
  return text ? JSON.parse(text) : null;
};

/** Sends one JSON-RPC message to the MCP endpoint, within the request timeout. `message` is the parsed reply (JSON or last event of a stream), or null for an HTTP 202 acknowledgement. */
const rpc = async (endpoint, sessionId, body) => {
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
  };
  if (sessionId) headers['Mcp-Session-Id'] = sessionId;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  return { response, message: response.status === 202 ? null : await parseRpcBody(response) };
};

/** Calls one MCP tool in a short-lived session (initialize, call, then close) and returns its parsed JSON result. Throws if no session is created or the reply is not JSON. */
const callTool = async (endpoint, name, args) => {
  const init = await rpc(endpoint, null, {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'codemaps-claude-hook', version: '1.0.0' },
    },
  });
  const sessionId = init.response.headers.get('mcp-session-id');
  if (!sessionId) throw new Error('CodeMaps returned no MCP session');

  try {
    await rpc(endpoint, sessionId, { jsonrpc: '2.0', method: 'notifications/initialized' });
    const { message } = await rpc(endpoint, sessionId, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name, arguments: args },
    });
    let text = message?.result?.content?.[0]?.text ?? '';
    if (text.startsWith('```json')) text = text.slice(8, -4);
    return JSON.parse(text);
  } finally {
    fetch(endpoint, {
      method: 'DELETE',
      headers: { 'Mcp-Session-Id': sessionId },
      signal: AbortSignal.timeout(2000),
    }).catch(() => undefined);
  }
};

const readStdin = async () => {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
};

const log = (message) => {
  if (process.env.CODEMAPS_HOOK_DEBUG === '1') process.stderr.write(`[codemaps-hook] ${message}\n`);
};

/** The project CodeMaps has open, and whether CodeMaps is running at all. */
const fetchProjectRoot = async (endpoint) => {
  try {
    const status = await (
      await fetch(`${endpoint}/status`, { signal: AbortSignal.timeout(1500) })
    ).json();
    return { running: true, projectRoot: status.projectRoot };
  } catch {
    return { running: false, projectRoot: null };
  }
};

/** The validation result for one file, or null when the call failed. */
const validateFile = async (endpoint, absoluteFile) => {
  try {
    return await callTool(endpoint, 'validate_architecture_changes', {
      changedFiles: [absoluteFile],
      scope: 'changed',
    });
  } catch (error) {
    log(`validation failed: ${error.message}`);
    return null;
  }
};

/** The file Claude edited, when it is a source file worth validating. */
const editedSourceFile = (input) => {
  const editedFile = input.tool_input?.file_path ?? input.tool_input?.notebook_path;
  if (isCandidateFile(editedFile)) return editedFile;
  log('not a source file');
  return null;
};

/** The open project's root and the edited file's absolute path, or null when the hook stays silent. */
const locateEdit = async (endpoint, input, editedFile) => {
  const { running, projectRoot } = await fetchProjectRoot(endpoint);
  if (!running) {
    log('CodeMaps is not running');
    return null;
  }
  const absoluteFile = isAbsolutePath(editedFile)
    ? editedFile
    : path.resolve(input.cwd ?? process.cwd(), editedFile);
  if (!isInsideProject(absoluteFile, projectRoot)) {
    log(`CodeMaps has ${projectRoot ?? 'no project'} open, not this file's project`);
    return null;
  }
  return { projectRoot, absoluteFile };
};

/** The validation report for Claude, or null when there is nothing new to say. */
const newReportFor = async (endpoint, env, { projectRoot, absoluteFile }) => {
  await sleep(Number(env.CODEMAPS_HOOK_SETTLE_MS ?? 1200));

  const validation = await validateFile(endpoint, absoluteFile);
  if (validation === null) return null;

  const report = buildReport(validation, projectRoot, absoluteFile);
  const stateFile = stateFileFor(projectRoot, env.CODEMAPS_HOOK_STATE_DIR || os.tmpdir());
  return report && !isRepeat(stateFile, absoluteFile, report) ? report : null;
};

/**
 * Hook entry point: reads the PostToolUse event, validates the edited file in the running CodeMaps and returns the exit code to use.
 * Exit code 2 with `stderr` carries a new problem report back to Claude; 0 means stay silent.
 */
export const run = async (rawInput, env = process.env) => {
  if (env.CODEMAPS_HOOK_DISABLED === '1') return { exitCode: 0 };

  const input = JSON.parse(rawInput || '{}');
  const editedFile = editedSourceFile(input);
  if (!editedFile) return { exitCode: 0 };

  const endpoint = env.CODEMAPS_MCP_URL ?? 'http://127.0.0.1:3005/mcp';
  const edit = await locateEdit(endpoint, input, editedFile);
  if (!edit) return { exitCode: 0 };

  const report = await newReportFor(endpoint, env, edit);
  // Exit code 2 on PostToolUse feeds stderr back to Claude.
  return report ? { exitCode: 2, stderr: report } : { exitCode: 0 };
};

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  run(await readStdin())
    .then(({ exitCode, stderr }) => {
      if (stderr) process.stderr.write(`${stderr}\n`);
      process.exit(exitCode);
    })
    .catch(() => process.exit(0));
}
