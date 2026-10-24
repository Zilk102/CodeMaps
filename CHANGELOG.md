# CodeMaps Changelog

## v1.1.60 (2026-10-24)

### Added

- **Zero configuration for any agent and any project.** Connect CodeMaps over MCP to any agent (Claude Code, Cursor, Codex, Copilot, Gemini CLI, Windsurf, Cline and others) and nothing else is needed: the server tells the agent in its `instructions` to call `setup_project` first. The agent gets the core loop (task context before code, duplicate search, validation and documentation after edits).
- **New `setup_project` tool.** It detects languages, package manager, test and lint commands, CI and which agents the project uses (plus the agent that called it), and writes the guardrails itself: a section in `AGENTS.md`, rules for each agent (`CLAUDE.md` and a skill, `.cursor/rules`, `.github/copilot-instructions.md`, `GEMINI.md`, `.windsurf`, `.clinerules`), an after-edit validation hook for Claude Code, plus `.codemaps/config.json` and `.codemaps/baseline.json`. Writing is idempotent: foreign text is never touched, JSON is merged, a second call writes nothing, paths outside the project are rejected. `apply: false` shows the plan only.
- **Project config and a "ratchet" for legacy code.** `.codemaps/config.json` sets the mode (`ratchet` or `strict`), exclusions and thresholds. In `ratchet` mode existing findings are frozen in `baseline.json`: the tools report only new or worsened findings and the debt can only shrink, so strict rules can be switched on in any old project. See `docs/PROJECT_CONFIG.md` and `docs/AGENT_SETUP.md`.
- Tests: 702 -> 838.

## Unreleased

### Added

- **`codemaps-guard`: the guardrails in any project's CI, without the app.** A standalone, deterministic Node CLI (`check`, `baseline`, `version`) that builds the code graph in memory (no Electron, no Kuzu, no worker threads, no network, no telemetry) and runs the very same analysis as `validate_architecture_changes`, `check_documentation` and the clone detector, honoring `.codemaps/config.json` and the baseline. `check --base origin/main` judges only the changed files, prints text, GitHub Actions annotations or JSON, and also fails when `baseline.json` grew compared with the base ref. It is bundled with `npm run build:guard` into `codemaps-guard-<version>.tgz` (+ `codemaps-guard.tgz` and `.sha256` files), uploaded with every release, and run on CodeMaps itself in CI. `setup_project` now writes the CI wiring: `.github/workflows/codemaps-guard.yml` for GitHub Actions, or `.codemaps/ci/gitlab-ci.yml` and `.codemaps/ci/guard.sh` for GitLab and any other CI. See `docs/CI_GUARD.md`.

- **Zero-config agent setup.** The MCP server now sends every client an `instructions` text that tells the agent to call the new 24th tool, `setup_project`, first. The tool detects the stack, its commands, the CI provider and the agent in use (existing agent files plus the MCP `clientInfo.name`) and writes the guardrails itself: an `AGENTS.md` section, `CLAUDE.md`, the `codemaps-agent-autopilot` skill, a `PostToolUse` edit-validation hook (`.codemaps/hooks/validate.mjs`, merged into `.claude/settings.json`), Cursor, Copilot, Gemini, Windsurf and Cline rules, `.codemaps/config.json` and a baseline that freezes the findings a legacy project already has. It is idempotent (a second run writes nothing), safe to call concurrently, never overwrites user content (version-marked blocks, JSON merge, symlink and `..` escapes rejected), and `apply: false` previews the plan. See `docs/AGENT_SETUP.md`.
- A "Zero-config setup" card in the MCP settings, the skill now covers `setup_project`, documentation rules, the ratchet and legacy refactoring, and `npm run sync:templates` regenerates the shipped copies of the skill and the hook from their sources.

## v1.1.59 (2026-10-24)

### Added

- **Documentation control for all languages.** CodeMaps measures how well code is explained: a header for every file and a comment on every public symbol and every function of 10 lines or more, in JS/TS/TSX/Vue, Python, Go, Rust, Java, Kotlin, C/C++, C#, PHP, Ruby, Zig, Swift and Bash (each language's own convention: JSDoc, docstrings, `///`, Javadoc, PHPDoc, YARD and so on). It also catches echo comments ("Gets the user" above getUser), comments that are too short, and commented-out code. Tests and generated files are not counted.
- **The 23rd MCP tool, `check_documentation`,** returns coverage, per-language stats, the worst files and the list of undocumented symbols with a hint of what the comment should say. `validate_architecture_changes` now reports a `missing_documentation` finding for changed files, the change and review contexts carry a `documentation` section, and the health score includes coverage (a penalty of up to 5 points below 80% coverage).
- **A "Documentation" tab in the Workspace panel:** coverage, undocumented symbols, files without a header, empty comments, per-language bars and the worst files; clicking a file selects it in the graph.
- **A strict guardian:** `npm run docs` exits with code 1 on any finding and is part of `npm run verify` and CI. All CodeMaps code (about 400 files, 1749 required symbols) is documented: 100% coverage. The agent skill tells agents to document every new and changed file and public symbol (purpose, contract, why) and to call `check_documentation` after writing code.
- `declarationsTypeScript` and `ReviewContextService` were split. Tests: 527 -> 702.

