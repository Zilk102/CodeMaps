/**
 * The `instructions` string of the MCP server. Clients show it to their model on connect, so it is
 * the one place that reaches every agent before the user has configured anything: it says what
 * CodeMaps is and sends the agent to `setup_project`, which then writes the project guardrails.
 * Keep it short (clients truncate long instructions) and name only tools that exist; a test
 * checks both.
 */

/** Longest instructions text we send; some clients cut off anything beyond roughly this size. */
export const MAX_INSTRUCTIONS_LENGTH = 1200;

/** What every connected agent reads first. */
export const SERVER_INSTRUCTIONS = `CodeMaps indexes the open codebase into a dependency graph and answers architecture questions with bounded tools.

First thing in a project: call \`setup_project\` (idempotent and cheap; it reports upToDate). It detects the stack and your agent, then writes the guardrails itself (AGENTS.md section, agent rules, skill, edit hook, .codemaps config, and a baseline that freezes legacy findings), so the user never has to configure anything.

Core loop:
1. \`prepare_task_context\` with the user's request before coding.
2. \`find_duplicates\` before writing code similar to existing code.
3. After editing, \`validate_architecture_changes\` (checks only your changed files; fix what it reports) and \`check_documentation\` (every file a header comment, every public symbol a purpose/contract/why comment).

Big refactors: \`prepare_change_campaign\` and \`analyze_decomposition\`. Read files cheaply with \`get_semantic_skeleton\`. Responses are size-bounded; \`_compaction\` says what was cut.`;
