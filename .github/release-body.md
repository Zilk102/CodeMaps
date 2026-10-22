# Release v{{VERSION}} 🚀

### 🇷🇺 Изменения (RU)

- **`get_blast_radius` стал читаемой сводкой**: вместо сырого списка узлов он возвращает счётчики, затронутые файлы по областям (с числом тестов), сначала прямых зависимых и только ближайших косвенных; есть `limit` и `detail: "full"` для сырого результата. Для `GraphData` ответ сократился с ~37 000 до ~2 500 символов.
- **`get_node_dependencies` работает для узла файла**: раньше файл выглядел неиспользуемым, потому что импорты ведут на `файл#символ`. Теперь учитываются символы внутри файла, а каждый соседний файл перечислен один раз со счётчиком связей (`dependentFiles`, `dependencyFiles`); сырые связи ограничены параметром `limit` и показывают общее число.
- **`search_graph` ранжирует результаты**: точное имя, затем начало, подстрока и путь; символы, которые совпадают только путём своего файла, больше не забивают список.
- Тесты сводки blast radius, зависимостей файла и ранжирования поиска; `mcp:smoke` проверяет новые поля ответа.

### 🇬🇧 Changes (EN)

- **`get_blast_radius` is now a readable summary**: instead of a raw node-level dump it returns counts, the affected files grouped by area (with how many are tests), the direct dependents first and only the nearest indirect ones, with `limit` and `detail: "full"` for the raw result. For `GraphData` the response shrank from ~37,000 to ~2,500 characters.
- **`get_node_dependencies` works for file nodes**: a file used to look unused because imports point at `file#symbol`. It now covers the symbols inside the file and lists every neighbouring file once with a link count (`dependentFiles`, `dependencyFiles`); raw links are limited by `limit` and report their totals.
- **`search_graph` ranks results**: exact name, then prefix, substring and path; symbols that only share their file's path no longer flood the list.
- Tests for the blast-radius summary, file-node dependencies and search ranking; `mcp:smoke` checks the new response fields.

### 🇨🇳 变更 (ZH)

- **`get_blast_radius` 变为易读的摘要**：不再返回原始的节点级数据，而是返回计数、按区域分组的受影响文件（含测试文件数量）、优先列出直接依赖方并只保留最近的间接依赖方；支持 `limit` 和用于原始结果的 `detail: "full"`。`GraphData` 的响应从约 37,000 字符缩小到约 2,500。
- **`get_node_dependencies` 支持文件节点**：过去文件会显得“无人使用”，因为导入指向的是 `文件#符号`。现在会涵盖文件内部的符号，并将每个相邻文件只列出一次并附带关联数量（`dependentFiles`、`dependencyFiles`）；原始关联受 `limit` 限制并显示总数。
- **`search_graph` 会对结果排序**：先完全匹配名称，再是前缀、子串和路径；仅因所在文件路径而匹配的符号不再充斥列表。
- 新增影响范围摘要、文件节点依赖和搜索排序的测试；`mcp:smoke` 会检查新增的响应字段。
