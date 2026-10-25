# Release v{{VERSION}} 🚀

### 🇷🇺 Изменения (RU)

- **OpenCode и DeepSeek Harness в `setup_project`.** Инструмент определяет эти клиенты по файлам проекта и по имени клиента в MCP и пишет для них защиту. OpenCode: секция в `AGENTS.md`, навык в `.opencode/skills/`, запись сервера `codemaps` в `opencode.json` (только если это обычный JSON, существующие серверы сохраняются; `opencode.jsonc` и файл с комментариями не трогаются, вместо этого выдаётся готовый фрагмент) и плагин проверки после правок `.opencode/plugins/codemaps-validate.ts`. DeepSeek Harness: секция в `AGENTS.md` и готовый файл `.codemaps/dsh/cordis.patch.yml` для запуска через `--patch`, потому что MCP в dsh настраивается только на уровне всей машины, а в домашнюю папку `setup_project` ничего не пишет.
- **Окно настроек MCP** получило карточки подключения для OpenCode и DeepSeek Harness (en/ru/zh), README и `docs/AGENT_SETUP.md` описывают, какие файлы создаются для каждого клиента.
- **Что подтверждено только документацией, но не проверено на самих клиентах:** какой транспорт использует OpenCode, формат имён MCP-инструментов, имена клиентов в MCP, форма событий плагина OpenCode, домашняя папка dsh и показ `instructions` модели. DeepSeek Harness находится в developer preview, у него нет документированного хука после правок, поэтому вся инструкция для агента лежит в `AGENTS.md`. Эти места помечены в документации как «лучшее из возможного».
- Тесты: 891 -> 921.

### 🇬🇧 Changes (EN)

- **OpenCode and DeepSeek Harness in `setup_project`.** The tool detects these clients from project files and from the MCP client name and writes the guardrails for them. OpenCode: a section in `AGENTS.md`, a skill in `.opencode/skills/`, a `codemaps` server entry in `opencode.json` (only for plain JSON, existing servers are kept; `opencode.jsonc` and files with comments are left alone and a ready snippet is returned instead) and an after-edit validation plugin `.opencode/plugins/codemaps-validate.ts`. DeepSeek Harness: a section in `AGENTS.md` and a ready `.codemaps/dsh/cordis.patch.yml` for use with `--patch`, because dsh configures MCP only machine-wide and `setup_project` never writes to the home directory.
- **The MCP settings window** has connection cards for OpenCode and DeepSeek Harness (en/ru/zh), and the README and `docs/AGENT_SETUP.md` list which files are created for each client.
- **What is confirmed only by documentation and not tested on the clients themselves:** the transport OpenCode uses, the format of MCP tool names, the MCP client names, the event shapes of the OpenCode plugin, the dsh home directory and whether `instructions` are shown to the model. DeepSeek Harness is a developer preview with no documented after-edit hook, so all guidance for the agent lives in `AGENTS.md`. These places are marked best-effort in the documentation.
- Tests: 891 -> 921.

### 🇨🇳 变更 (ZH)

- **`setup_project` 支持 OpenCode 和 DeepSeek Harness。** 该工具根据项目文件和 MCP 客户端名称识别这些客户端，并为它们写入防护措施。OpenCode：`AGENTS.md` 中的一节、`.opencode/skills/` 中的技能、`opencode.json` 中的 `codemaps` 服务器条目（仅限普通 JSON，已有服务器会保留；`opencode.jsonc` 和带注释的文件不会被改动，而是返回现成的片段），以及编辑后验证插件 `.opencode/plugins/codemaps-validate.ts`。DeepSeek Harness：`AGENTS.md` 中的一节，以及可通过 `--patch` 使用的现成文件 `.codemaps/dsh/cordis.patch.yml`，因为 dsh 只能在整台机器级别配置 MCP，而 `setup_project` 从不写入用户主目录。
- **MCP 设置窗口**新增了 OpenCode 和 DeepSeek Harness 的连接卡片（en/ru/zh），README 和 `docs/AGENT_SETUP.md` 列出了为每个客户端创建的文件。
- **仅由文档确认、尚未在客户端本身上测试的内容：** OpenCode 使用的传输方式、MCP 工具名称的格式、MCP 客户端名称、OpenCode 插件的事件结构、dsh 的主目录，以及 `instructions` 是否会展示给模型。DeepSeek Harness 处于开发者预览阶段，没有文档化的编辑后钩子，因此给智能体的全部指引都在 `AGENTS.md` 中。文档中已将这些部分标注为尽力而为。
- 测试：891 -> 921。
