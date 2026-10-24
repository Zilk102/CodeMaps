<div align="center">
  <img src="assets/icon.png" alt="CodeMaps" width="96" height="96" />

# CodeMaps

**A living blueprint of your code: an interactive dependency map for people and an MCP server that gives AI agents the architectural context to write clean code.**

[![Release](https://img.shields.io/github/v/release/Zilk102/CodeMaps?style=flat-square&color=00ff9d)](https://github.com/Zilk102/CodeMaps/releases/latest)
[![CI](https://img.shields.io/github/actions/workflow/status/Zilk102/CodeMaps/ci.yml?branch=main&style=flat-square&label=CI)](https://github.com/Zilk102/CodeMaps/actions/workflows/ci.yml)
[![License](https://img.shields.io/github/license/Zilk102/CodeMaps?style=flat-square)](LICENSE)
![Platforms](https://img.shields.io/badge/platforms-Windows%20%7C%20Linux-informational?style=flat-square)

[🇺🇸 English](README.md) · [🇷🇺 Русский](README.ru.md) · [🇨🇳 简体中文](README.zh-CN.md) · [🇪🇸 Español](README.es.md) · [🇯🇵 日本語](README.ja.md) · [🇰🇷 한국어](README.ko.md)

</div>

CodeMaps indexes a project into a graph of directories, files, classes and functions and the links between them. It then serves that graph two ways:

- **To people**, as an interactive map: a new developer sees what is connected to what, and what depends on a file before touching it.
- **To AI agents** (Claude Code, Claude Desktop, Cursor, Trae and any other MCP client), as 24 bounded tools that answer questions like _what breaks if I change this?_, _is there already a helper for this?_ and _did my edit add a god file or a clone?_ without reading the whole repository. `check_documentation` also tells them which public symbols and files still need a comment.

Everything runs locally. Source code never leaves your machine.

![The project as a map](screenshots/graph-hierarchy.png)

## Why

An agent that only has grep and file reads wanders. CodeMaps gives it a project map, the impact of a change, and a check for its own edits, in small answers that fit a context window.

|                      | What you get                                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **Orientation**      | Entry points, layers and boundaries of an unfamiliar project in one call (`prepare_project_context`).                    |
| **Safe changes**     | Direct and indirect dependents grouped by area before an edit (`get_blast_radius`), including barrel re-exports.         |
| **Clean code**       | `validate_architecture_changes` checks only the files you changed for god files, clones, long and complex methods, hubs. |
| **Cheap reading**    | A file's skeleton without function bodies, with line numbers (`get_semantic_skeleton`).                                  |
| **Legacy refactors** | Decomposition guidance for oversized modules and God classes (`analyze_decomposition`).                                  |
| **Bounded output**   | Every response is capped; anything cut is reported under `_compaction`, so one call cannot flood an agent's context.     |

## Screenshots

Select a file and see its functions and what it depends on:

![A selected file](screenshots/graph-selection.png)

The MCP server and its tools, ready for any agent:

![MCP tools](screenshots/mcp-tools.png)

## Install

Download the latest build from [Releases](https://github.com/Zilk102/CodeMaps/releases/latest):

- **Windows**: installer (`-setup-x64.exe`), portable (`-win-x64.exe`) or `.zip`
- **Linux**: `.AppImage`, `.deb`, `.rpm` or `.tar.gz`

macOS builds are not published yet. Node.js 22+ on `PATH` is needed only for the three tools backed by the Kuzu graph database (`calculate_blast_radius_v2`, `analyze_activity_heatmap`, `analyze_pr_impact`); everything else works without it.

CodeMaps keeps a derived cache (`graph.db`) in a `.codemaps/` folder inside each analysed project. `setup_project` adds a `.codemaps/.gitignore` for it; the other files there (`config.json`, `baseline.json`) are meant to be committed.

## Connect an AI agent

Start CodeMaps, then:

```bash
# Claude Code, for every project
claude mcp add --transport http --scope user codemaps http://127.0.0.1:3005/mcp
```

- **Claude Desktop** connects through the `mcp-remote` bridge, **Cursor** and **Trae** by URL. Ready snippets with a Copy button are in the app under **MCP Settings → Connection**.
- **That is all you configure.** The server tells the agent to call `setup_project` first. It detects the stack and the agent, writes `AGENTS.md`, the agent rules, the `codemaps-agent-autopilot` skill and an edit-validation hook, and freezes the findings an old codebase already has in `.codemaps/baseline.json`, so only new problems are reported. Re-running it changes nothing. See [docs/AGENT_SETUP.md](docs/AGENT_SETUP.md) for every file it writes and how to remove them.

Full guide: [docs/CLAUDE_INTEGRATION.md](docs/CLAUDE_INTEGRATION.md).

### CI guard: the same rules without the app

`setup_project` also writes the CI wiring (`.github/workflows/codemaps-guard.yml`, or a GitLab snippet and a portable script under `.codemaps/ci/`). Pull requests then run `codemaps-guard`, a standalone Node bundle with no app, no Electron and no network access, that fails on new or worsened findings and on a baseline that grew. Try it by hand with the `codemaps-guard.tgz` release asset:

```bash
tar -xzf codemaps-guard.tgz && node guard/guard.mjs check --base origin/main
```

See [docs/CI_GUARD.md](docs/CI_GUARD.md).

## Supported languages

| Support              | Languages                                            | What you get                                                                                                                                                                                    |
| -------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Semantic**         | TypeScript, TSX, JavaScript                          | Imports resolved by the TypeScript compiler, barrel re-exports                                                                                                                                  |
| **Project-resolved** | Go, Python, Java, Rust, C/C++, C#, Kotlin, PHP, Ruby | Imports resolved to files and symbols (go.mod, Cargo workspaces, packages, `__init__`, `#include` paths, namespaces, PSR-4, `require`), same-package references, methods named after their type |
| **Structural**       | Zig, Swift, Bash (tree-sitter)                       | Declarations and imports; no type-aware resolution                                                                                                                                              |
| **Limited**          | HTML, CSS, Vue                                       | Files and basic structure                                                                                                                                                                       |
| **Metadata**         | Markdown (ADR), YAML                                 | Architecture decision records linked to the code                                                                                                                                                |

Cross-file dependency accuracy is highest for the semantic tier; for the others treat links as a strong hint and confirm with a search.

## Documentation

| Document                                                 | About                                                  |
| -------------------------------------------------------- | ------------------------------------------------------ |
| [docs/CLAUDE_INTEGRATION.md](docs/CLAUDE_INTEGRATION.md) | Claude Code and Desktop setup, skill, validation hook  |
| [docs/AGENT_SETUP.md](docs/AGENT_SETUP.md)               | What `setup_project` writes for each agent and CI      |
| [docs/CI_GUARD.md](docs/CI_GUARD.md)                     | The headless `codemaps-guard` for any project's CI     |
| [docs/MCP_TOOLS.md](docs/MCP_TOOLS.md)                   | Reference for all 24 tools and 4 resources (generated) |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)             | How CodeMaps is built and why                          |
| [CONTRIBUTING.md](CONTRIBUTING.md)                       | Development setup, checks, release process             |
| [CHANGELOG.md](CHANGELOG.md)                             | What changed in each version                           |

## Development

```bash
git clone https://github.com/Zilk102/CodeMaps.git
cd CodeMaps
yarn install        # yarn is the supported package manager
npm run dev         # Vite + Electron
npm run verify      # everything CI runs: lint, format, typecheck, tests, builds
npm run mcp:smoke   # exercise every MCP tool against a running instance
```

The stack is Electron, React, TypeScript and Vite; the graph layout is computed with elkjs and parsing uses tree-sitter and the TypeScript compiler. Requires Node.js 22+.

## Contributing, security, license

Please read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request, and [SECURITY.md](SECURITY.md) to report a vulnerability. Released under the [MIT License](LICENSE).
