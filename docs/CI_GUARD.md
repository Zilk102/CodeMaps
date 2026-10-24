# The CI guard (`codemaps-guard`)

The MCP tools keep an agent honest while it edits. `codemaps-guard` makes the same rules binding for everybody else: it runs in the CI of **any** project, with only Node.js. No CodeMaps app, no Electron, no Kuzu database, no network access and no telemetry.

It is a bundle of the same code the app uses: the project graph is built in memory by the same indexer, and the verdict comes from the same `validateChanges` that backs `validate_architecture_changes`, over the same documentation coverage, clone detection and quality measurements. It reads `.codemaps/config.json` (mode, excludes, thresholds, documentation policy) and `.codemaps/baseline.json` (see [PROJECT_CONFIG.md](PROJECT_CONFIG.md)), so a local MCP run and a CI run agree.

## Wiring it up

`setup_project` does it for you (see [AGENT_SETUP.md](AGENT_SETUP.md)):

| Project                                                                              | What is written                                                                         |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| GitHub Actions (workflows exist, or no CI and a `.github` folder or a GitHub remote) | `.github/workflows/codemaps-guard.yml`                                                  |
| GitLab CI, Jenkins, CircleCI, ... or no hint of any CI                               | `.codemaps/ci/gitlab-ci.yml` (include it) and `.codemaps/ci/guard.sh` (portable script) |

The workflow runs on `pull_request` with `contents: read` only. It checks out the full history, downloads the pinned release asset
`https://github.com/Zilk102/CodeMaps/releases/download/v<version>/codemaps-guard-<version>.tgz`, verifies it against the `.sha256` asset next to it, unpacks it and runs

```bash
node guard/guard.mjs check --base origin/${{ github.base_ref }} --format github
```

If the CodeMaps version is not a release (a development build), the workflow follows `releases/latest/download/codemaps-guard.tgz` instead. The files carry a `codemaps:file vX.Y.Z` marker: `setup_project` refreshes them when they are older and never touches a file of the same name that you wrote. CodeMaps never edits your own CI files; for GitLab you add one `include:` line, for other CI systems you call `sh .codemaps/ci/guard.sh origin/<target-branch>` from a merge request job.

## Commands

```text
codemaps-guard check [--root .] [--base <git ref>] [--format text|github|json] [--strict]
codemaps-guard baseline [--root .] [--refresh]
codemaps-guard version
```

### `check`

Judges the project and exits with **1** only when a **new or worsened** finding exists (or the baseline grew, below). Old debt recorded in the baseline is summarized, not listed.

- Without `--base` every file of the project is judged. With `--base <ref>` only the files that differ from the merge base with `<ref>` are judged (committed, uncommitted and untracked, deleted files excluded). If nothing changed, nothing is even indexed.
- Blocking findings are the high-severity ones, as in `validate_architecture_changes` (hub nodes are advisory and never block). Medium and low findings are listed as warnings. In a project with `thresholds` in its config everything beyond a limit is high.
- `--strict` ignores the baseline and fails on every finding except hubs.
- Formats: `text` (default), `github` (workflow commands `::error file=src/a.ts,line=12,title=long_methods::message Fix: hint` for blocking issues, `::warning` for advisory ones; GitHub shows at most 10 of each per step) and `json` (the whole report, advisory issues included). Every issue carries the same fix hint the MCP tools give. The text summary names the scope, the mode, the number of blocking and advisory issues and the `legacyDebt` (accepted, paid down, worsened).
- **The baseline may only shrink.** With `--base`, `.codemaps/baseline.json` is compared with the base ref's copy; a new fingerprint or a larger measure fails the run. A baseline that is introduced by the pull request (absent at the base) is accepted once.
- Exit codes: `0` passed, `1` findings or a grown baseline, `2` usage or environment problem (unknown option, a base ref that is not fetched, no source files).
- Output on stdout is deterministic: no timestamps, a fixed order. Timing goes to stderr.

### `baseline`

The only command that writes files, and only inside `.codemaps/`. `baseline` creates `.codemaps/baseline.json` from today's findings (it refuses to overwrite an existing one). `baseline --refresh` lets an existing baseline shrink: entries whose finding is gone are removed and improved measures are lowered; nothing is ever added.

### `version`

Prints the version of the guard, which equals the CodeMaps release it was packed with.

## Using it by hand

```bash
curl -fsSLO https://github.com/Zilk102/CodeMaps/releases/latest/download/codemaps-guard.tgz
tar -xzf codemaps-guard.tgz
node guard/guard.mjs check --base origin/main
```

The tarball contains `guard/guard.mjs` and `guard/wasm/` (the tree-sitter runtime and the grammars). Node.js 22 is what CodeMaps itself uses and what the generated workflow installs; the portable script assumes a current Node.js is on the PATH. Keep the two together: the guard finds `wasm/` next to itself, or in the folder named by `CODEMAPS_WASM_DIR`.

## Release assets

Every release carries, next to the installers:

| Asset                                 | What it is                                       |
| ------------------------------------- | ------------------------------------------------ |
| `codemaps-guard-<version>.tgz`        | The packed guard of that release (pinned CI use) |
| `codemaps-guard-<version>.tgz.sha256` | Its checksum, `<hash>  <file>`                   |
| `codemaps-guard.tgz` + `.sha256`      | The same, under a stable name for "latest"       |

## Performance

On the CodeMaps repository itself (about 600 files) `check` takes around 3 seconds on a laptop; a 500 file project is in the same range, far below a minute. Git is called a handful of times and only for read-only commands (`rev-parse`, `merge-base`, `diff`, `ls-files`, `show`).

## Limits

- Git history based signals (churn) are not read; they are advisory in the app and never block.
- At most five pieces of evidence are listed per rule in a finding (the same cap as the MCP tool); the exit code always reflects every finding. Use the baseline and `check --base` for a first adoption in a big legacy project.
- The grammars shipped are the ones CodeMaps knows (see the supported languages in the README); other files are indexed without structure.

## For maintainers

`npm run build:guard` bundles `electron/guard/cli.ts` with rolldown (it ships with vite, nothing extra is installed) into `dist-guard/`; `npm run guard` builds and runs it on this repository, and CI does the same on Linux and Windows. `electron` and `electron-log` are replaced by empty stand-ins in the bundle so it can neither start Electron nor write log files. The bundle test (`electron/guard/__tests__/guardBundle.test.ts`) unpacks the tarball into an empty folder and runs it with plain Node; it is skipped until `build:guard` has run.
