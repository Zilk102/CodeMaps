# Release v{{VERSION}} 🚀

### 🇷🇺 Изменения (RU)

- **Граф больше не теряет зависимости за barrel-файлами**: импорт `import { X } from '../store'`, где `store.ts` реэкспортирует `./store/types`, раньше вёл к barrel-файлу, а не к настоящему объявлению, поэтому blast radius находил 34 из 46 зависимых `GraphData`. Теперь реэкспорты (`export *`, `export { a as b } from`, цепочки и циклы) прослеживаются; версия кэша проектов поднята, старые кэши пересоберутся.
- **Ни один инструмент не заваливает контекст агента**: каждый ответ MCP ограничен по размеру (списки и длинные строки) и отдаётся без отступов; всё отброшенное описано в `_compaction`. `get_blast_radius` для узлового типа сократился со 142 000 до ~37 000 символов.
- **`validate_architecture_changes` проверяет только ваши правки**: по умолчанию берёт файлы, изменённые в рабочем дереве git (или относительно `baseRef`, или список `changedFiles`), и возвращает только проблемы в них (god-файлы, клоны, длинные и сложные методы, хабы, смешанные ответственности) с подсказкой по исправлению. Унаследованный долг в других местах не блокирует правку; `scope: "project"` возвращает проверку всего проекта.
- **`get_semantic_skeleton`** возвращает ещё и `outline` с исходными номерами строк, **`search_signatures`** принимает `filePath` и показывает вид объявления (`kind`).
- **GUI для новых разработчиков**: граф автоматически вписывается в окно при открытии и подстраивается под его размер, выбор узла центрирует его, панель сведений объясняет узел (путь, экспорты, кто использует, от чего зависит, предупреждение о горячей точке), легенда объясняет цвета и красную пунктирную рамку, добавлены кнопки масштаба и разовая подсказка по управлению, а информационная карточка больше не закрывает граф.
- **Надёжность**: опечатка в `projectPath` теперь даёт понятную ошибку вместо «успешного» пустого анализа; сохранённое состояние интерфейса не падает, если IndexedDB недоступен; в недавних проектах нет дублей (`D:/` и `d:/`); порт MCP можно задать через `CODEMAPS_MCP_PORT`, а занятый порт описывается в логе, а не роняет приложение.

### 🇬🇧 Changes (EN)

- **The graph no longer loses dependents behind barrel files**: `import { X } from '../store'` where `store.ts` re-exports `./store/types` used to link to the barrel instead of the real declaration, so blast radius found 34 of 46 dependents of `GraphData`. Re-exports (`export *`, `export { a as b } from`, chained barrels and cycles) are now followed; the project cache version was bumped so old caches are rebuilt.
- **No tool can flood an agent's context any more**: every MCP result is cut to a size budget (lists and long strings) and serialized without indentation; anything omitted is described under `_compaction`. `get_blast_radius` for a hub type dropped from 142,000 to ~37,000 characters.
- **`validate_architecture_changes` checks only your edits**: by default it takes the files changed in the git working tree (or against `baseRef`, or an explicit `changedFiles` list) and returns only the problems in them (god files, clones, long and complex methods, hubs, mixed responsibilities), each with a fix hint. Legacy debt elsewhere no longer blocks an edit; `scope: "project"` restores the whole-project check.
- **`get_semantic_skeleton`** also returns an `outline` with original line numbers, and **`search_signatures`** accepts `filePath` and reports the declaration `kind`.
- **GUI for newcomers**: the graph is framed automatically on open and follows the window size, selecting a node centres it, a details panel explains the node (path, exports, who uses it, what it depends on, hot-spot warning), a legend explains the colours and the red dashed border, zoom and fit buttons plus a one-time controls hint were added, and the info card no longer covers the graph.
- **Reliability**: a mistyped `projectPath` now fails with a clear message instead of a "successful" empty analysis; persisted UI state no longer throws when IndexedDB is unavailable; recent projects no longer list a folder twice (`D:/` vs `d:/`); the MCP port can be set with `CODEMAPS_MCP_PORT`, and a busy port is reported in the log instead of crashing the app.

### 🇨🇳 变更 (ZH)

- **图不再丢失 barrel 文件背后的依赖**：当 `store.ts` 重新导出 `./store/types` 时，`import { X } from '../store'` 过去会连到 barrel 文件而不是真正的声明，因此影响范围分析只找到 `GraphData` 的 46 个依赖中的 34 个。现在会跟踪重新导出（`export *`、`export { a as b } from`、链式 barrel 和循环）；项目缓存版本已提升，旧缓存会重建。
- **任何工具都不会再撑爆代理的上下文**：每个 MCP 结果都限制在大小预算内（列表和长字符串），并且不带缩进；被省略的内容会在 `_compaction` 中说明。核心类型的 `get_blast_radius` 从 142,000 字符降到约 37,000。
- **`validate_architecture_changes` 只检查你的改动**：默认取 git 工作区中变更的文件（或相对 `baseRef`，或显式的 `changedFiles` 列表），只返回其中的问题（god 文件、代码克隆、过长/过复杂的方法、枢纽节点、职责混杂），并附修复建议。其他地方的历史债务不再阻塞修改；`scope: "project"` 恢复整个项目的检查。
- **`get_semantic_skeleton`** 还会返回带有原始行号的 `outline`，**`search_signatures`** 支持 `filePath` 并给出声明类型 `kind`。
- **面向新开发者的 GUI**：打开项目时图会自动适配窗口并随窗口大小调整，选中节点会居中，详情面板说明该节点（路径、导出、被谁使用、依赖什么、热点提示），图例解释颜色和红色虚线边框，新增缩放/适配按钮和一次性操作提示，信息卡片不再遮挡图。
- **可靠性**：`projectPath` 拼写错误现在会给出清晰的错误，而不是“成功”的空分析；IndexedDB 不可用时已保存的界面状态不再抛错；最近项目不再重复列出同一文件夹（`D:/` 与 `d:/`）；MCP 端口可通过 `CODEMAPS_MCP_PORT` 设置，端口被占用时会在日志中说明而不是让应用崩溃。
