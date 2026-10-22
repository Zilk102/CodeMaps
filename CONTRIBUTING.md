# Contributing to CodeMaps

[English](CONTRIBUTING.md) · [Русский](CONTRIBUTING.ru.md)

Thank you for helping! Fixing a typo, adding a language, a new analyzer or an MCP tool: all of it is welcome.

## Getting started

1. Fork the repository and clone your fork.
2. Install dependencies with `yarn install`. The project uses **yarn**; `package-lock.json` is not supported. Node.js 22+ is required.
3. Create a branch: `git checkout -b feature/short-name` (or `fix/...`).
4. Run the app with `npm run dev` (Vite + Electron).

A map of the code base is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Before you push

Run everything CI runs, **in a fresh clone** if you can:

```bash
npm run verify   # lint, format check, typecheck, tests, renderer and electron builds
```

Why a fresh clone: files that are untracked or git-ignored (for example a new `src/types/*.d.ts`) and Windows-only path assumptions pass on your machine and fail on CI, which runs on Linux and Windows.

Useful individual commands:

| Command             | What it does                                              |
| ------------------- | --------------------------------------------------------- |
| `npm run format`    | Prettier, write                                           |
| `npm run lint:fix`  | ESLint, fix                                               |
| `npm test`          | Vitest                                                    |
| `npm run mcp:smoke` | Calls every MCP tool against a running CodeMaps           |
| `npm run docs:mcp`  | Regenerates `docs/MCP_TOOLS.md` from the tool descriptors |

## Adding an MCP tool

1. Register it in `electron/mcp/register*.ts`.
2. Describe it in `electron/mcp/descriptors.ts` and classify it in `electron/mcp/docsGenerator.ts`.
3. Add `mcpSettings.tools.<name>` to `src/i18n/locales/{en,ru,zh}.json`.
4. Run `npm run docs:mcp`.
5. Keep the response bounded: use `okStatusToolResult` (it caps lists and size) and add a `limit` if the tool returns a list.

Tests enforce each step, so a missing one fails CI.

## Conventions

- **Style**: Prettier and ESLint are enforced. TypeScript is strict.
- **Tests**: add one for the behaviour you change; for a bug, write a test that fails without your fix.
- **Commits**: [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `chore:`), describing _what_ and _why_.
- **Packaging**: the Kuzu worker runs under the system Node, so any file it loads must match `build.asarUnpack` in `package.json` (the patterns are case-sensitive); a test checks it.

## Pull requests

1. Push to your fork and open a pull request against `main`.
2. Explain what problem it solves and how to check it; screenshots help for UI changes.
3. Wait for review. CI must be green.

## Releases (maintainers)

Releases are driven by git tags. Update `CHANGELOG.md` and `.github/release-body.md` (it must have Russian, English and Chinese sections), run `npm run verify` in a fresh clone, push `main`, then tag and push: `git tag -a vX.Y.Z -m "release: vX.Y.Z" && git push origin vX.Y.Z`. The Release workflow takes the version from the tag, builds Windows and Linux artifacts and publishes them.

## Reporting issues

Open an issue with steps to reproduce, the expected behaviour, your OS and Node.js version, and the CodeMaps version (shown by the MCP server and in the release file name). For security problems see [SECURITY.md](SECURITY.md).
