# Release v{{VERSION}} 🚀

### 🇷🇺 Изменения (RU)

- **Проверено на живом OpenCode 1.18.29 с моделью DeepSeek.** MCP подключается, подсказки сервера (`instructions`) доходят до модели, клиент представляется как `opencode`, инструменты называются `codemaps_<имя>`. После переписанной подсказки модель на обычной задаче «добавь функцию» сама первым делом вызвала `setup_project`, написала функцию с осмысленным документирующим комментарием и затем вызвала `validate_architecture_changes` и `check_documentation`. Плагин проверки после правок работает: отчёт CodeMaps (например, сложность 13) попадает прямо в результат инструмента правки и виден модели.
- **Исправлено найденное при этой проверке.** Хук `.codemaps/hooks/validate.mjs` не создавался для проектов только на OpenCode, поэтому плагин молчал всегда. Теперь он создаётся. `setup_project` больше не подставляет открытый в окне проект: `projectPath` обязателен (рабочая папка агента), а корень диска, домашняя папка и несуществующие пути отклоняются; ранее вызов без пути записал файлы в чужой проект. Результат начинается с `projectRoot` и строки `summary`.
- **Подсказка сервера стала императивной** и просит передавать рабочую папку, поэтому даже слабые модели следуют ей. Плагин ищет хук через `directory`, затем `worktree`, затем текущую папку.
- Тесты: 921 -> 930.

### 🇬🇧 Changes (EN)

- **Verified on live OpenCode 1.18.29 with a DeepSeek model.** MCP connects, the server `instructions` reach the model, the client name is `opencode` and tools are named `codemaps_<tool>`. With the rewritten instructions the model, on a plain "add a function" task, called `setup_project` first by itself, wrote the function with a meaningful doc comment and then called `validate_architecture_changes` and `check_documentation`. The after-edit plugin works: the CodeMaps report (for example complexity 13) lands in the edit tool result and the model sees it.
- **Fixed what that check found.** The hook `.codemaps/hooks/validate.mjs` was not created for OpenCode-only projects, so the plugin was always silent. It is created now. `setup_project` no longer falls back to the project open in the window: `projectPath` is required (the agent's working directory), and a filesystem root, the home directory and nonexistent paths are rejected; a call without a path used to write files into someone else's project. The result starts with `projectRoot` and a `summary` line.
- **The server instructions are now imperative** and ask for the working directory, so even weaker models follow them. The plugin finds the hook through `directory`, then `worktree`, then the current directory.
- Tests: 921 -> 930.

### 🇨🇳 变更 (ZH)

- **已在真实的 OpenCode 1.18.29 和 DeepSeek 模型上验证。** MCP 可以连接，服务器的 `instructions` 会传到模型，客户端名称是 `opencode`，工具名称为 `codemaps_<工具名>`。在重写提示之后，面对普通的“添加一个函数”任务，模型自己首先调用了 `setup_project`，写出带有有意义文档注释的函数，随后调用了 `validate_architecture_changes` 和 `check_documentation`。编辑后插件有效：CodeMaps 的报告（例如复杂度 13）会直接出现在编辑工具的结果里，模型能看到。
- **修复了这次检查发现的问题。** 以前仅使用 OpenCode 的项目不会创建钩子 `.codemaps/hooks/validate.mjs`，因此插件始终静默，现在会创建。`setup_project` 不再回退到窗口中打开的项目：`projectPath` 为必填（智能体的工作目录），磁盘根目录、用户主目录和不存在的路径会被拒绝；此前不带路径的调用曾把文件写入别人的项目。结果以 `projectRoot` 和一行 `summary` 开头。
- **服务器提示改为祈使句**并要求提供工作目录，因此较弱的模型也会照做。插件依次通过 `directory`、`worktree` 和当前目录查找钩子。
- 测试：921 -> 930。
