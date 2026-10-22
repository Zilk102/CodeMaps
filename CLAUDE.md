# CodeMaps

Electron + React + TypeScript desktop app that builds a dependency graph of a codebase and exposes it to AI agents as an MCP server (Streamable HTTP on `http://127.0.0.1:3005/mcp`).

## Commands

- `yarn install` — install (yarn is the supported package manager; `yarn.lock` is authoritative)
- `npm run dev` — run Vite + Electron
- `npm run typecheck` / `npm run lint` / `npm run format:check` / `npm test` — the same gates CI runs
- `npm run mcp:smoke` — exercise every MCP tool against a running CodeMaps instance

## Layout

- `electron/` — main process: `oracle/` (indexing, graph), `parsing/` (tree-sitter + TS), `analysis/` (analyzers), `mcp/` (tool and resource registration), `services/` (git, Kuzu)
- `src/` — renderer: `components/`, `store/` (zustand), `i18n/locales/{en,ru,zh}.json`
- `scripts/` — build and smoke-test helpers

## Conventions

- Adding an MCP tool: register it in `electron/mcp/register*.ts`, describe it in `electron/mcp/descriptors.ts`, and add `mcpSettings.tools.<name>` to all three locale files (the locale test enforces key parity).
- Keep the agent skill in sync across `.claude/skills/codemaps-agent-autopilot/SKILL.md`, `.trae/skills/...` and the template in `src/components/mcp-settings/McpSettingsAgentSkill.tsx`.
- Prettier formatting is enforced in CI; run `npm run format` before committing.

## Using CodeMaps from Claude

The repo ships a project-scoped `.mcp.json` and the `codemaps-agent-autopilot` skill. Start CodeMaps first, then Claude Code picks the server up automatically. See `docs/CLAUDE_INTEGRATION.md`.