## v1.1.57 (2026-10-24)

### Changed

- **CodeMaps health score on itself: 79 (C) -> 97 (A).** God files, oversized modules, mixed-responsibility modules, layer violations, unknown layers, complex methods and duplicates: all 0. `stackTopologyAdapterKit`, `reviewContextPolicies`, `TaskIntelligenceService`, `ProjectInsightService`, `ChangeContextService` and `oracle.ts` were split; about 70 functions are down to complexity 8 or less and nesting 3 or less.
- **CodeMaps is now a strict guardian of its own repository.** `npm run quality` (functions over 60 lines, complexity 8 or nesting 3, oversized classes) and `npm run duplicates` exit with code 1 on any finding and are part of `npm run verify` and CI: new code with a god file, a duplicate or extra complexity does not pass.
- **Layers:** `types.ts` and `*.types.ts` files count as shared contracts, and root HTML and assets belong to the presentation layer, so their dependencies no longer raise false violations or "unknown layer" findings.
- Tests: 521 -> 527.

## v1.1.56 (2026-10-24)

### Fixed

- **Duplicate search no longer depends on the file set or file order.** Token ids used to follow first-seen order and copies within a bucket were only paired with the first one, so `find_duplicates` and `npm run duplicates` could disagree on the same project, and adding an unrelated file could hide a group. Ids are now derived from the token text, all pairs are matched, streams are sorted by file, and one short copy no longer drops its whole group. The fix uncovered 9 more hidden groups, which were removed: CodeMaps shows 0 groups on itself.
- **The title bar no longer overlaps the language switcher in a narrow window:** below 1100 px the Open project, Close project, MCP settings and Workspace buttons show only their icon, with a tooltip.
- **Function complexity:** 9 functions of complexity 11 are down to 8 or less, and the `npm run quality` threshold drops from 15 to 10 and stays empty. Tests: 519 -> 521.

## v1.1.55 (2026-10-24)

### Changed

- **CodeMaps no longer duplicates itself:** the clone detector reports 0 groups on its own code (it was 40), and `npm run quality` is empty (no function over 60 lines or complexity 15, no god classes). Shared parts moved into small modules: risk rules, stack adapters, UI panels, main-process bindings. Behavior and tool output are unchanged.
- **New `npm run quality` and `npm run duplicates` commands** run the same CodeMaps measurements on any folder; they are listed in CLAUDE.md so new code adds no findings. Tests: 467 -> 519.

## v1.1.54 (2026-10-23)

### Added

- **`find_duplicates`, the 22nd MCP tool: where code is copy-pasted and how to remove it.** For each group of copies it returns the files and line ranges, how many values differ between the copies (the arguments of the function to extract), sample differences ("users.go:12 `user` vs orders.go:30 `order`"), and a suggestion: merge identical copies, extract a function in the same package, or move shared code to a shared module (with a target file). `filePath` limits it to groups touching one file, `includeTests` searches tests as well. The agent skill tells agents to call it before writing code similar to existing code and again after a refactor.
- **A "Duplicates" tab in the Workspace panel** shows the same report to people: totals, one card per group with the suggested action and reason, and every copy as a button that selects the file in the graph.
- **Project-level import resolution for C/C++, C#, Kotlin, PHP and Ruby**, with the same quality bar as Go, Python, Java and Rust. C/C++: quoted includes (relative to the file, then `include/`, `src/` and path suffixes) and the declarations used from headers, `.cpp` linked to its header. C#: `using`, `using static`, aliases, file-scoped and block namespaces. Kotlin: imports, wildcards, aliases and top-level functions, shared with Java (they link to each other). PHP: `use`, group use, aliases and PSR-4 from `composer.json`, plus `require`/`include` of literal paths. Ruby: `require_relative`, `require` through `lib/`, `load`, and constants used.

### Fixed

- **Duplicates in TypeScript were mostly missed.** The token scanner did not know it was inside a template literal, so everything after the first `${}` was read as one string. TypeScript clone groups in a project jump accordingly (CodeMaps itself now shows 40 groups instead of 18).
- **The tab bar of the Workspace panel was clipped** when a tab had a long result: the header and tabs could shrink instead of the content scrolling.

### Changed

- **Health score of CodeMaps on itself: 59 (F) -> 61 -> 70 (C)** over the last releases: god files 5 -> 0, god classes 11 -> 0, long methods 13 -> 0, oversized modules 10 -> 4, mixed-responsibility modules 10 -> 3, SOLID 57 -> 90. The remaining penalty is mostly duplication (40 groups, newly visible thanks to the tokenizer fix), 14 methods of complexity 12-16 and layer guesses for new folders. The split-plan code, clone detector, stack-detection catalogs and adapters were split into small modules (the Spring, Ktor, Micronaut, Quarkus, ASP.NET, Python, Ruby, PHP, Go and Rust adapters now share one adapter kit). Tests: 412 -> 467.

## v1.1.53 (2026-10-23)

### Changed

