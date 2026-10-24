# Project configuration and the baseline

Every project can carry two small files in a `.codemaps/` folder at its root. Both are optional and meant to be committed (the folder also holds `graph.db`, a disposable cache you should git-ignore).

| File                      | Purpose                                                                  |
| ------------------------- | ------------------------------------------------------------------------ |
| `.codemaps/config.json`   | What CodeMaps measures in this project and how strictly it judges it.    |
| `.codemaps/baseline.json` | The findings an old codebase already has, so only new ones are reported. |

Without either file CodeMaps behaves exactly as before.

## `config.json`

```json
{
  "version": 1,
  "mode": "ratchet",
  "exclude": ["vendor", "src/generated/**", "**/*.pb.ts"],
  "thresholds": { "maxFunctionLines": 60, "maxComplexity": 8, "maxNesting": 3 },
  "documentation": { "enabled": true, "headerMinLines": 15, "functionMinLines": 10 }
}
```

| Field                            | Default     | Meaning                                                                                                                                                                    |
| -------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mode`                           | `"ratchet"` | `ratchet` compares findings with the baseline; `strict` ignores the baseline.                                                                                              |
| `exclude`                        | `[]`        | Globs relative to the project root. Excluded files are skipped by clone detection, documentation coverage and the quality findings (long, complex, god, oversized, mixed). |
| `thresholds.maxFunctionLines`    | `60`        | A function with more lines is long.                                                                                                                                        |
| `thresholds.maxComplexity`       | `8`         | A function with a higher cyclomatic complexity is complex.                                                                                                                 |
| `thresholds.maxNesting`          | `3`         | A function nested deeper is deep.                                                                                                                                          |
| `documentation.enabled`          | `true`      | `false` turns documentation findings off.                                                                                                                                  |
| `documentation.headerMinLines`   | `15`        | Files shorter than this need no header comment.                                                                                                                            |
| `documentation.functionMinLines` | `10`        | A private function of at least this many lines must be documented.                                                                                                         |

**Thresholds apply only when you write them.** A project without `thresholds` keeps CodeMaps' built-in detection limits (long from 70 lines, complex from complexity 10, deep from nesting 4, high severity from 120 lines, complexity 15 and nesting 5). A threshold you write replaces the matching limit, and everything beyond it is then reported with high severity, because you asked for exactly that rule. The file written by `writeDefaultProjectConfig` spells out all three, so a newly set up project enforces them.

### Globs

The dialect is the useful part of `.gitignore`:

- `*` matches within a path segment, `**` across segments, `?` one character; matching ignores case.
- A pattern with a slash (`src/generated`, `/dist`) is anchored at the project root; a bare name (`vendor`) matches at any depth.
- A pattern that matches a folder excludes everything below it.
- Negation (`!pattern`) is not supported.

### Mistakes are tolerated

The loader never throws. A missing file means defaults. Invalid JSON, or an invalid field, falls back to the default for that field only and adds a warning. Warnings are shown as `configWarnings` by `validate_architecture_changes` and in the `get_health_score` summary. The parsed file is cached by modification time, so edits take effect on the next tool call.

## The ratchet

Switching strict rules on in a legacy codebase would bury an agent under thousands of old findings. The baseline lets old debt stay and makes new debt impossible.

1. **Create the baseline** once (see below). It records one entry per existing finding: `fingerprint -> measure`.
2. **A fingerprint is `kind|file|symbol`**, for example `long_function|src/parser.ts|parseExpression`. It has no line number, so adding code above a function does not turn it into a new finding. Findings of the same name in one file are numbered (`#2`, `#3`) in order of appearance.
3. **The measure** is how bad the finding is: lines for a long function, class, god file or oversized module; complexity or nesting depth for complex and deep functions; the size of the copied block for a clone; the fan-out of a file. A baselined finding whose measure **grows** counts as **worsened**, i.e. new again. Documentation and layer findings have no size and are simply there or gone.
4. **Classification** (`classifyFindings`) splits the current findings into `fresh` (not in the baseline), `worsened` (in it, but bigger now) and `legacy` (in it, unchanged or smaller).
5. **Only fresh and worsened findings count.** In ratchet mode `validate_architecture_changes` reports just those in `findings` and decides `isValid` from them. Old debt is summarized, not listed:

```json
"legacyDebt": {
  "total": 212,
  "byKind": { "long_function": 140, "undocumented_symbol": 60, "clone": 12 },
  "paidDown": { "total": 7, "byKind": { "long_function": 7 } },
  "worsened": 0,
  "baselineCreatedAt": "2026-10-24T09:00:00.000Z"
}
```

6. **The baseline may only shrink.** Call `validate_architecture_changes` with `refreshBaseline: true` (ratchet mode only) after paying debt down: entries whose finding is gone are removed and improved ones get the lower measure. Nothing is ever added and a worsened finding keeps its old measure, so it stays flagged until it is fixed. Commit the smaller file.

Kinds covered: `long_function`, `complex_function`, `deep_function`, `god_class`, `god_file`, `oversized_module`, `mixed_responsibility`, `high_fan_out`, `clone`, `layer_violation`, `undocumented_symbol`, `missing_header`. Hub nodes and churn are advisory and never block, so they are not part of the baseline.

### Modes at a glance

|                                         | `ratchet` + baseline                | `ratchet`, no baseline | `strict`      |
| --------------------------------------- | ----------------------------------- | ---------------------- | ------------- |
| `validate_architecture_changes`         | new and worsened only, `legacyDebt` | every finding          | every finding |
| `get_health_score` score                | whole code                          | whole code             | whole code    |
| `get_health_score` `summary.legacyDebt` | present                             | absent                 | absent        |

The health score stays honest: it never looks at the baseline. The edit hook (`scripts/codemaps-validate-hook.mjs`) only reads `findings`, so it never reports legacy debt.

## For a setup tool

Agents do not need this by hand: the `setup_project` MCP tool does exactly the steps below (see [AGENT_SETUP.md](AGENT_SETUP.md)).

```ts
import { writeDefaultProjectConfig } from 'electron/analysis/projectConfig';
import { createProjectBaseline } from 'electron/analysis/baseline';

writeDefaultProjectConfig(root); // creates .codemaps/config.json if missing
const result = await createProjectBaseline(graph); // measures everything, writes .codemaps/baseline.json
// result: { path, total, byKind, baseline }
```

Lower-level pieces: `readBaseline(root)`, `collectFindings(sources)`, `classifyFindings(findings, baseline)`, `shrinkBaseline(root, findings)`, `loadProjectConfig(root)`.

## Examples

Ignore vendored and generated code, keep the defaults otherwise:

```json
{ "exclude": ["third_party", "**/*.generated.ts"] }
```

A greenfield project that wants every finding to count:

```json
{ "mode": "strict", "thresholds": { "maxFunctionLines": 40, "maxComplexity": 6, "maxNesting": 3 } }
```

A legacy project: keep `"mode": "ratchet"`, create the baseline, commit both files, and let agents call `validate_architecture_changes` as usual.

## What blocks

New or worsened long, complex or deep functions, god files and classes, oversized and mixed-responsibility modules, layer violations, code clones and missing documentation all fail `validate_architecture_changes` and `codemaps-guard check`. Hubs are information only. In `ratchet` mode only fresh or worsened findings count; `strict` mode counts everything.
