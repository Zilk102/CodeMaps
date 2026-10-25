/**
 * The `instructions` string of the MCP server. Clients show it to their model on connect, so it is
 * the one place that reaches every agent before the user has configured anything: it says what
 * CodeMaps is and sends the agent to `setup_project` (with the working directory as projectPath),
 * which then writes the project guardrails. Keep it short (clients truncate long instructions),
 * imperative (weaker models act only on a direct trigger) and name only tools that exist; a test
 * checks both.
 */

/** Longest instructions text we send; some clients cut off anything beyond roughly this size. */
export const MAX_INSTRUCTIONS_LENGTH = 1200;

/** What every connected agent reads first. */
export const SERVER_INSTRUCTIONS = `At the start of every session in a project, before anything else, call \`setup_project\` with projectPath set to your current working directory (fast, idempotent; it reports upToDate). Never omit projectPath. It detects the stack and your agent and writes the guardrails itself (AGENTS.md section, agent rules, skill, edit hook, .codemaps config, a baseline that freezes legacy findings, a CI job), so the user configures nothing.

Core loop:
1. \`prepare_task_context\` with the user's request before coding.
2. \`find_duplicates\` before writing code similar to existing code.
3. After editing, \`validate_architecture_changes\` (checks only your changed files; fix what it reports) and \`check_documentation\` (every file a header comment, every public symbol a purpose/contract/why comment).

Big refactors: \`prepare_change_campaign\` and \`analyze_decomposition\`. Read files cheaply with \`get_semantic_skeleton\`. Responses are size-bounded; \`_compaction\` says what was cut.`;
