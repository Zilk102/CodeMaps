# Release v{{VERSION}} 🚀

### 🇷🇺 Изменения (RU)

- **Поиск клонов теперь находит копии, изменённые после вставки.** Раньше показывался только код, совпадающий с точностью до имён, чисел и строк, поэтому блок с одним лишним оператором или переименованной веткой выглядел уникальным, и агенты находили такие дубли только чтением файла. Теперь точные совпадения одной и той же пары мест, между которыми не больше оператора различий, сливаются в одну копию. На Go-проекте из бенчмарка это показывает скопированные блоки ответа «me» и повторяющееся раскрытие соседей гекса в `handlers.go`, которые раньше пропускались, а существующие группы вырастают до всего изменённого блока. Поиск по-прежнему занимает 0,15-0,65 с на проектах из 120-190 файлов.
- **CodeMaps лучше проходит собственные проверки.** CodeMaps запустили на себе, и худшими оказались новые `planSplit` (сложность 52), `detectClones` (40) и `analyzeModuleQuality` (38): каждая теперь представляет собой конвейер небольших именованных функций с прежним результатом (качество планов разбиения и вывод клонов проверены без изменений), а анализ структуры файла вынесен из 950-строчного `moduleQualityMetrics.ts` в отдельный модуль. Два почти одинаковых построителя рёбер планировщика кластеров объединены в один.
- **Сломанный скриншот в профиле GitHub.** README профиля ссылался на `screenshots/main-graph.jpg`, который заменил релиз v1.1.46. Ссылка теперь ведёт на новое изображение, а тест падает, если README ссылается на несуществующую картинку или если удалена картинка, которую использует профиль.

### 🇬🇧 Changes (EN)

- **Clone detection now finds copies that were edited after pasting.** Until now only code that was identical up to names, numbers and strings was reported, so a block with one extra statement or a renamed branch looked unique and agents found such duplicates only by reading the file. Exact matches of the same two places that follow each other with up to a statement of difference between them are now merged into one copy. On the Go project used for the benchmark this reveals the copied "me" response blocks and the repeated hex-neighbour expansion in `handlers.go` that were missed before, and the existing groups grow to cover the whole edited block. Detection still takes 0.15-0.65 s on projects of 120-190 files.
- **CodeMaps now passes its own checks better.** CodeMaps was run on itself and its worst offenders were the new `planSplit` (complexity 52), `detectClones` (40) and `analyzeModuleQuality` (38): each is now a pipeline of small named functions with identical results (split-plan quality and clone output verified unchanged), and the source-file structure analysis moved out of the 950-line `moduleQualityMetrics.ts` into its own module. The two near-identical edge builders of the cluster planner became one.
- **A broken screenshot on the GitHub profile.** The profile README hotlinked `screenshots/main-graph.jpg`, which v1.1.46 replaced. The link now points at the new image, and a test fails if a README references an image that does not exist or if the image the profile uses is removed.

### 🇨🇳 变更 (ZH)

- **克隆检测现在能找到粘贴后又被修改过的副本。** 以前只报告在名称、数字和字符串之外完全相同的代码，因此多出一条语句或改了分支名的代码块看起来是唯一的，智能体只能通过阅读文件才能发现这类重复。现在，同一对位置上彼此相邻、差异不超过一条语句的精确匹配会被合并为一个副本。在基准测试所用的 Go 项目中，这会找出 `handlers.go` 里此前被漏掉的“me”响应块复制和重复的六边形邻居展开，已有的分组也会扩大到覆盖整个被修改的代码块。在 120-190 个文件的项目上，检测仍只需 0.15-0.65 秒。
- **CodeMaps 自身通过检查的情况更好。** 我们让 CodeMaps 分析自己，结果最糟糕的是新增的 `planSplit`（复杂度 52）、`detectClones`（40）和 `analyzeModuleQuality`（38）：现在它们都被拆成由小而有名字的函数组成的流水线，结果保持不变（拆分方案质量和克隆输出均已验证未变），源文件结构分析也从 950 行的 `moduleQualityMetrics.ts` 中移到独立模块。聚类规划器中两个几乎相同的边构建函数合并为一个。
- **GitHub 个人主页上的截图失效。** 个人主页的 README 直接引用了 `screenshots/main-graph.jpg`，而 v1.1.46 已将其替换。现在链接指向新图片，并且如果 README 引用了不存在的图片，或主页所用图片被删除，测试就会失败。
