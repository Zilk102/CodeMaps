# Release v{{VERSION}} 🚀

### 🇷🇺 Изменения (RU)

- **Исправлена работа Kuzu в установленной версии**: скрипт фонового воркера лежал внутри `app.asar`, который системный Node прочитать не может, поэтому в установленном приложении граф не сохранялся, а инструменты `calculate_blast_radius_v2`, `analyze_activity_heatmap` и `analyze_pr_impact` падали с ошибкой `Kuzu background worker exited with code 1`. Теперь скрипт распаковывается и запускается из `app.asar.unpacked`.
- **Устаревшие MCP-сессии после перезапуска**: неизвестный идентификатор сессии теперь получает ответ 404 (как требует спецификация MCP) вместо 400, поэтому клиенты вроде `mcp-remote` переподключаются сами, а не ломаются до перезапуска.
- Добавлены тесты пути воркера и ответа на неизвестную сессию; документация описывает требование Node.js для инструментов на Kuzu.

### 🇬🇧 Changes (EN)

- **Kuzu fixed in installed builds**: the background worker script lived inside `app.asar`, which the system Node cannot read, so the installed app never persisted the graph and `calculate_blast_radius_v2`, `analyze_activity_heatmap` and `analyze_pr_impact` failed with `Kuzu background worker exited with code 1`. The script is now unpacked and launched from `app.asar.unpacked`.
- **Stale MCP sessions after a restart**: an unknown session id now gets HTTP 404 (as the MCP spec requires) instead of 400, so clients such as `mcp-remote` reconnect on their own instead of failing until restarted.
- Added tests for the worker path and the unknown-session response; the docs describe the Node.js requirement of the Kuzu-backed tools.

### 🇨🇳 变更 (ZH)

- **修复安装版中的 Kuzu**：后台 worker 脚本位于 `app.asar` 内，系统 Node 无法读取，因此安装版从未保存图数据，`calculate_blast_radius_v2`、`analyze_activity_heatmap` 和 `analyze_pr_impact` 会报错 `Kuzu background worker exited with code 1`。现在脚本已解包，并从 `app.asar.unpacked` 启动。
- **重启后的过期 MCP 会话**：未知的会话 ID 现在返回 HTTP 404（符合 MCP 规范），而不是 400，因此 `mcp-remote` 等客户端会自动重新连接，而不是一直失败到被重启。
- 新增 worker 路径和未知会话响应的测试；文档说明了依赖 Kuzu 的工具需要 Node.js。
