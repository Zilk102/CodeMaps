# CodeMaps Changelog

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
