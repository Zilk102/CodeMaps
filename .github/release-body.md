# Release v{{VERSION}} 🚀

### 🇷🇺 Изменения (RU)

- **Переключение на «Зависимости» больше не замораживает приложение**: раскладка обзора всего проекта (200+ файлов, 500+ связей) занимала около 9 секунд из-за размещения узлов методом network-simplex. Теперь используется размещение Brandes-Köpf и сниженная тщательность для больших графов, расчёт занимает около 0,3 с. Регрессионный тест упадёт, если раскладка снова замедлится.
- **Переключатели фильтров заработали**: «Папки / Файлы / Функции / Классы / ADR / Связи» раньше не были подключены к хранилищу и ничего не делали.
- **Инструменты Kuzu (`calculate_blast_radius_v2`, `analyze_activity_heatmap`, `analyze_pr_impact`) больше не падают с «Found duplicated primary key»**: каждое обновление графа запускало новое сохранение, которое очищает базу и вставляет граф заново, и перекрывающиеся сохранения конфликтовали. Теперь сохранения идут по одному, записывается только последний граф.
- **Аккуратнее экран графа**: высокая колонка фильтров заменена компактной панелью над графом (режим и фильтры-«чипы») и подсказкой «Как читать граф» с легендой и управлением; информационная карточка убрана, граф занимает всю область, кнопки масштаба в левом нижнем углу, панель сведений об узле открывается только при выборе узла, а разовая подсказка стала небольшим уведомлением.

### 🇬🇧 Changes (EN)

- **Switching to "Dependencies" no longer freezes the app**: laying out the whole-project overview (200+ files, 500+ links) took about 9 seconds because of network-simplex node placement. It now uses Brandes-Köpf placement with lower thoroughness for large graphs and takes about 0.3 s. A regression test fails if the layout becomes slow again.
- **The filter switches now work**: Directories / Files / Functions / Classes / ADR / Edges were never connected to the store and did nothing.
- **The Kuzu tools (`calculate_blast_radius_v2`, `analyze_activity_heatmap`, `analyze_pr_impact`) no longer fail with "Found duplicated primary key"**: every graph update started a new save that clears the database and re-inserts the graph, and overlapping saves collided. Saves now run one at a time and only the latest graph is written.
- **A cleaner graph screen**: the tall filter column is replaced by a compact toolbar over the graph (mode switch and filter chips) and a "How to read the graph" popover with the legend and controls; the info card is gone, the graph uses the whole area, zoom buttons moved to the bottom-left, the node details panel opens only when a node is selected, and the one-time hint is now a small toast.

### 🇨🇳 变更 (ZH)

- **切换到“依赖”不再冻结应用**：整个项目概览（200+ 个文件、500+ 条关联）的布局曾因 network-simplex 节点放置而耗时约 9 秒。现在对大型图使用 Brandes-Köpf 放置并降低精细度，耗时约 0.3 秒。如果布局再次变慢，回归测试会失败。
- **过滤开关现在有效**：目录 / 文件 / 函数 / 类 / ADR / 连线 开关此前从未连接到状态存储，点击没有任何效果。
- **Kuzu 工具（`calculate_blast_radius_v2`、`analyze_activity_heatmap`、`analyze_pr_impact`）不再报 “Found duplicated primary key”**：每次图更新都会启动新的保存，先清空数据库再重新写入图，重叠的保存会互相冲突。现在保存依次进行，只写入最新的图。
- **更整洁的图界面**：高大的过滤列被图上方紧凑的工具栏（模式切换和过滤标签）以及带图例和操作说明的“如何阅读图”弹窗取代；信息卡片已移除，图占满整个区域，缩放按钮移到左下角，节点详情面板仅在选中节点时打开，一次性提示变成了小型通知。