- **CodeMaps now passes its own checks.** Run on itself, CodeMaps scored 59 of 100 (F): 30 candidates for decomposition, up to 52 cyclomatic complexity in one function, a 372-line class and a 950-line file. Two waves of behavior-preserving refactoring (four parallel passes each, merged and re-verified) split every function over 60 lines or complexity 15, every oversized class and the god files into small named units and modules: analysis scoring and pattern rules, parsing and import resolvers, MCP tool registration, the main process and the whole renderer (graph view, panels, file tree, layout engine, settings). Public exports, tool schemas and outputs did not change (`docs/MCP_TOOLS.md` is byte-identical, 294 tests grew to 412 and all pass, and the graph, panels and settings were checked in the running window). Measured on itself: functions and classes over the thresholds 77 -> 0; god classes 11 -> 0; long methods 13 -> 0; god files 5 -> 1; complex methods 24 -> 15; SOLID score 57 -> 86; maintainability 62 -> 72; overall health 59 -> 61 (D), because the overall score also counts duplication, layer guesses and the few remaining oversized modules, which are listed in the notes below.
- **Test files no longer count as "god files" or "oversized modules".** A long test file is long by nature; size and complexity findings now concern production code only. Tests are still measured.

### Added

- **`npm run quality`** prints every function over 60 lines or cyclomatic complexity 15 and every oversized class of the repository with the same measurements CodeMaps uses (`scripts/quality-report.mjs`, also usable on any folder). New code is expected to keep it empty.

### Known limits

- Still above the thresholds of the overall health score: nine oversized modules (mostly the large stack-detection adapter tables), 15 methods of complexity 12-16, and duplicated skeletons between the Spring, Ktor, Micronaut and Quarkus adapters.

## v1.1.52 (2026-10-23)

### Added

- **Clone detection now finds copies that were edited after pasting.** Until now only code that was identical up to names, numbers and strings was reported, so a block with one extra statement or a renamed branch looked unique and agents found such duplicates only by reading the file. Exact matches of the same two places that follow each other with up to a statement of difference between them are now merged into one copy. On the Go project used for the benchmark this reveals the copied "me" response blocks and the repeated hex-neighbour expansion in `handlers.go` that were missed before, and the existing groups grow to cover the whole edited block. Detection still takes 0.15-0.65 s on projects of 120-190 files.

### Changed

- **CodeMaps now passes its own checks better.** CodeMaps was run on itself and its worst offenders were the new `planSplit` (complexity 52), `detectClones` (40) and `analyzeModuleQuality` (38): each is now a pipeline of small named functions with identical results (split-plan quality and clone output verified unchanged), and the source-file structure analysis moved out of the 950-line `moduleQualityMetrics.ts` into its own module. The two near-identical edge builders of the cluster planner became one.

### Fixed

- **A broken screenshot on the GitHub profile.** The profile README hotlinked `screenshots/main-graph.jpg`, which v1.1.46 replaced. The link now points at the new image, and a test fails if a README references an image that does not exist or if the image the profile uses is removed.

## v1.1.51 (2026-10-23)

### Fixed

- **Paths relative to the project root were not understood.** `analyze_decomposition` with `filePath: "internal/app/handlers.go"` returned nothing and only an absolute path worked. `get_node_dependencies`, `get_blast_radius`, `calculate_blast_radius_v2`, `get_semantic_skeleton` and `analyze_decomposition` now accept an absolute path, a path relative to the project root (with or without `./`, with a `#symbol`, with either slash) or the exact node id. A reference that matches nothing now says what to pass.
- **`validate_architecture_changes` reported a clone without saying where.** Only the five biggest groups carried evidence, so a clone in a smaller group showed up as a bare file name. Every copy of every group now comes with its file and line range and the places it is duplicated at ("26 duplicated lines at admin_users.go:164-189; the same code is also at admin_users.go:220-245"), and the clone list is no longer cut to 15 groups.
- **A file that builds the object graph or the routes was flagged for high fan-out.** A file that declares a constructor, registration or setup function (`New`, `Register`, `Routes`, `Setup`, `create_app`, ...) composes other modules by design and now gets twice the fan-out threshold. Entry points such as `main.go` were already exempt.

### Known limits

- Clone detection finds code that is the same up to names, numbers and strings. Blocks that were copied and then edited (a different number of statements, an extra branch) are not reported.

## v1.1.50 (2026-10-23)

### Added

- **Duplicate-code (clone) detection for every language.** Before, only whole TypeScript/JavaScript functions with identical bodies were compared, so Go, Python, Java and Rust projects always reported zero clones even when a block had been pasted five times. A new token-level detector reads every supported file (TypeScript through the compiler scanner, all other languages through tree-sitter), normalizes names, numbers and strings so a copy with renamed variables still matches, and finds copied blocks across and inside files. It skips imports, comments, test files and generated code (migrations, `*.pb.go`, `*_pb2.py`), ignores a table of similar entries matching itself, and keeps token streams cached per file so a refresh after one edit reads only that file. `get_health_score`, `detect_patterns`, `validate_architecture_changes` and the review tools now report each copy with its file and line range ("12 duplicated lines also appear in 2 other places: a.go:10-30, b.go:55-75"). On the Go project that motivated this, the 49 files give 40 groups in 0.2 s, including the real copies in `handlers.go`; Python, Java and Rust projects of 120-160 files take 0.3-0.9 s.

