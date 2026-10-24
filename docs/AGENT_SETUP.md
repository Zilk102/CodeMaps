# Zero-config agent setup

You connect CodeMaps to your agent over MCP and do nothing else. The server hands every client a short `instructions` text on connect that says: _first call `setup_project`_. That tool configures the current project for the agent by itself.

## What `setup_project` does

1. **Detects** the languages, package manager, test / lint / build commands (from `package.json` scripts, `Makefile`, `pyproject.toml`, `Cargo.toml`, `go.mod`, `pom.xml`, Gradle, .NET, ...) and the CI provider.
2. **Detects the agents**: those whose files already exist in the project (`CLAUDE.md` / `.claude`, `.cursor`, `.github/copilot-instructions.md`, `GEMINI.md` / `.gemini`, `.windsurf`, `.clinerules`, `.codex`) plus the calling client, read from the MCP `clientInfo.name`. An unknown client gets `AGENTS.md` only.
3. **Writes** the files below, only inside the project root.
4. **Freezes the legacy**: creates `.codemaps/config.json` (ratchet mode) and `.codemaps/baseline.json`, so an old codebase starts green and only new or worsened findings are reported (see [PROJECT_CONFIG.md](PROJECT_CONFIG.md)).
5. **Wires CI**: a GitHub Actions workflow or portable scripts that run the headless guard on pull requests (see [CI wiring](#ci-wiring)).
6. **Reports** `written`, `updated`, `unchanged` and `skipped` files (with reasons), `warnings`, `nextSteps`, the baseline summary and the CI wiring.

Calling it again is cheap and changes nothing (`upToDate: true`). Concurrent calls for one project are queued. It takes `projectPath` (default: the open project), `agents` (explicit list instead of detection), `apply: false` (dry run: returns `wouldWrite` and writes nothing) and `force` (rewrite CodeMaps-owned sections even when their version is current).

## Files written

| File                                                                      | Agent                | How it is written                                                       |
| ------------------------------------------------------------------------- | -------------------- | ----------------------------------------------------------------------- |
| `AGENTS.md`                                                               | all (Codex, unknown) | A block between `<!-- codemaps:start vX.Y.Z -->` and `codemaps:end`     |
| `CLAUDE.md`                                                               | Claude Code          | A block that imports `@AGENTS.md`                                       |
| `.claude/skills/codemaps-agent-autopilot/SKILL.md`                        | Claude Code          | Owned file with a `codemaps:file vX.Y.Z` marker                         |
| `.claude/settings.json`                                                   | Claude Code          | JSON merge: adds one `PostToolUse` hook, keeps every other key and hook |
| `.codemaps/hooks/validate.mjs`                                            | Claude Code          | Owned file: the dependency-free hook script                             |
| `.cursor/rules/codemaps.mdc`                                              | Cursor               | Owned file, `alwaysApply: true`                                         |
| `.github/copilot-instructions.md`                                         | GitHub Copilot       | A block                                                                 |
| `GEMINI.md`                                                               | Gemini CLI           | A block                                                                 |
| `.windsurf/rules/codemaps.md`                                             | Windsurf             | Owned file, `trigger: always_on`                                        |
| `.clinerules/codemaps.md` (or a block in `.clinerules` if that is a file) | Cline                | Owned file or a block                                                   |
| `.codemaps/config.json`                                                   | all                  | Created once with the default ratchet settings, never overwritten       |
| `.codemaps/baseline.json`                                                 | all                  | Created once; afterwards it may only shrink                             |
| `.github/workflows/codemaps-guard.yml`                                    | GitHub Actions       | Owned file: runs `codemaps-guard` on pull requests (see below)          |
| `.codemaps/ci/gitlab-ci.yml`, `.codemaps/ci/guard.sh`                     | GitLab CI, any other | Owned files: an `include:` snippet and a portable script (see below)    |
| `.codemaps/.gitignore`                                                    | all                  | Owned file: ignores the `graph.db` cache                                |
| `.codemaps/setup.json`                                                    | all                  | Record of the version, agents and a SHA-256 of what CodeMaps wrote      |

Commit all of it except the `graph.db` cache.

## CI wiring

The same rules the agent follows are enforced in CI by `codemaps-guard`, a standalone bundle that needs only Node.js (see [CI_GUARD.md](CI_GUARD.md)). `setup_project` writes its wiring and reports it in `ciSuggestion` (`provider`, `files`, `text`) and in `nextSteps`:

- **GitHub Actions** (workflows exist; or no CI is detected and the repository has a `.github` folder or a GitHub remote): `.github/workflows/codemaps-guard.yml`, a CodeMaps-owned file with the version marker. It runs on `pull_request` with `contents: read`, checks out the full history, downloads `codemaps-guard-<version>.tgz` pinned to the running CodeMaps version (`releases/latest/download/codemaps-guard.tgz` when that version is not a release), verifies its `.sha256` and runs `node guard/guard.mjs check --base origin/${{ github.base_ref }} --format github`. It is refreshed only when its marker is older; your own workflows are never touched.
- **GitLab CI and everything else** (also a project with no recognizable CI): `.codemaps/ci/gitlab-ci.yml` and `.codemaps/ci/guard.sh`. CodeMaps does not edit your CI files, so `nextSteps` tells you to add `include: - local: .codemaps/ci/gitlab-ci.yml` to `.gitlab-ci.yml`, or to call `sh .codemaps/ci/guard.sh origin/<target-branch>` from a merge request job of any other CI.

Keep your own build and test jobs; the guard adds the architecture, documentation and duplication rules and fails when `.codemaps/baseline.json` grows.

## Safety rules

- **Inside the project only.** A path with `..`, an absolute path, or a symbolic link that leads outside the project is rejected, and the file is reported as skipped.
- **Never overwrites your content.** Shared files change only between the `codemaps:start` and `codemaps:end` markers; a missing file is created, an existing one gets the block appended. A file that CodeMaps owns but you created yourself (no `codemaps:file` marker) is left alone.
- **JSON is merged.** Invalid JSON (including comments) is skipped with a warning and never rewritten.
- **Versions.** A block or file is refreshed only when its marker is older than the running CodeMaps. A newer marker is left alone; edit inside a current block and nothing happens until `force`.
- **Dry run first** if you want to see the plan: `setup_project` with `apply: false`.

## Removing it

Delete the block between `<!-- codemaps:start ... -->` and `<!-- codemaps:end -->` in `AGENTS.md`, `CLAUDE.md`, `GEMINI.md` and `.github/copilot-instructions.md` (the file itself if nothing else is in it), then delete:

```text
.claude/skills/codemaps-agent-autopilot/
.cursor/rules/codemaps.mdc
.github/workflows/codemaps-guard.yml
.windsurf/rules/codemaps.md
.clinerules/codemaps.md
.codemaps/            (config, baseline, hook, record; keep it if you want the ratchet)
```

Finally remove the `PostToolUse` entry whose command contains `.codemaps/hooks/validate.mjs` from `.claude/settings.json`. Setting the environment variable `CODEMAPS_HOOK_DISABLED=1` turns the hook off without deleting anything.

## For maintainers

The skill and hook that are written into projects are generated copies of their single sources: `.claude/skills/codemaps-agent-autopilot/SKILL.md` and `scripts/codemaps-validate-hook.mjs`. Change the source, run `npm run sync:templates` and `npm run format`; a test fails when the copies in `electron/setup/templates/` or in the in-app skill template drift. The server `instructions` text is `electron/mcp/serverInstructions.ts`; a test checks its length and that every tool it names is registered.
