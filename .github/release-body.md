# Release v{{VERSION}} 🚀

### 🇷🇺 Изменения (RU)

- **«Critical Application Error: listen EADDRINUSE», если порт 3005 уже занят** (например, второй экземпляр CodeMaps — dev-сборка рядом с установленным приложением). Ошибку повторно отправлял WebSocket-сервер, и она становилась необработанным исключением. Теперь она обрабатывается: в окне «Настройки MCP» статус «Недоступен» с причиной (порт занят / не удаётся слушать), а приложение продолжает работать. Другой порт задаётся переменной `CODEMAPS_MCP_PORT`.
- **Переключатель языка перенесён в заголовок окна** и больше не перекрывает граф.
- **Оформление репозитория.** Новый README на шести языках (английский, русский, китайский, испанский, японский, корейский) с актуальными скриншотами, `docs/ARCHITECTURE.md`, автоматически генерируемый справочник `docs/MCP_TOOLS.md` по всем 21 инструментам и 4 ресурсам (синхронность проверяет тест; `npm run docs:mcp`), `CONTRIBUTING.md` (английский) и `CONTRIBUTING.ru.md`, шаблон pull request, метаданные пакета и `.gitignore`, который больше не скрывает отслеживаемые файлы.

### 🇬🇧 Changes (EN)

- **"Critical Application Error: listen EADDRINUSE" when port 3005 is already taken** (for example a second CodeMaps instance, such as a dev build next to the installed app). The error was re-emitted by the WebSocket server and escaped as an uncaught exception. It is now handled: the MCP Settings window shows "Unavailable" with the reason (port in use / cannot listen) and the app keeps running. `CODEMAPS_MCP_PORT` selects another port.
- **Language switcher moved into the title bar**, so it no longer overlaps the graph.
- **Repository presentation.** New README in six languages (English, Russian, Chinese, Spanish, Japanese, Korean) with fresh screenshots, `docs/ARCHITECTURE.md`, a generated `docs/MCP_TOOLS.md` reference of all 21 tools and 4 resources (kept in sync by a test; `npm run docs:mcp`), `CONTRIBUTING.md` (English) and `CONTRIBUTING.ru.md`, a pull-request template, package metadata and a `.gitignore` that no longer hides tracked files.

### 🇨🇳 变更 (ZH)

- **端口 3005 被占用时出现“Critical Application Error: listen EADDRINUSE”**（例如同时运行第二个 CodeMaps 实例，如开发版与已安装版并存）。该错误被 WebSocket 服务器重复抛出，成为未捕获异常。现已处理：MCP 设置窗口显示“不可用”及原因（端口被占用 / 无法监听），应用继续运行。可用 `CODEMAPS_MCP_PORT` 指定其他端口。
- **语言切换器移到标题栏**，不再遮挡图。
- **仓库展示。** 新的六语言 README（英、俄、中、西、日、韩）及最新截图，新增 `docs/ARCHITECTURE.md`、自动生成的 `docs/MCP_TOOLS.md`（涵盖全部 21 个工具和 4 个资源，由测试保证同步；`npm run docs:mcp`）、`CONTRIBUTING.md`（英文）和 `CONTRIBUTING.ru.md`、pull request 模板、包元数据，以及不再隐藏已跟踪文件的 `.gitignore`。
