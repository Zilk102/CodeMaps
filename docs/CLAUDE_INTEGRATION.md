# Using CodeMaps with Claude

CodeMaps must be running; it serves MCP over Streamable HTTP at `http://127.0.0.1:3005/mcp`. The same snippets are available with one-click copy in **MCP Settings → Clients** inside the app.

## Claude Code

Register once for every project:

```bash
claude mcp add --transport http --scope user codemaps http://127.0.0.1:3005/mcp
```

Or share it with a team through the `.mcp.json` committed at this repository's root (already included). Verify with `claude mcp list` or `/mcp` inside a session.

## Claude Desktop

Claude Desktop launches local servers over stdio, so bridge the HTTP endpoint with `mcp-remote` (requires Node.js). Open **Settings → Developer → Edit Config** and add:

```json
{
  "mcpServers": {
    "codemaps": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "http://127.0.0.1:3005/mcp", "--allow-http"]
    }
  }
}
```

Restart Claude Desktop.

## Agent skill

Copy `.claude/skills/codemaps-agent-autopilot/SKILL.md` to `~/.claude/skills/codemaps-agent-autopilot/SKILL.md` (all projects) or keep it in a project's `.claude/skills/`. It tells the agent to start from `prepare_task_context` and to run `validate_architecture_changes` before finishing. That tool checks only the files changed in the git working tree (or against `baseRef`) and returns just the problems in them with a fix hint, so legacy debt elsewhere does not block your edit; pass `scope: "project"` for the whole project. It also reports `missing_documentation` for changed files, and the skill makes the agent call `check_documentation` after writing code so every new file has a header comment and every public symbol a doc comment that states its purpose, contract and why.

## Automatic validation after every edit (Claude Code hook)

A skill only helps if the agent remembers to run it. A `PostToolUse` hook does not depend on memory: after Claude Code edits a source file, it asks the running CodeMaps to validate that file and returns the problems (god files, clones, long or complex methods, hubs, mixed responsibilities) to Claude with a fix hint, so they get fixed in the same turn.

1. Save `scripts/codemaps-validate-hook.mjs` to `.claude/hooks/codemaps-validate-hook.mjs` in your project (the app's **MCP Settings → Connection** tab has a copy button for both the script and the settings below).
2. Add to `.claude/settings.json`:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write|MultiEdit",
        "hooks": [
          {
            "type": "command",
            "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/codemaps-validate-hook.mjs\"",
            "timeout": 20
          }
        ]
      }
    ]
  }
}
```

The hook needs only Node.js. It stays silent when everything is fine, when CodeMaps is not running, when the file is not source code, and when CodeMaps has a different project open (it never switches the project). The same message is not repeated for the same file within 15 minutes. Set `CODEMAPS_HOOK_DISABLED=1` to turn it off, `CODEMAPS_HOOK_DEBUG=1` to see why it stayed silent, `CODEMAPS_MCP_URL` for a non-default endpoint.

## Troubleshooting

- `ECONNREFUSED`: CodeMaps is not running, or port 3005 is taken by another process.
- Tools list is empty: call `analyze_project` with the project path first.
- A `prepare_*` response contains `_compaction`: lists were cut to fit the agent's context. Pass a larger `limit` (up to 50) for more detail; the size budget grows with it.
- `Kuzu background worker exited with code 1` or `spawn node ENOENT`: install Node.js 22+ and make sure `node` is on `PATH` (or set `CODEMAPS_NODE_EXECUTABLE`), then restart CodeMaps.
- After restarting CodeMaps, a client may report `Session not found`; CodeMaps answers 404 so spec-compliant clients reconnect on their own. If yours does not, restart the client.
- Check the endpoint: `curl http://127.0.0.1:3005/mcp/status`.
