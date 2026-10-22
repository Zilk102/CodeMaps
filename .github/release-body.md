# Release v{{VERSION}} 🚀

### 🇷🇺 Изменения (RU)

- **Компактные ответы `prepare_*`**: `prepare_task_context`, `prepare_project_context`, `prepare_change_context`, `prepare_change_campaign` и `prepare_review_context` возвращали до ~100 000 символов даже при `limit: 5` и переполняли контекст агента. Теперь ответ — компактный JSON, `limit` ограничивает длину каждого списка, общий объём укладывается в бюджет, растущий вместе с `limit`, лишние поля узлов графа убраны, а повторяющиеся блоки заменены ссылками `$sameAs`. Всё, что было сокращено, описано в поле `_compaction`. Тот же запрос теперь занимает около 22 000 символов (на 77% меньше).
- **`limit` для `prepare_change_context`**: новый необязательный параметр, как у остальных инструментов.
- **Тесты размера**: проверяют бюджет, работу `limit`, дедупликацию и усечение строк.
- Навык агента и руководство по интеграции с Claude объясняют, что делать, если ответ был сокращён.

### 🇬🇧 Changes (EN)

- **Compact `prepare_*` responses**: `prepare_task_context`, `prepare_project_context`, `prepare_change_context`, `prepare_change_campaign` and `prepare_review_context` returned up to ~100,000 characters even with `limit: 5`, overflowing agent context windows. Responses are now compact JSON, `limit` caps every list, the total stays within a size budget that grows with `limit`, redundant graph-node fields are dropped, and repeated blocks become `$sameAs` pointers. Anything cut is described under `_compaction`. The same request now takes about 22,000 characters (77% smaller).
- **`limit` for `prepare_change_context`**: a new optional parameter, consistent with the other tools.
- **Size tests**: cover the budget, `limit`, de-duplication and string truncation.
- The agent skill and the Claude integration guide explain what to do when a response was trimmed.

### 🇨🇳 变更 (ZH)

- **精简 `prepare_*` 响应**：`prepare_task_context`、`prepare_project_context`、`prepare_change_context`、`prepare_change_campaign` 和 `prepare_review_context` 即使设置 `limit: 5` 也会返回多达约 10 万字符，导致代理上下文溢出。现在响应为紧凑 JSON，`limit` 限制每个列表的长度，总大小控制在随 `limit` 增长的预算内，去除了图节点中的冗余字段，并用 `$sameAs` 指针替换重复的块。被截断的内容会在 `_compaction` 字段中说明。同一请求现在约为 2.2 万字符（减少 77%）。
- **`prepare_change_context` 新增 `limit`**：与其他工具一致的可选参数。
- **大小测试**：覆盖预算、`limit`、去重和字符串截断。
- 代理技能和 Claude 集成指南说明了响应被截断时该怎么做。