### Changed

- **`validate_architecture_changes` no longer raises false alarms on correct code.** Coupling is counted in files, not links: using fifteen symbols of one file is one dependency, files of one package that need no import count a quarter, and a file is reached through its symbols. Shared-by-design code (helpers, utils, constants, models, domain, `pkg`, `lib`) is never a "hub", a hub is advice and never blocks a change, and entry points that wire the program together (`main.go`, `Program.cs`, `Application.java`, `__main__.py`) are exempt from fan-out and layer rules. A Go handler package that previously failed validation with a high-severity fan-out finding now passes.
- **Better split plans.** Symbols that use the same fields, types and functions of other files are now drawn together even if they never call each other, and the number of clusters grows with the size of the file (up to 12). Measured against the splits that two independent agents made of the same 2,400-line Go file, pair agreement (F1) rose from 0.31 to 0.51.

### Fixed

- **Fan-in of a file was always 0** when importers named symbols (`file#Name`), which understated coupling in design-smell scores and decomposition evidence.

## v1.1.49 (2026-10-23)

### Added

- **Split plans for god files.** `analyze_decomposition` used to answer "extract a module" and nothing more, so an agent had to read a 2,400-line file to find where to cut it. It now also returns `splitPlans` for the worst files (or for the file you pass in the new `filePath` argument): the file's declarations grouped into clusters that belong together, each with a suggested file name, its symbols and line count, the shared helpers it needs and the clusters it calls into. Symbols that call each other or share a topic word end up together; helpers used all over the file and "wiring" symbols such as a route table are set aside; large module-level data tables count as symbols, and `heaviest` and `coverage` say when one huge constant is the real problem. Works for TypeScript/JavaScript (compiler API) and for every tree-sitter language, with methods qualified by their class or receiver. The plan is a heuristic: it reports how cleanly the file falls apart (`confidence`, `cohesion`) and says so when it does not.

### Fixed

- **Test files of other languages were not recognised in `get_blast_radius`.** `_test.go`, `test_*.py`, `*_test.py`, `*Test.java` and `*_test.rs` are now counted as tests.

## v1.1.48 (2026-10-23)

### Added

- **Real dependency graphs for Go, Python, Java and Rust.** Before, only relative imports were linked, so a Go project of 54 files had a single link and every graph tool (`get_blast_radius`, `get_node_dependencies`, `analyze_decomposition`, validation) came back empty. Imports are now resolved against the whole project after indexing: `go.mod` module paths (nested modules, local `replace`) and same-package references for Go; absolute, relative, `src/`-layout and `__init__` re-exported imports for Python; packages, wildcard and static imports and same-package classes for Java; Cargo crates, `mod` trees, `use` paths and `pub use` re-exports for Rust. Links point at the declaring file and symbol, and the standard library and external packages are ignored. On four real projects, files with imports got links in 83% (Go), 95% (Java), 83% (Rust) and 53% (Python, many of them tests importing only pytest or Django) of the cases; in the samples I checked, the remaining files import only the standard library or external packages.
- **Richer declarations.** Go interfaces and named types, methods named after their receiver (`Handler.Get`), Java interfaces, enums, records and methods named after their class, Python methods named after their class, Rust traits, type aliases and impl functions named after their type.

### Fixed

- **`get_blast_radius` for a file reported no dependents** whenever the importers named symbols (`import { a } from './x'`), which is the usual case: nothing points at the file node itself. A file is now analysed together with the symbols it declares, in both the raw analysis and the summary.
- **Architecture layers were guessed only from front-end folder names.** Handlers, routers, transport, middleware, services, repositories (`repo`, `dao`, `persistence`), models/DTOs, `cmd`, `pkg` and config folders now map to layers, so far fewer nodes are "unknown" in backend projects.

## v1.1.47 (2026-10-22)

### Fixed

- **The Kuzu tools (`calculate_blast_radius_v2`, `analyze_activity_heatmap`, `analyze_pr_impact`) failed with "Kuzu background worker exited with code 3221225477".** A graph database left damaged by the earlier overlapping saves made the native library crash (access violation) while replaying its write-ahead log, so the worker died before any error could be reported and the v1.1.44 recovery never ran. CodeMaps now also treats a worker that dies at start-up (Windows 0xC0000005/0xC0000409, SIGSEGV/SIGABRT) as a damaged cache: the files are moved aside and a fresh database is created. Verified against a copy of the database that crashed on the maintainer's machine.

## v1.1.46 (2026-10-22)

### Fixed

- **"Critical Application Error: listen EADDRINUSE" when port 3005 is already taken** (for example a second CodeMaps instance, such as a dev build next to the installed app). The error was re-emitted by the WebSocket server and escaped as an uncaught exception. It is now handled: the MCP status shows "Unavailable" with the reason (port in use / cannot listen) in the MCP Settings window, and the app keeps running. `CODEMAPS_MCP_PORT` selects another port.

### Changed

