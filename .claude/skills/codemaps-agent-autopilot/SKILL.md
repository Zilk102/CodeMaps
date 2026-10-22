---
name: 'codemaps-agent-autopilot'
description: 'Uses CodeMaps MCP as the default architectural brain for project understanding, debugging, refactors, reviews, and migration campaigns. Invoke whenever CodeMaps is connected.'
---

# CodeMaps Agent Autopilot

Use this skill whenever the workspace has the `codemaps` MCP server available.

## Goal

Treat CodeMaps as the primary architectural intelligence layer before editing code.
Do not wait until after file inspection to use it.

## MCP Server

- Server name: `codemaps`
- MCP endpoint: `http://127.0.0.1:3005/mcp`

## Default Flow

1. If the project is not analyzed yet, call `analyze_project`.
2. For any natural-language user request, call `prepare_task_context` first.
3. If CodeMaps routes the task to a campaign-level change, use `prepare_change_campaign`.
4. If CodeMaps routes the task to a single-target code change, use `prepare_change_context`.
5. If CodeMaps routes the task to diagnostics, review, architecture, or stabilization, use `prepare_review_context`.
6. Use low-level tools only as fallback when the composite context explicitly leaves ambiguity.

## Routing Rules

- Bug, incident, regression, "not working", "broken":
  Start with `prepare_task_context`. Use `get_semantic_skeleton` on large files to save tokens while exploring.
- Code cleanup, refactoring monoliths, removing slop, fixing God classes, resolving duplication:
  Start with `analyze_decomposition` to get actionable refactoring targets, then use `prepare_change_context` on the chosen targets.
- Broad migration, replace SDK/library everywhere, cross-cutting refactor:
  Start with `prepare_task_context` and follow `prepare_change_campaign` if selected.

## Guardrails (Mandatory)

- ALWAYS start by calling `analyze_project` with the ABSOLUTE path to the current project directory if the graph is not already loaded. Never assume CodeMaps knows the workspace directory automatically.
- BEFORE responding to the user with completed changes, you MUST run `validate_architecture_changes` to ensure you haven't introduced cyclical dependencies, God classes, or broken SOLID boundaries. If violations are found, fix them before answering.
- Localized feature/refactor with a clear code area:
  Start with `prepare_task_context`, then follow `prepare_change_context`.
- Review, architecture audit, security review, stabilization:
  Start with `prepare_task_context`, then follow `prepare_review_context`.

## Mandatory Behavior

- Use CodeMaps before making non-trivial code decisions.
- Prefer CodeMaps composite contexts over raw graph tools.
- Do not guess target files when CodeMaps cannot resolve them confidently.
- For large changes, work in waves from `prepare_change_campaign` instead of editing many files ad hoc.
- Re-check CodeMaps after meaningful edits if the architectural context may have changed.
- Run `validate_architecture_changes` before declaring a non-trivial change finished.

## Low-Level Fallback Tools

Use these only if the selected composite context is insufficient:

- `search_graph`
- `get_node_dependencies`
- `get_blast_radius`
- `get_architecture_overview`
- `get_health_score`
- `detect_patterns`
- `analyze_decomposition`
- `get_semantic_skeleton`
- `validate_architecture_changes`
- `run_security_scan`
- `search_signatures`
- `get_semantic_skeleton` (read a file's structure without bodies, to save tokens)
- `validate_architecture_changes` (run before finishing edits to catch boundary violations)

## Expected Outcome

The agent should behave like it has a project-aware architectural map:

- understand the system before editing,
- choose the right scope automatically,
- avoid blind file-by-file wandering,
- treat CodeMaps as the default brain for project structure and impact analysis.
