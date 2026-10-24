# Release v{{VERSION}} 🚀

### 🇷🇺 Изменения (RU)

- **Нулевая настройка для любого агента и проекта.** Подключите CodeMaps по MCP к любому агенту (Claude Code, Cursor, Codex, Copilot, Gemini CLI, Windsurf, Cline и другим), и больше ничего делать не нужно: сервер сам сообщает агенту в `instructions`, что первым делом нужно вызвать `setup_project`. Агент получает основной цикл работы (контекст задачи до кода, поиск дублей, проверка и документирование после правок).
- **Новый инструмент `setup_project`.** Определяет языки, менеджер пакетов, команды тестов и линта, CI и каких агентов использует проект (плюс агента, который вызвал инструмент), и сам прописывает защиту: секцию в `AGENTS.md`, правила под каждого агента (`CLAUDE.md` и навык, `.cursor/rules`, `.github/copilot-instructions.md`, `GEMINI.md`, `.windsurf`, `.clinerules`), hook проверки после правок для Claude Code, а также `.codemaps/config.json` и `.codemaps/baseline.json`. Запись идемпотентна: чужой текст не трогается, JSON объединяется, повторный вызов ничего не пишет, пути за пределами проекта отклоняются. Режим `apply: false` показывает план.
- **Конфиг проекта и «храповик» для старого кода.** `.codemaps/config.json` задаёт режим (`ratchet` или `strict`), исключения и пороги. В режиме `ratchet` старые находки замораживаются в `baseline.json`: инструмент сообщает только о новых и ухудшившихся, а долг может только уменьшаться, поэтому строгие правила можно включить в любом старом проекте. Подробнее в `docs/PROJECT_CONFIG.md` и `docs/AGENT_SETUP.md`.
- Тесты: 702 -> 838.

### 🇬🇧 Changes (EN)

- **Zero configuration for any agent and any project.** Connect CodeMaps over MCP to any agent (Claude Code, Cursor, Codex, Copilot, Gemini CLI, Windsurf, Cline and others) and nothing else is needed: the server tells the agent in its `instructions` to call `setup_project` first. The agent gets the core loop (task context before code, duplicate search, validation and documentation after edits).
- **New `setup_project` tool.** It detects languages, package manager, test and lint commands, CI and which agents the project uses (plus the agent that called it), and writes the guardrails itself: a section in `AGENTS.md`, rules for each agent (`CLAUDE.md` and a skill, `.cursor/rules`, `.github/copilot-instructions.md`, `GEMINI.md`, `.windsurf`, `.clinerules`), an after-edit validation hook for Claude Code, plus `.codemaps/config.json` and `.codemaps/baseline.json`. Writing is idempotent: foreign text is never touched, JSON is merged, a second call writes nothing, paths outside the project are rejected. `apply: false` shows the plan only.
- **Project config and a "ratchet" for legacy code.** `.codemaps/config.json` sets the mode (`ratchet` or `strict`), exclusions and thresholds. In `ratchet` mode existing findings are frozen in `baseline.json`: the tools report only new or worsened findings and the debt can only shrink, so strict rules can be switched on in any old project. See `docs/PROJECT_CONFIG.md` and `docs/AGENT_SETUP.md`.
- Tests: 702 -> 838.

### 🇨🇳 变更 (ZH)

- **对任何智能体和任何项目零配置。** 通过 MCP 把 CodeMaps 连接到任意智能体（Claude Code、Cursor、Codex、Copilot、Gemini CLI、Windsurf、Cline 等）即可，无需任何其他操作：服务器会在 `instructions` 中告诉智能体首先调用 `setup_project`。智能体由此获得核心工作流（编码前获取任务上下文、查找重复代码、编辑后验证并补充文档）。
- **新工具 `setup_project`。** 它会检测语言、包管理器、测试和 lint 命令、CI，以及项目使用了哪些智能体（再加上调用它的智能体），并自行写入防护措施：`AGENTS.md` 中的一节、各智能体的规则（`CLAUDE.md` 和技能、`.cursor/rules`、`.github/copilot-instructions.md`、`GEMINI.md`、`.windsurf`、`.clinerules`）、Claude Code 的编辑后验证 hook，以及 `.codemaps/config.json` 和 `.codemaps/baseline.json`。写入是幂等的：不会改动他人内容，JSON 会被合并，再次调用不会写入任何内容，项目之外的路径会被拒绝。`apply: false` 只显示计划。
- **项目配置和旧代码的“棘轮”。** `.codemaps/config.json` 设置模式（`ratchet` 或 `strict`）、排除项和阈值。在 `ratchet` 模式下，现有问题被冻结在 `baseline.json` 中：工具只报告新增或恶化的问题，债务只能减少，因此可以在任何旧项目中启用严格规则。详见 `docs/PROJECT_CONFIG.md` 和 `docs/AGENT_SETUP.md`。
- 测试：702 -> 838。