- **Language switcher moved into the title bar**, so it no longer overlaps the graph.
- **Repository presentation.** New README structure in six languages (English, Russian, Chinese, Spanish, Japanese, Korean) with fresh screenshots, `docs/ARCHITECTURE.md`, a generated `docs/MCP_TOOLS.md` reference of all 21 tools and 4 resources (kept in sync by a test; `npm run docs:mcp`), `CONTRIBUTING.md` (English) and `CONTRIBUTING.ru.md`, a pull-request template, package metadata (description, keywords, homepage, bugs, engines) and a `.gitignore` that no longer hides tracked files.

## v1.1.45 (2026-10-22)

### Fixed

- **v1.1.44 broke the Kuzu worker in installed builds.** The new database-recovery helper was named `kuzuRecovery.ts` (lower-case k) while the `asarUnpack` rule is `Kuzu*.js` and is case-sensitive, so the file stayed inside `app.asar` where the system Node that runs the worker cannot read it, and the worker exited with code 1 at start-up. The helper is now `KuzuRecovery.ts`. A new test walks every file the worker loads and fails if one is not covered by `asarUnpack`, and the fix was verified by running the worker from a real packaged build against a copy of a damaged database.

## v1.1.44 (2026-10-22)

### Fixed

- **The Kuzu tools kept failing after v1.1.43 on machines where the database was already damaged.** The overlapping saves fixed in v1.1.43 had left duplicate rows in the database's write-ahead log, so the database could not even be opened ("Found duplicated primary key") and `calculate_blast_radius_v2`, `analyze_activity_heatmap`, `analyze_pr_impact` and the graph persistence all failed. Because the database is only a cache of the analysed graph, CodeMaps now replaces a database that cannot be opened because it is damaged: the files are moved aside (only the latest set is kept) and a fresh database is created. A lock held by another process is never treated as damage. Verified against a copy of a real damaged database.

## v1.1.43 (2026-10-22)

### Fixed

- **Switching to "Dependencies" froze the app for ~9 seconds.** The whole-project overview (200+ files, 500+ links) was laid out with network-simplex node placement; it now uses Brandes-Koepf placement with lower thoroughness for large graphs and takes about 0.3 s. A regression test fails if the layout becomes slow again.
- **The filter switches did nothing.** The Directories / Files / Functions / Classes / ADR / Edges toggles were never connected to the store. They work now.
- **The Kuzu tools (`calculate_blast_radius_v2`, `analyze_activity_heatmap`, `analyze_pr_impact`) failed with "Found duplicated primary key".** Every graph update started a new save that clears the database and re-inserts the graph, and overlapping saves collided. Saves now run one at a time and only the latest graph is written.

### Changed

- **Cleaner graph screen.** The tall filter column is replaced by a compact toolbar over the graph (mode switch + filter chips) and a "How to read the graph" popover with the legend and controls; the info card is gone, the graph uses the whole area, zoom buttons moved to the bottom-left, the node details panel opens only when a node is selected, and the one-time hint is a small toast.

## v1.1.42 (2026-10-22)

### Added

- **Claude Code hook that validates every edit.** `scripts/codemaps-validate-hook.mjs` runs after `Edit`/`Write`/`MultiEdit`, asks the running CodeMaps to validate the changed file and returns the problems (god files, clones, long/complex methods, hubs, mixed responsibilities) to Claude with a fix hint, so they are fixed in the same turn. Dependency free (plain Node), silent when all is fine, when CodeMaps is not running or when another project is open (it never switches the project), and it does not repeat the same message for 15 minutes. Enabled for this repository in `.claude/settings.json`; MCP Settings → Connection has copy buttons for the settings and the script, and `docs/CLAUDE_INTEGRATION.md` describes it.
- `validate_architecture_changes` waits until pending file changes are indexed before it validates (`oracle.whenIdle()`).

### Fixed

- **Files created right after a project was analysed were never indexed.** `analyzeProject` returned before the file watcher finished its initial scan, and chokidar ignores everything that happens before it is ready, so an agent that opened a project and immediately created or edited files saw a stale graph. Starting the watcher now waits for it to be ready (with a 15 s cap), and a watcher error is logged.

## v1.1.41 (2026-10-22)

### Changed

- **`get_blast_radius` is now a readable summary.** Instead of a raw node-level dump it returns counts, the affected files grouped by area (with how many are tests), the direct dependents first and only the nearest indirect ones, with `limit` and `detail: "full"` for the raw result. For `GraphData` the response shrank from ~37,000 to ~2,500 characters.
- **`get_node_dependencies` works for file nodes.** A file node used to report nothing because imports point at `file#symbol`. It now covers the symbols inside the file and lists every neighbouring file once with a link count (`dependentFiles`, `dependencyFiles`); raw links are limited by `limit` and report their totals.
- **`search_graph` ranks results.** Exact name, then prefix, then substring, then path; symbols that merely share their file's path no longer flood the list.

### Added

- Tests for the blast-radius summary (areas, test files, depth, caps), file-node dependencies and search ranking; `mcp:smoke` checks the new response fields.

## v1.1.40 (2026-10-22)

### Fixed

