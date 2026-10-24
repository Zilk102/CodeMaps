# Release v{{VERSION}} 🚀

### 🇷🇺 Изменения (RU)

- **Контроль документирования для всех языков.** CodeMaps измеряет, насколько код объяснён: заголовок у каждого файла, комментарий у каждого публичного символа и у каждой функции от 10 строк, в JS/TS/TSX/Vue, Python, Go, Rust, Java, Kotlin, C/C++, C#, PHP, Ruby, Zig, Swift и Bash (по соглашениям языка: JSDoc, docstring, `///`, Javadoc, PHPDoc, YARD и т. д.). Отдельно ловит комментарии-эхо («Gets the user» над getUser), слишком короткие и закомментированный код. Тесты и сгенерированные файлы не считаются.
- **23-й MCP-инструмент `check_documentation`** возвращает покрытие, статистику по языкам, худшие файлы и список недокументированных символов с подсказкой, что именно должен сказать комментарий. `validate_architecture_changes` теперь выдаёт находку `missing_documentation` для изменённых файлов, контексты изменения и ревью содержат раздел `documentation`, а оценка здоровья учитывает покрытие (штраф до 5 баллов при покрытии ниже 80%).
- **Вкладка «Документация» в панели «Рабочая область»:** покрытие, символы без документации, файлы без заголовка, пустые комментарии, полосы по языкам и худшие файлы; клик по файлу выделяет его в графе.
- **Строгий страж:** `npm run docs` завершается с кодом 1 при любой находке и входит в `npm run verify` и CI. Весь код CodeMaps (около 400 файлов, 1749 обязательных символов) задокументирован: покрытие 100%. Навык агента требует документировать каждый новый и изменённый файл и публичный символ (назначение, контракт, «почему»), а после написания кода вызывать `check_documentation`.
- Расщеплены `declarationsTypeScript` и `ReviewContextService`. Тесты: 527 -> 702.

### 🇬🇧 Changes (EN)

- **Documentation control for all languages.** CodeMaps measures how well code is explained: a header for every file and a comment on every public symbol and every function of 10 lines or more, in JS/TS/TSX/Vue, Python, Go, Rust, Java, Kotlin, C/C++, C#, PHP, Ruby, Zig, Swift and Bash (each language's own convention: JSDoc, docstrings, `///`, Javadoc, PHPDoc, YARD and so on). It also catches echo comments ("Gets the user" above getUser), comments that are too short, and commented-out code. Tests and generated files are not counted.
- **The 23rd MCP tool, `check_documentation`,** returns coverage, per-language stats, the worst files and the list of undocumented symbols with a hint of what the comment should say. `validate_architecture_changes` now reports a `missing_documentation` finding for changed files, the change and review contexts carry a `documentation` section, and the health score includes coverage (a penalty of up to 5 points below 80% coverage).
- **A "Documentation" tab in the Workspace panel:** coverage, undocumented symbols, files without a header, empty comments, per-language bars and the worst files; clicking a file selects it in the graph.
- **A strict guardian:** `npm run docs` exits with code 1 on any finding and is part of `npm run verify` and CI. All CodeMaps code (about 400 files, 1749 required symbols) is documented: 100% coverage. The agent skill tells agents to document every new and changed file and public symbol (purpose, contract, why) and to call `check_documentation` after writing code.
- `declarationsTypeScript` and `ReviewContextService` were split. Tests: 527 -> 702.

### 🇨🇳 变更 (ZH)

- **面向所有语言的文档控制。** CodeMaps 衡量代码被解释得有多好：每个文件有头部注释，每个公开符号和每个 10 行以上的函数有注释，覆盖 JS/TS/TSX/Vue、Python、Go、Rust、Java、Kotlin、C/C++、C#、PHP、Ruby、Zig、Swift 和 Bash（遵循各语言自己的约定：JSDoc、docstring、`///`、Javadoc、PHPDoc、YARD 等）。它还会发现“回声”注释（在 getUser 上写“Gets the user”）、过短的注释以及被注释掉的代码。测试和生成的文件不计入。
- **第 23 个 MCP 工具 `check_documentation`** 返回覆盖率、各语言统计、问题最多的文件，以及未文档化符号的列表，并提示注释应当说明什么。`validate_architecture_changes` 现在会对改动的文件给出 `missing_documentation` 发现，变更和评审上下文带有 `documentation` 部分，健康评分也计入覆盖率（覆盖率低于 80% 时最多扣 5 分）。
- **工作区面板新增“文档”标签页：** 覆盖率、未文档化符号、缺少头部的文件、空注释、各语言进度条和问题最多的文件；点击文件会在图中选中它。
- **严格的守门人：** `npm run docs` 只要有任何发现就以退出码 1 结束，并已纳入 `npm run verify` 和 CI。CodeMaps 的全部代码（约 400 个文件，1749 个必需符号）均已文档化：覆盖率 100%。智能体技能要求为每个新增和修改的文件及公开符号编写文档（目的、契约、原因），并在写完代码后调用 `check_documentation`。
- 拆分了 `declarationsTypeScript` 和 `ReviewContextService`。测试：527 -> 702。
