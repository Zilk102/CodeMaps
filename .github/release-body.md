# Release v{{VERSION}} 🚀

### 🇷🇺 Изменения (RU)

- **Индексация больше не разбирает вендорные зависимости.** В игноре был только `node_modules`, поэтому копии вроде `node_modules-local` (по одной в каждом пакете воркспейса) считались кодом проекта: проект на ~2 000 файлов давал 17 281 файл и 191 910 узлов, а карта строилась минутами. Теперь исключены `node_modules*`, `pnpm-local`, `playwright-report`, `*.map` и `*.tsbuildinfo`: на проекте, где это всплыло, индекс уменьшился с 17 281 файла и 191 910 узлов до 1 905 файлов и 12 184 узлов, полная индексация занимает около 5 секунд.
- **Запись в граф снова линейная.** Каждый новый узел копировал всю карту узлов, а каждая связь — весь массив связей, из-за чего индекс на 190 тыс. узлов становился квадратичным. Теперь узлы и связи меняются на месте, обновляются только счётчики ревизий, а `pendingDiff` дополняется, а не пересобирается на каждый узел.
- **Графы, которые «зависали», теперь сохраняются в Kuzu.** В идентификаторах символов есть кавычки (`<file>#BinaryExpression[operator='in']`), а SQL-удвоение (`''`) для Kuzu — ошибка разбора, поэтому `graph.db` для таких проектов не записывался вообще, и blast radius / PR impact читали пустую или устаревшую базу. Теперь литералы экранируются по правилам openCypher (`\'`, `\\`).
- **Приложение больше не индексирует само себя по ошибке.** Канал `analyze-project` при пустом пути подставлял `process.cwd()` — в dev-сборке это репозиторий CodeMaps. Теперь перезагружается открытый проект или возвращается ошибка об отсутствующем пути.
- **MCP-клиент больше не подменяет открытую карту.** Анализ другого репозитория очищал общий store, закрывал watcher открытого проекта и присылал в окно чужой граф. Теперь такой анализ идёт в приватном store со своим пулом воркеров, без watcher и без событий: у открытого проекта остаются его карта, watcher и кэш.
- Тесты: 930 -> 944.

### 🇬🇧 Changes (EN)

- **Indexing no longer parses vendored dependencies.** The ignore list knew only `node_modules`, so vendored copies such as `node_modules-local` (one per workspace package) counted as project code: a project with about 2 000 source files produced 17 281 files and 191 910 nodes, and its map took minutes to build. `node_modules*`, `pnpm-local`, `playwright-report`, `*.map` and `*.tsbuildinfo` are excluded now; on the project that exposed it the index went from 17 281 files and 191 910 nodes to 1 905 files and 12 184 nodes, and a full index takes about 5 seconds.
- **Graph writes are linear again.** Every inserted node copied the whole node map and every added link copied the whole link array, which made a 190k-node index quadratic. Nodes and links are now mutated in place, only the revision counters change, and `pendingDiff` is appended to instead of being spread per node.
- **Graphs that used to hang now persist to Kuzu.** Symbol ids contain quotes (`<file>#BinaryExpression[operator='in']`), and the SQL style of doubling them (`''`) is a parse error in Kuzu, so `graph.db` was never written for such projects and blast-radius and PR-impact queries read an empty or stale database. Literals are escaped the openCypher way (`\'`, `\\`).
- **The app can no longer index itself by accident.** The `analyze-project` channel fell back to `process.cwd()` when the renderer sent no path, which in a development build is the CodeMaps repository itself. It now reloads the open project or reports the missing path.
- **An MCP client no longer replaces the map you have open.** Analyzing another repository used to clear the shared store, close the open project's watcher and push a different graph into the window. Such an analysis now runs in a private store with its own worker pool, without a watcher and without events, so the open project keeps its map, watcher and cache.
- Tests: 930 -> 944.

### 🇨🇳 变更 (ZH)

- **索引不再解析随仓库携带的依赖。** 忽略列表只认识 `node_modules`，因此 `node_modules-local` 这类随包附带的副本（每个工作区包各一份）被当作项目代码：约 2 000 个源文件的项目产生了 17 281 个文件和 191 910 个节点，地图需要数分钟才能构建。现在会排除 `node_modules*`、`pnpm-local`、`playwright-report`、`*.map` 和 `*.tsbuildinfo`：在暴露该问题的项目上，索引从 17 281 个文件、191 910 个节点降到 1 905 个文件、12 184 个节点，完整索引约需 5 秒。
- **写入图再次是线性的。** 每插入一个节点都会复制整个节点映射，每添加一条连线都会复制整个连线数组，使 19 万节点的索引变成二次复杂度。现在节点和连线原地修改，只更新修订计数器，`pendingDiff` 以追加方式维护，而不是每个节点都重建。
- **过去“卡住”的图现在能写入 Kuzu。** 符号标识里含有引号（`<file>#BinaryExpression[operator='in']`），而 SQL 式的双写（`''`）在 Kuzu 中是解析错误，因此这类项目的 `graph.db` 从未写入，blast radius 与 PR impact 读到的是空库或旧库。现在按 openCypher 规则转义（`\'`、`\\`）。
- **应用不会再意外索引自己。** 当渲染进程没有传路径时，`analyze-project` 会退回 `process.cwd()`，在开发构建中就是 CodeMaps 仓库本身。现在会重新加载已打开的项目，或返回缺少路径的错误。
- **MCP 客户端不再替换你打开的图。** 分析另一个仓库过去会清空共享 store、关闭已打开项目的 watcher，并把另一个图推送到窗口。现在这类分析在私有 store 中进行，使用独立的 worker 池，不启动 watcher、不发事件，因此已打开项目的图、watcher 和缓存保持不变。
- 测试：930 -> 944。