- **The graph lost dependents behind barrel files.** `import { X } from '../store'` where `store.ts` re-exports `./store/types` was linked to the barrel instead of the real declaration, so `get_node_dependencies` / blast radius found 34 of 46 dependents of `GraphData`. Re-exports (`export *`, `export { a as b } from`, chained barrels, cycles) are now followed. The project cache version was bumped so existing caches are rebuilt.
- **No tool can flood an agent's context any more.** Every MCP tool result is now cut to a size budget (lists, long strings) and serialized without indentation; anything omitted is described under `_compaction`. `get_blast_radius` for a hub type went from 142,000 to ~37,000 characters.
- **A mistyped `projectPath` indexed nothing and looked like success.** It now fails with a clear message.
- The persisted UI state no longer throws unhandled errors when IndexedDB is unavailable.
- Recent projects listed the same folder several times (`D:/` vs `d:/`); entries are de-duplicated.
- The MCP port can be overridden with `CODEMAPS_MCP_PORT`, and a busy port is reported instead of crashing the instance.

### Added

- **`validate_architecture_changes` checks only what you changed.** By default it takes the files changed in the git working tree (or against `baseRef`, or an explicit `changedFiles` list) and returns only the problems in them (god files, clones, long/complex methods, hubs, mixed responsibilities), each with a fix hint. Legacy debt elsewhere no longer blocks an edit; `scope: "project"` keeps the old whole-project check.
- `get_semantic_skeleton` also returns an `outline` with the original line number of every declaration; `search_signatures` accepts `filePath` and reports the declaration `kind`.
- **GUI for newcomers:** the graph is framed automatically on open and follows the window size, selecting a node centres it, a details panel explains the selected node (path, exports, who uses it, what it depends on, hot spot warning), a legend explains colours and the red dashed border, zoom/fit buttons and a one-time controls hint were added, and the info card no longer covers the graph.
- Tests for barrel re-exports, change-scoped validation, result bounding, the viewport maths, node summaries and storage failure.

## v1.1.39 (2026-10-22)

### Fixed

- **Installed builds could not persist the graph or run Kuzu tools.** The Kuzu worker script lived inside `app.asar`, which the system Node used to start the worker cannot read, so `calculate_blast_radius_v2`, `analyze_activity_heatmap` and `analyze_pr_impact` failed with `Kuzu background worker exited with code 1`. The worker script is now unpacked and launched from `app.asar.unpacked`.
- **Stale MCP sessions after a restart.** An unknown session id now gets HTTP 404 (as the MCP spec requires) instead of 400, so clients such as `mcp-remote` re-initialize on their own instead of failing until restarted.

### Added

- Tests for the worker script path and the unknown-session response; docs describe the Node.js requirement of the Kuzu-backed tools.

## v1.1.38 (2026-10-22)

### Fixed

- `prepare_task_context`, `prepare_project_context`, `prepare_change_context`, `prepare_change_campaign` and `prepare_review_context` returned up to ~100,000 characters even with `limit: 5`, which overflowed agent context windows. Responses are now compact JSON, honour `limit` as a per-list ceiling, stay within a size budget that grows with `limit`, drop redundant graph-node fields, and replace repeated sub-trees with `$sameAs` pointers. Anything cut is described under `_compaction`. The same request now returns about 22,000 characters (-77%).

### Added

- `prepare_change_context` accepts an optional `limit`.
- Unit tests for the size budget, `limit`, de-duplication and string truncation.

## v1.1.37 (2026-10-22)

### Added

- **Claude integration**: MCP Settings → Clients now provides ready snippets for Claude Code (user scope and project `.mcp.json`) and Claude Desktop (`mcp-remote` bridge). The repository ships `.mcp.json`, `CLAUDE.md`, a `.claude/skills/codemaps-agent-autopilot` skill and `docs/CLAUDE_INTEGRATION.md`.
- Localized (EN/RU/ZH) descriptions for `analyze_decomposition`, `get_semantic_skeleton` and `validate_architecture_changes`; the agent skill now covers the new tools.
- A descriptor test that fails when an MCP tool has no localized description.

### Fixed

- `mcp:smoke` expected an outdated tool list, never closed its session after a failure (the process hung), and left four tools untested. It now covers all 21 tools and 4 resources.
- The MCP server now reports the real application version and project URL instead of a hardcoded `1.0.0` and a placeholder link.

## v1.1.30 – v1.1.36 (2026-09-16 – 2026-09-17)

### Added

- `analyze_decomposition` MCP tool and Decomposition Wizard panel (God classes, duplicate clones, oversized modules).
- `get_semantic_skeleton` and `validate_architecture_changes` MCP tools; skeleton extraction supports C++, C#, Rust, Python and Java via tree-sitter.

### Fixed

- Binary files are ignored and memory bloat is prevented during metrics calculation.
- ESM import issues with `p-limit`, Tailwind tracking utility, locale test coverage and CI formatting of test artifacts.

## v1.1.29 (2026-09-16)

### Changed

