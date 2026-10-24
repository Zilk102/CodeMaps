# Release v{{VERSION}} 🚀

### 🇷🇺 Изменения (RU)

- **Оценка здоровья CodeMaps на себе: 79 (C) -> 97 (A).** God-файлов, перегруженных модулей, модулей со смешанной ответственностью, нарушений слоёв, неопределённых слоёв, сложных методов и дублей: 0. Расщеплены `stackTopologyAdapterKit`, `reviewContextPolicies`, `TaskIntelligenceService`, `ProjectInsightService`, `ChangeContextService`, `oracle.ts`; около 70 функций приведены к сложности 8 и меньше, вложенности 3 и меньше.
- **CodeMaps стал строгим стражем собственного репозитория.** `npm run quality` (функции длиннее 60 строк, сложнее 8, вложеннее 3, раздутые классы) и `npm run duplicates` завершаются с кодом 1 при любой находке и входят в `npm run verify` и CI: новый код с god-файлом, дублем или лишней сложностью не пройдёт.
- **Слои:** файлы `types.ts` и `*.types.ts` считаются общими контрактами, а корневой HTML и ресурсы относятся к слою представления, поэтому их зависимости больше не дают ложных нарушений и «неизвестных слоёв».
- Тесты: 521 -> 527.

### 🇬🇧 Changes (EN)

- **CodeMaps health score on itself: 79 (C) -> 97 (A).** God files, oversized modules, mixed-responsibility modules, layer violations, unknown layers, complex methods and duplicates: all 0. `stackTopologyAdapterKit`, `reviewContextPolicies`, `TaskIntelligenceService`, `ProjectInsightService`, `ChangeContextService` and `oracle.ts` were split; about 70 functions are down to complexity 8 or less and nesting 3 or less.
- **CodeMaps is now a strict guardian of its own repository.** `npm run quality` (functions over 60 lines, complexity 8 or nesting 3, oversized classes) and `npm run duplicates` exit with code 1 on any finding and are part of `npm run verify` and CI: new code with a god file, a duplicate or extra complexity does not pass.
- **Layers:** `types.ts` and `*.types.ts` files count as shared contracts, and root HTML and assets belong to the presentation layer, so their dependencies no longer raise false violations or "unknown layer" findings.
- Tests: 521 -> 527.

### 🇨🇳 变更 (ZH)

- **CodeMaps 对自身的健康评分：79 (C) -> 97 (A)。** god 文件、过大模块、职责混杂模块、层级违规、未知层级、复杂方法和重复代码均为 0。`stackTopologyAdapterKit`、`reviewContextPolicies`、`TaskIntelligenceService`、`ProjectInsightService`、`ChangeContextService` 和 `oracle.ts` 已被拆分；约 70 个函数的复杂度降到 8 或以下、嵌套深度降到 3 或以下。
- **CodeMaps 现在是自身仓库的严格守门人。** `npm run quality`（超过 60 行、复杂度超过 8 或嵌套超过 3 的函数，以及过大的类）和 `npm run duplicates` 只要有任何发现就以退出码 1 结束，并已纳入 `npm run verify` 和 CI：带有 god 文件、重复代码或多余复杂度的新代码无法通过。
- **层级：** `types.ts` 和 `*.types.ts` 文件视为共享契约，根目录的 HTML 和资源归入表现层，因此它们的依赖不再产生误报的违规或“未知层级”。
- 测试：521 -> 527。
