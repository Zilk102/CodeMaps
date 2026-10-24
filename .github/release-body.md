# Release v{{VERSION}} 🚀

### 🇷🇺 Изменения (RU)

- **`codemaps-guard check --strict` теперь падает на всём, что снижает оценку здоровья:** god-файлах и классах, раздутых модулях, модулях со смешанной ответственностью, длинных и сложных функциях, дублях, нарушениях слоёв и отсутствии документации, при любой серьёзности (хабы и высокий fan-out остаются справочными). Раньше строгая проверка всего проекта пропускала находки средней серьёзности, из-за чего регресс оценки CodeMaps на себе (97 -> 83) не поймала собственная CI. Теперь CodeMaps проверяет себя этим же гейтом.
- **Слои для папок точек входа.** Папки `setup`, `guard`, `cli`, `bootstrap`, `commands`, `workflows` и подобные относятся к слою приложения, поэтому у новых модулей больше нет «неизвестного слоя» (было 178 таких узлов).
- Расщеплены `HealthScoreAnalyzer`, `moduleQualityMetrics` и `PatternDetectionAnalyzer`. Оценка здоровья CodeMaps на себе: 97 (A), нулевые счётчики всех структурных проблем. Тесты: 880 -> 888.

### 🇬🇧 Changes (EN)

- **`codemaps-guard check --strict` now fails on everything that lowers the health score:** god files and classes, oversized modules, mixed-responsibility modules, long and complex functions, clones, layer violations and missing documentation, at any severity (hubs and high fan-out stay informational). A strict whole-project check used to let medium-severity findings through, which is why CodeMaps' own CI missed the drop of its self-score (97 -> 83). CodeMaps now checks itself with this same gate.
- **Layers for entry-point folders.** Folders such as `setup`, `guard`, `cli`, `bootstrap`, `commands` and `workflows` belong to the application layer, so new modules no longer get an "unknown layer" (178 such nodes before).
- `HealthScoreAnalyzer`, `moduleQualityMetrics` and `PatternDetectionAnalyzer` were split. CodeMaps health score on itself: 97 (A), every structural counter at zero. Tests: 880 -> 888.

### 🇨🇳 变更 (ZH)

- **`codemaps-guard check --strict` 现在会对所有拉低健康评分的问题失败：** god 文件和类、过大模块、职责混杂模块、过长和过于复杂的函数、重复代码、层级违规以及缺失文档，不论严重程度（枢纽和高扇出仍仅作提示）。此前对整个项目的严格检查会放过中等严重程度的问题，因此 CodeMaps 自己的 CI 没能发现其自身评分的下降（97 -> 83）。现在 CodeMaps 用同样的门禁检查自己。
- **入口类文件夹的层级。** `setup`、`guard`、`cli`、`bootstrap`、`commands`、`workflows` 等文件夹归入应用层，因此新模块不再出现“未知层级”（此前有 178 个这样的节点）。
- 拆分了 `HealthScoreAnalyzer`、`moduleQualityMetrics` 和 `PatternDetectionAnalyzer`。CodeMaps 对自身的健康评分：97 (A)，所有结构性问题计数均为零。测试：880 -> 888。