- **RU**: Масштабный архитектурный рефакторинг бэкенда. Устранены God-классы (например, `KuzuNativeProcess` и `McpSettingsModal`), снижена цикломатическая сложность, внедрен паттерн Visitor для парсинга AST. Логика работы с Git инкапсулирована в выделенный `GitService`.
- **EN**: Massive backend architectural refactoring. Eliminated God-classes (e.g., `KuzuNativeProcess` and `McpSettingsModal`), reduced cyclomatic complexity, and introduced the Visitor pattern for AST parsing. Git operations are now encapsulated in a dedicated `GitService`.
- **ZH**: 大规模后端架构重构。消除了 God-class（如 `KuzuNativeProcess` 和 `McpSettingsModal`），降低了圈复杂度，并引入了 Visitor 模式用于 AST 解析。Git 操作现已封装在专用的 `GitService` 中。

## v1.1.20 (2026-09-15)

### Fixed

- **UI Colors Restored**: Reverted the core UI color scheme back to the original Dark/Green palette (`#00ff9d`). The previous update incorrectly changed the branding to Vercel Blue.
- Kept all the layout, padding, margin, and typography improvements from the previous release.

## v1.1.19 (2026-09-15)

### Fixed

- **CI Pipeline Fix**: Resolved a formatting issue in `.github/release-body.md` that caused the GitHub Actions CI pipeline to fail during the `format:check` step.

## v1.1.18 (2026-09-15)

### Changed

- **UI/UX Enterprise Polish**: Completely redesigned the user interface to match modern Enterprise SaaS standards (Linear/Vercel style).
- **Global Styles**: Removed harsh pill-shaped borders, replaced extreme green accents with subtle Vercel Blue (`#0070f3`), and unified text typography to standard system/Inter fonts.
- **TitleBar**: Cleaned up toolbar actions, removed excessive margins and pill borders. Added a sleek project status indicator.
- **FileTree**: Increased data density, improved indentation, replaced custom noisy SVG icons with standard ones, and added clean row hover states.
- **Recent Projects**: Simplified layout, removed excessive nested borders from telemetry cards, and improved readability of project metadata.
- **FilterPanel & HUDs**: Converted to clean `surface-card` design with subtle backdrop blurs and standard checkboxes instead of massive toggles.
- **Language Switcher**: Moved to a discreet, compact segmented control at the bottom left of the sidebar.
- **Update Notification**: Redesigned to use a clean floating toast with proper typography and unified action buttons.

## v1.1.17 (2026-09-15)

### UI Hotfix: Typography, Layout, and Startup Responsiveness

- Removed the external Google Fonts import and stopped forcing the entire app into a monospace font, which fixes the distorted typography and eliminates an unnecessary renderer-time font fetch.
- Hid the left explorer panel before a project is opened, so the startup screen is no longer squeezed into a broken split layout with wasted empty space.
- Tightened the title bar spacing and simplified the visual treatment of the header to reduce the “debug build” look introduced in `v1.1.16`.
- Rebalanced the recent-projects screen with cleaner spacing, saner type sizes, and monospace reserved only for project paths instead of the whole interface.
- Reduced excessive blur and shadow intensity across modals, toasts, and cards to improve visual clarity and cut some unnecessary rendering cost.

## v1.1.16 (2026-09-15)

### UI Clarity and Interaction Polish

- Reworked the main title bar so primary actions are clearer, project state is visible at a glance, and the workspace toggle no longer blends into secondary controls.
- Redesigned the recent-projects home screen into a cleaner two-column layout with stronger hierarchy, better scanning, and a more obvious entry point into the app.
- Upgraded the filter panel with clearer layout-mode cards, active-state feedback, enabled-count visibility, and quick presets for common graph investigation scenarios.

### Modal, Toast, and Visual System Consistency

- Rebuilt the update notifications as floating toast panels with better action affordances instead of thin edge banners that were easy to miss.
- Refined the MCP settings modal styling so tabs, code blocks, and section cards follow the same visual language as the rest of the app.
- Introduced a consistent surface/button/token layer in global styles, including fixed missing CSS variables that previously made parts of the UI render inconsistently.

## v1.1.15 (2026-09-12)

### Windows Auto-Update Reliability

- Fixed the real Windows upgrade failure: the packaged app no longer ships Kuzu's `kuzu-source` tree, which pushed NSIS uninstall/rename paths past the Win32 limit during auto-update.
- Added a post-pack cleanup hook that strips Kuzu build-only artifacts from `app.asar.unpacked` while keeping the required `kuzujs.node` runtime module in place.
- Kept the installer directory picker and non-destructive uninstall behavior from `v1.1.13`, so this release focuses on the NSIS upgrade path instead of changing user-facing install semantics again.

## v1.1.14 (2026-09-12)

### Windows Auto-Update Verification

- Published the next follow-up release so an installed `v1.1.13` client can verify the Windows upgrade path against a newer tag.
- Kept the installer logic unchanged from `v1.1.13` to isolate auto-update validation from any new packaging changes.

## v1.1.13 (2026-09-12)

### Windows Installer & Auto-Update

- Re-enabled installation directory selection in the NSIS wizard instead of forcing the default per-user path.
- Stopped deleting app data during uninstall/update so the Windows upgrade path no longer tears through updater state while replacing the installed app.
- Published as a dedicated follow-up release to validate the Windows auto-update flow after the NSIS configuration fix.

## v1.1.12 (2026-09-12)

### Windows Auto-Update Verification

