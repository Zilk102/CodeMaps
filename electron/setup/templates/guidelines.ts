/**
 * The agent-neutral guidance `setup_project` writes into AGENTS.md, GEMINI.md, the Copilot
 * instructions and the Cursor, Windsurf and Cline rules. One text keeps every agent on the same
 * rules; only the project commands are filled in from detection.
 */
import type { DetectedProject } from '../types';

const COMMAND_LABELS: Array<[keyof DetectedProject['commands'], string]> = [
  ['test', 'Test'],
  ['lint', 'Lint'],
  ['typecheck', 'Typecheck'],
  ['build', 'Build'],
  ['format', 'Format'],
];

/** A bullet list of the commands that were detected, or an empty string when there are none. */
const commandsSection = (detected: DetectedProject): string => {
  const lines = COMMAND_LABELS.filter(([key]) => detected.commands[key]).map(
    ([key, label]) => `- ${label}: \`${detected.commands[key]}\``
  );
  if (lines.length === 0) return '';
  return `\n### Project commands\n\nRun these before declaring work done.\n\n${lines.join('\n')}\n`;
};

/**
 * The guidance block (without markers). `detected` supplies the project commands; everything else
 * is the same for every project, because it describes how to work with the CodeMaps tools.
 */
export const buildGuidelines = (detected: DetectedProject): string => `## CodeMaps

This project is connected to CodeMaps, an MCP server (\`codemaps\`) that keeps a dependency graph of the codebase. This section was written by the \`setup_project\` tool; run it again to refresh it.

### Workflow

1. At the start of a session call \`setup_project\` once. It is idempotent and cheap, and reports \`upToDate\` when nothing changed.
2. Before coding call \`prepare_task_context\` with the user's request. It picks the target files, the blast radius and the risks, so do not guess files.
3. Before writing code that resembles existing code call \`find_duplicates\` and reuse or extract instead of copy-pasting.
4. After editing call \`validate_architecture_changes\` (it checks only the files you changed) and fix every problem it reports, then \`check_documentation\`.
${commandsSection(detected)}
### Documentation

- Every new or changed file starts with a header comment.
- Every exported symbol, and every function of 10 or more lines, has a doc comment that states the purpose, the contract (inputs, result, failures) and why it exists.
- Never repeat the name ("Gets the user" above \`getUser\`), and never leave commented-out code behind.

### Legacy code

\`.codemaps/baseline.json\` freezes the findings the project already had. Only new or worsened findings are reported, so fix those and leave old debt alone unless the task is to pay it down. Never edit the baseline by hand.

### Large changes and legacy refactoring

- Cross-cutting migrations: \`prepare_change_campaign\`, then work wave by wave.
- Oversized or tangled files: \`analyze_decomposition\` with \`filePath\` returns split plans to follow.

### Saving tokens

Read a file's structure with \`get_semantic_skeleton\` before opening it, use \`search_signatures\` to find a declaration, and raise \`limit\` only when a response says \`_compaction\`.
`;
