# Release v{{VERSION}} 🚀

### 🇷🇺 Изменения (RU)

- **Интеграция с Claude Code и Claude Desktop**: во вкладке «Подключение» окна настроек MCP появились готовые сниппеты для Claude Code (пользовательский и проектный `.mcp.json`) и Claude Desktop (мост `mcp-remote`). В репозиторий добавлены `.mcp.json`, `CLAUDE.md`, навык `codemaps-agent-autopilot` для `.claude/skills` и руководство `docs/CLAUDE_INTEGRATION.md`.
- **Локализация новых инструментов**: описания `analyze_decomposition`, `get_semantic_skeleton` и `validate_architecture_changes` переведены на RU / EN / ZH, навык агента знает о новых инструментах. Новый тест не даёт добавить MCP-инструмент без перевода.
- **Исправлен `mcp:smoke`**: тест ждал устаревший список инструментов и зависал после ошибки. Теперь он проверяет все 21 инструмент и 4 ресурса.
- **Честная версия MCP-сервера**: сервер сообщает реальную версию приложения и ссылку на проект вместо заглушек.

### 🇬🇧 Changes (EN)

- **Claude Code and Claude Desktop integration**: the Clients tab in MCP Settings now offers ready snippets for Claude Code (user scope and project `.mcp.json`) and Claude Desktop (`mcp-remote` bridge). The repository ships `.mcp.json`, `CLAUDE.md`, a `codemaps-agent-autopilot` skill for `.claude/skills`, and the `docs/CLAUDE_INTEGRATION.md` guide.
- **Localized new tools**: `analyze_decomposition`, `get_semantic_skeleton` and `validate_architecture_changes` are described in RU / EN / ZH, and the agent skill covers them. A new test prevents adding an MCP tool without a translation.
- **`mcp:smoke` fixed**: the test expected an outdated tool list and hung after a failure. It now exercises all 21 tools and 4 resources.
- **Truthful MCP server version**: the server reports the real application version and project URL instead of placeholders.

### 🇨🇳 变更 (ZH)

- **集成 Claude Code 与 Claude Desktop**：MCP 设置的“连接”标签页新增 Claude Code（用户级与项目级 `.mcp.json`）和 Claude Desktop（`mcp-remote` 桥接）的现成配置片段。仓库新增 `.mcp.json`、`CLAUDE.md`、适用于 `.claude/skills` 的 `codemaps-agent-autopilot` 技能以及 `docs/CLAUDE_INTEGRATION.md` 指南。
- **新工具本地化**：`analyze_decomposition`、`get_semantic_skeleton` 和 `validate_architecture_changes` 现已提供 RU / EN / ZH 说明，代理技能也涵盖这些工具。新增测试可防止添加没有翻译的 MCP 工具。
- **修复 `mcp:smoke`**：该测试原先期望过时的工具列表，并在失败后挂起。现在它会检查全部 21 个工具和 4 个资源。
- **MCP 服务器版本准确**：服务器现在报告真实的应用版本和项目链接，而不是占位值。
