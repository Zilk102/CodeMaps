# CodeMaps Changelog

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
