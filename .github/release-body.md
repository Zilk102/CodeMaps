# Release v1.1.9 🚀 — Parsing Restoration & Hardening

## 🇷🇺 Русская версия

### Обновление «Восстановление парсинга и укрепление»

В этом релизе мы устранили критический сбой мультиязычного анализа: после обновления `web-tree-sitter` до 0.26 все языки кроме TypeScript молча отдавали пустой результат. Восстановлены грамматики и запросы, усилены безопасность Electron/MCP/IPC и доведена до ума инфраструктура CI и локализации.

**Что нового:**

- **🌳 Восстановление polyglot-парсинга:** `web-tree-sitter` зафиксирован на линии 0.25 — совместимой с готовыми WASM-грамматиками `tree-sitter-wasms`. Добавлен тест загрузки грамматик, чтобы регрессия больше не прошла незамеченной.
- **🔧 Починка запросов языков:** Исправлены tree-sitter queries для **C#, PHP, Kotlin, Swift и Zig**, которые были написаны под более новые грамматики и не компилировались.
- **🔒 Безопасность:**
  - PR Impact Analyzer больше не собирает `git`-команды через shell-строки из имён веток — только argv и валидация ревизий.
  - MCP CORS ограничен loopback-оригинами; окно Electron работает в sandbox с блокировкой навигации, popups и `<webview>`.
  - Валидация путей проекта и имён веток по IPC; пользовательские regex архитектурных правил проверяются через `safe-regex`; сканеры соблюдают лимит размера файла парсера.
- **📊 Activity heatmap:** Исправлена двойная передача `git` в argv и чтение автора коммита из неверного поля.
- **🌍 Локализация и a11y:** Дополнен китайский каталог (десятки недостающих ключей), строки `ErrorBoundary` вынесены во все языки; улучшена доступность элементов управления окном и MCP-диалога.
- **🧪 CI и качество:** На каждый PR гоняются lint, Prettier, typecheck и тесты; Windows-сборки стабилизированы (LF line endings, вызов `tsc` без `npx`); удалён мёртвый код, лишние зависимости и дублирующий `package-lock.json`.

---

## 🇺🇸 English Version

### Parsing Restoration & Hardening

This release fixes a critical multi-language analysis outage: after `web-tree-sitter` 0.26, every language outside the TypeScript path silently returned empty parse results. Grammars and queries are restored, Electron/MCP/IPC hardening is tightened, and CI plus localization are brought up to date.

**Key Highlights:**

- **🌳 Polyglot parsing restored:** `web-tree-sitter` is pinned to the 0.25 line, which loads the prebuilt `tree-sitter-wasms` grammars correctly. A grammar-loading test guards against regressions.
- **🔧 Language query repairs:** Tree-sitter queries for **C#, PHP, Kotlin, Swift, and Zig** — written against newer grammars — now compile and extract symbols again.
- **🔒 Security hardening:**
  - PR Impact Analyzer no longer builds `git` commands as shell strings from caller-supplied branch names; it uses argv plus revision validation.
  - MCP CORS is restricted to loopback origins; the Electron renderer runs sandboxed with navigation, popups, and `<webview>` blocked.
  - Project paths and branch names over IPC are validated; custom architecture-rule regexes are checked with `safe-regex`; content scanners honour the parser file-size cap.
- **📊 Activity heatmap:** Fixed duplicate `git` on the command line and reading the commit author from the wrong field.
- **🌍 Localization & a11y:** Completed the Chinese catalogue (dozens of missing keys), moved `ErrorBoundary` strings into all locales, and improved accessibility for window controls and the MCP dialog.
- **🧪 CI & hygiene:** Every PR runs lint, Prettier, typecheck, and tests; Windows CI is stabilized (LF endings, `tsc` without `npx`); dead services, unused dependencies, and the duplicate `package-lock.json` are gone.

---

## 🇨🇳 中文版本

### “解析恢复与加固” 更新

本版本修复了关键的多语言分析故障：升级到 `web-tree-sitter` 0.26 后，除 TypeScript 外的所有语言都会静默返回空解析结果。现已恢复语法与查询，强化 Electron/MCP/IPC 安全性，并完善 CI 与本地化。

**主要更新：**

- **🌳 多语言解析恢复：** 将 `web-tree-sitter` 固定在 0.25 系列，以正确加载预构建的 `tree-sitter-wasms` 语法，并新增语法加载测试防止回归。
- **🔧 语言查询修复：** 修复了面向较新语法编写、无法编译的 **C#、PHP、Kotlin、Swift、Zig** tree-sitter 查询。
- **🔒 安全加固：**
  - PR 影响分析不再用调用方提供的分支名拼接 shell 字符串执行 `git`，改为 argv + 修订校验。
  - MCP CORS 仅允许 loopback 来源；Electron 渲染进程启用 sandbox，并阻止导航、弹窗与 `<webview>`。
  - 校验 IPC 传入的项目路径与分支名；架构规则自定义正则经 `safe-regex` 检查；扫描器遵守解析器文件大小上限。
- **📊 活动热力图：** 修复命令行重复传入 `git`，以及从错误字段读取提交作者的问题。
- **🌍 本地化与无障碍：** 补全中文词条（数十个缺失键），将 `ErrorBoundary` 文案纳入全部语言目录，并改进窗口控件与 MCP 对话框的可访问性。
- **🧪 CI 与工程卫生：** 每个 PR 运行 lint、Prettier、typecheck 与测试；稳定 Windows CI（LF 换行、不经 `npx` 调用 `tsc`）；移除死代码、无用依赖及重复的 `package-lock.json`。
