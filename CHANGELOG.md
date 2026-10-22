# CodeMaps Changelog

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
