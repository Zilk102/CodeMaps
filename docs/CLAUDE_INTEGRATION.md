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

Copy `.claude/skills/codemaps-agent-autopilot/SKILL.md` to `~/.claude/skills/codemaps-agent-autopilot/SKILL.md` (all projects) or keep it in a project's `.claude/skills/`. It tells the agent to start from `prepare_task_context` and to run `validate_architecture_changes` before finishing.

## Troubleshooting

- `ECONNREFUSED`: CodeMaps is not running, or port 3005 is taken by another process.
- Tools list is empty: call `analyze_project` with the project path first.
- Check the endpoint: `curl http://127.0.0.1:3005/mcp/status`.
