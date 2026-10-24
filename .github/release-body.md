# Release v{{VERSION}} 🚀

### 🇷🇺 Изменения (RU)

- **Автономный гейт `codemaps-guard` для CI любого проекта.** Те же проверки, что у MCP-инструментов, но без приложения, Electron, Kuzu и сети: граф строится в памяти, `check` падает только на новых или ухудшившихся находках (в режиме `ratchet`), а также если `.codemaps/baseline.json` вырос по сравнению с базовой веткой. Форматы `text`, `github` (аннотации в pull request) и `json`; `--base <ref>` проверяет только изменённые файлы. На этом репозитории (610 файлов) работает около 3 секунд.
- **`setup_project` сам прописывает гейт в CI.** Для GitHub создаёт `.github/workflows/codemaps-guard.yml` (минимальные права, загрузка закреплённого релизного архива и проверка sha256), для GitLab и остальных `.codemaps/ci/gitlab-ci.yml` и `guard.sh`. Свои CI-файлы пользователя не трогаются. Архив `codemaps-guard-<версия>.tgz` с контрольной суммой публикуется вместе с каждым релизом, публикации в npm не требуется. Подробнее в `docs/CI_GUARD.md`.
- **Документация и дубли теперь блокируют.** Новые клоны и отсутствие документации в изменённых файлах считаются блокирующими находками в `validate_architecture_changes` и в гейте (в режиме `ratchet` только свежие). Это относится и к hook, который агент получает от `setup_project`.
- Тесты: 838 -> 880.

### 🇬🇧 Changes (EN)

- **A standalone `codemaps-guard` gate for the CI of any project.** The same checks as the MCP tools, without the app, Electron, Kuzu or a network: the graph is built in memory, `check` fails only on new or worsened findings (in `ratchet` mode) and when `.codemaps/baseline.json` grew compared with the base branch. Formats `text`, `github` (pull request annotations) and `json`; `--base <ref>` checks only the changed files. It takes about 3 seconds on this repository (610 files).
- **`setup_project` wires the gate into CI by itself.** For GitHub it writes `.github/workflows/codemaps-guard.yml` (minimal permissions, a pinned release archive and a sha256 check), for GitLab and others `.codemaps/ci/gitlab-ci.yml` and `guard.sh`. The user's own CI files are never touched. The archive `codemaps-guard-<version>.tgz` with its checksum is published with every release, no npm publishing needed. See `docs/CI_GUARD.md`.
- **Missing documentation and duplicates now block.** New clones and missing documentation in changed files are blocking findings in `validate_architecture_changes` and in the gate (in `ratchet` mode only fresh ones). The hook that `setup_project` gives the agent follows the same rule.
- Tests: 838 -> 880.

### 🇨🇳 变更 (ZH)

- **适用于任何项目 CI 的独立 `codemaps-guard` 守门工具。** 与 MCP 工具相同的检查，但不需要应用、Electron、Kuzu 或网络：图在内存中构建，`check` 仅在出现新增或恶化的问题（`ratchet` 模式）以及 `.codemaps/baseline.json` 相比基准分支变大时失败。支持 `text`、`github`（pull request 注解）和 `json` 格式；`--base <ref>` 只检查改动的文件。在本仓库（610 个文件）上约需 3 秒。
- **`setup_project` 自动把守门工具接入 CI。** 对 GitHub 写入 `.github/workflows/codemaps-guard.yml`（最小权限、固定版本的发布压缩包和 sha256 校验），对 GitLab 及其他系统写入 `.codemaps/ci/gitlab-ci.yml` 和 `guard.sh`。用户自己的 CI 文件不会被改动。每个版本都会发布 `codemaps-guard-<版本>.tgz` 及其校验和，无需发布到 npm。详见 `docs/CI_GUARD.md`。
- **缺少文档和重复代码现在会阻止通过。** 改动文件中新增的克隆和缺失的文档，在 `validate_architecture_changes` 和守门工具中都是阻断性问题（`ratchet` 模式下仅限新增的）。`setup_project` 提供给智能体的 hook 遵循同样的规则。
- 测试：838 -> 880。