- Published a follow-up release specifically to validate the fixed Windows updater path from an installed `v1.1.11` client.
- Reused the stabilized updater flow from `v1.1.11` so the verification target differs only by release version and published artifacts.

## v1.1.11 (2026-09-12)

### Windows Auto-Update

- Disabled `autoInstallOnAppQuit` on Windows so a downloaded NSIS update is not kicked off implicitly during a normal quit path.
- Switched explicit update installation to a direct `quitAndInstall()` request, which lets the existing `before-quit` shutdown flow run once instead of racing manual shutdown against the updater's own quit cycle.
- Added a Windows-specific updater test to prevent silent install-on-quit from regressing in future releases.

### Verification

- Verified locally: updater unit tests, ESLint, and full TypeScript typecheck after the Windows updater fix.

## v1.1.10 (2026-09-12)

### 🚀 Release Pipeline

- GitHub Release names are now derived directly from the pushed tag, so the workflow no longer reuses a stale hard-coded version string.
- Release notes are generated from `.github/release-body.md` with automatic `{{VERSION}}` substitution before publishing.
- The trilingual release-notes format (RU / EN / ZH) is now part of the documented release procedure instead of an informal convention.

### 🔒 Security & Reliability

- The dependency graph is now audit-clean locally (`0 high / 0 moderate / 0 low`).
- MCP composite tool contracts were aligned with the smoke-test expectations (`changeContext`, `reviewContext`).
- MCP resources now return raw JSON instead of fenced markdown, which makes resource parsing deterministic.

### 🧪 Verification

- Verified locally: formatting, lint, typecheck, test suite, renderer build, electron build, and the full MCP smoke flow.

## v1.1.9 (2026-08-08)

### 🐛 Fixes

- **Restored parsing for every non-TypeScript language.** `web-tree-sitter` 0.26 cannot load the prebuilt `tree-sitter-wasms` grammars, so every file outside the TypeScript semantic path silently produced an empty parse result. The runtime is pinned to the 0.25 line and covered by a grammar-loading test.
- Repaired the C#, PHP, Kotlin, Swift and Zig queries, which were written against newer grammars and failed to compile.
- Fixed the activity heatmap, which passed `git` twice on its own command line and read the commit author out of the wrong field.
- Completed the Chinese translation (45 missing keys) and added the previously inline `ErrorBoundary` strings to all catalogues.

### 🔒 Security

- PR impact analysis no longer builds `git` commands as shell strings from caller-supplied branch names.
- MCP CORS is restricted to loopback origins; the renderer runs sandboxed with navigation, popups and `<webview>` blocked.
- Project paths and branch names arriving over IPC are validated, custom architecture-rule regexes are checked with `safe-regex`, and content scanners honour the parser's file size cap.

### 🧹 Maintenance

- CI now runs lint, formatting, tests and typecheck; the suite passes from a clean clone.
- Windows CI keeps LF line endings for Prettier and invokes the TypeScript compiler without `npx`.
- Packaging no longer OOMs: a postinstall patch removes the self-dependency shipped by `tree-sitter-wasms`, which sent electron-builder 26's module collector into an unbounded cycle.
- Removed dead services, stray root files, the duplicate `package-lock.json` and unused dependencies.

---

## v1.0.2 (2026-04-26)

### 🌍 Multilingual Support (i18n)

- **English (EN)** — Full UI translation
- **Русский (RU)** — Полный перевод интерфейса
- **简体中文 (ZH)** — 完整的中文界面翻译
- Language switcher component with flag icons

### 🎨 Code Quality

- **ESLint** configuration with TypeScript and React rules
- **Prettier** formatting (2 spaces, single quotes, trailing commas)
- `npm run lint` / `npm run lint:fix` / `npm run format` scripts

### 🔄 Auto-Updater

- Automatic update checks on app startup
- Background download with progress bar
- "Restart now" / "Later" notification banner
- Periodic checks every 4 hours
- Powered by `electron-updater` + GitHub Releases

### 📂 Drag & Drop

- Drop project folder onto app window to open
- Visual overlay with animated feedback
- "Open Project" button in title bar

### 📋 Recent Projects

- List of last 10 opened projects
- Smart date formatting ("2h ago", "3d ago")
- Click to reopen
- "Clear history" button
- Persists across app restarts

### 🔒 Security

- Fixed false positives from build directories in Security Scanner

### 🛠 CI/CD

- Auto-update version from git tag (no more hardcoding)
- Delete old release assets before publishing (prevents mixing versions)
- Cross-platform smoke tests (15 MCP tools + 4 resources)

---

## v1.0.1 (2026-04-25)

### Fixes

- `package-lock.json` compatibility for `npm ci`
- Cross-platform MCP smoke tests
- Linux maintainer email for DEB/RPM packages

### Performance

- React.lazy code splitting (-88% initial bundle size)

---

## v1.0.0 (2026-04-25)

### Initial Release

- Electron app with Vite + React + TypeScript
- Code dependency graph visualization
- MCP server with 15 tools and 4 resources
- Linux (AppImage, DEB, RPM) and Windows (NSIS, portable) builds
- GitHub Actions CI/CD
