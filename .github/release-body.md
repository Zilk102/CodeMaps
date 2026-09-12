# Release v{{VERSION}} 🚀

## 🇷🇺 Русская версия

### Надёжность релизного контура, MCP и сборок

Этот релиз доводит релизный контур и инфраструктуру качества до предсказуемого состояния: имя GitHub Release теперь берётся прямо из git-тега, тело релиза генерируется из шаблона с автоматической подстановкой версии, а сами release notes сохраняют обязательную трёхъязычную структуру.

**Что нового:**

- **🏷 Релизы без version-хардкода:** workflow больше не содержит зашитого имени релиза от старой версии; имя релиза теперь берётся из `github.ref_name`.
- **📝 Трёхъязычные release notes как шаблон:** `.github/release-body.md` теперь работает как шаблон с `{{VERSION}}`, а перед публикацией workflow генерирует итоговое тело релиза автоматически.
- **🔒 Чистый dependency graph:** локальный `yarn audit` доведён до `0 high / 0 moderate / 0 low`.
- **🧩 MCP-контракты стабилизированы:** composite tools отдают ожидаемые поля (`changeContext`, `reviewContext`), а resources возвращают чистый JSON вместо fenced markdown.
- **🧪 Полная проверка контура:** локально подтверждены `format:check`, `lint`, `typecheck`, `test`, сборки `renderer/electron` и полный `mcp:smoke`.

---

## 🇺🇸 English Version

### Release Pipeline, MCP, and Build Reliability

This release finishes the release pipeline cleanup and makes it deterministic: the GitHub Release name now comes directly from the pushed git tag, the release body is generated from a template with automatic version substitution, and the mandatory three-language release notes format is preserved.

**Key Highlights:**

- **🏷 No version hardcode in release names:** the workflow no longer bakes an old release version into the GitHub Release title; it uses `github.ref_name`.
- **📝 Three-language release notes as a template:** `.github/release-body.md` is now treated as a template with `{{VERSION}}`, and the workflow generates the final release body before publishing.
- **🔒 Clean dependency graph:** local `yarn audit` is down to `0 high / 0 moderate / 0 low`.
- **🧩 MCP contracts stabilized:** composite tools now return the expected keys (`changeContext`, `reviewContext`), and resources return raw JSON instead of fenced markdown.
- **🧪 End-to-end verification:** `format:check`, `lint`, `typecheck`, `test`, renderer/electron builds, and the full `mcp:smoke` flow were validated locally.

---

## 🇨🇳 中文版本

### 发布流程、MCP 与构建稳定性

本版本将发布流程整理为可预测、可复用的状态：GitHub Release 名称直接取自推送的 git tag，发布说明正文由模板自动注入版本号生成，并继续保持必须的三语言结构。

**主要更新：**

- **🏷 发布名称不再硬编码旧版本：** workflow 不再把旧版本号写死在 GitHub Release 标题中，而是直接使用 `github.ref_name`。
- **📝 三语言发布说明模板化：** `.github/release-body.md` 现在作为带有 `{{VERSION}}` 占位符的模板使用，workflow 会在发布前生成最终正文。
- **🔒 依赖图已清理干净：** 本地 `yarn audit` 已降为 `0 high / 0 moderate / 0 low`。
- **🧩 MCP 契约已稳定：** composite tools 返回预期字段（`changeContext`、`reviewContext`），resources 返回纯 JSON，而不是 fenced markdown。
- **🧪 端到端验证完成：** 已本地验证 `format:check`、`lint`、`typecheck`、`test`、renderer/electron 构建以及完整 `mcp:smoke`。
