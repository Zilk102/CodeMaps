# Release v{{VERSION}} 🚀

### 🇷🇺 Изменения (RU)

- **Хук Claude Code, который проверяет каждую правку**: `scripts/codemaps-validate-hook.mjs` запускается после `Edit`/`Write`/`MultiEdit`, просит работающий CodeMaps проверить изменённый файл и возвращает Claude найденные проблемы (god-файлы, клоны, длинные и сложные методы, хабы, смешанные ответственности) с подсказкой по исправлению, чтобы они исправлялись в том же ходе. Без зависимостей (чистый Node); молчит, если всё хорошо, CodeMaps не запущен или открыт другой проект (проект он не переключает); одно и то же сообщение не повторяется 15 минут. В этом репозитории включён через `.claude/settings.json`; в окне MCP Settings на вкладке «Подключение» есть кнопки копирования настроек и скрипта, описание — в `docs/CLAUDE_INTEGRATION.md`.
- **`validate_architecture_changes` ждёт индексации**: перед проверкой инструмент дожидается, пока отложенные изменения файлов попадут в граф.
- **Исправлено: файлы, созданные сразу после анализа проекта, не попадали в граф.** `analyzeProject` возвращался раньше, чем наблюдатель за файлами заканчивал первичный скан, а chokidar игнорирует всё, что произошло до его готовности, поэтому агент, который открыл проект и сразу создавал или правил файлы, видел устаревший граф. Теперь запуск наблюдателя дожидается его готовности (с ограничением 15 секунд), а ошибки наблюдателя пишутся в лог.

### 🇬🇧 Changes (EN)

- **A Claude Code hook that validates every edit**: `scripts/codemaps-validate-hook.mjs` runs after `Edit`/`Write`/`MultiEdit`, asks the running CodeMaps to validate the changed file and returns the problems (god files, clones, long and complex methods, hubs, mixed responsibilities) to Claude with a fix hint, so they get fixed in the same turn. Dependency free (plain Node); silent when all is fine, when CodeMaps is not running or when another project is open (it never switches the project); the same message is not repeated for 15 minutes. Enabled for this repository in `.claude/settings.json`; MCP Settings → Connection has copy buttons for the settings and the script, and `docs/CLAUDE_INTEGRATION.md` describes it.
- **`validate_architecture_changes` waits for indexing**: before validating, the tool waits until pending file changes are folded into the graph.
- **Fixed: files created right after a project was analysed never reached the graph.** `analyzeProject` returned before the file watcher finished its initial scan, and chokidar ignores everything that happens before it is ready, so an agent that opened a project and immediately created or edited files saw a stale graph. Starting the watcher now waits until it is ready (capped at 15 seconds), and watcher errors are logged.

### 🇨🇳 变更 (ZH)

- **校验每次编辑的 Claude Code 钩子**：`scripts/codemaps-validate-hook.mjs` 在 `Edit`/`Write`/`MultiEdit` 之后运行，请正在运行的 CodeMaps 校验被修改的文件，并把发现的问题（god 文件、代码克隆、过长或过复杂的方法、枢纽节点、职责混杂）连同修复建议返回给 Claude，使其在同一轮内修复。无依赖（纯 Node）；一切正常、CodeMaps 未运行或打开的是其他项目时保持静默（不会切换项目）；同样的消息 15 分钟内不会重复。本仓库已通过 `.claude/settings.json` 启用；MCP 设置的“连接”标签页提供设置和脚本的复制按钮，详见 `docs/CLAUDE_INTEGRATION.md`。
- **`validate_architecture_changes` 会等待索引完成**：校验前会等到待处理的文件改动进入图中。
- **修复：项目分析后立即创建的文件不会进入图。** `analyzeProject` 在文件监视器完成初始扫描之前就返回了，而 chokidar 会忽略就绪之前发生的一切，所以刚打开项目就立刻创建或修改文件的代理会看到过期的图。现在启动监视器会等待其就绪（上限 15 秒），监视器错误也会写入日志。
