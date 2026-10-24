/**
 * Text of the CI files `setup_project` writes: a GitHub Actions workflow, and for every other CI
 * a GitLab CI snippet plus a portable shell script. All of them do the same four things: download
 * the pinned guard release, verify its sha256, unpack it and run `check` against the target
 * branch. They are templates with `FILE_MARKER_TOKEN`, so they are CodeMaps-owned files that are
 * refreshed only when older.
 */
import { FILE_MARKER_TOKEN } from '../markers';

/** Where a guard release can be downloaded from, and the checksum next to it. */
export interface GuardDownload {
  /** URL of the tarball. */
  url: string;
  /** URL of its `.sha256` file. */
  checksumUrl: string;
  /** The CodeMaps version the URLs are pinned to, or null when they follow the latest release. */
  pinnedVersion: string | null;
}

const RELEASES = 'https://github.com/Zilk102/CodeMaps/releases';

/**
 * The download of the guard that matches `version`. A release version is pinned, so CI behaves the
 * same until CodeMaps is set up again; anything else (development builds, `0.0.0`) follows the
 * latest release.
 */
export const guardDownloadFor = (version: string): GuardDownload => {
  if (/^\d+\.\d+\.\d+$/.test(version) && version !== '0.0.0') {
    const url = `${RELEASES}/download/v${version}/codemaps-guard-${version}.tgz`;
    return { url, checksumUrl: `${url}.sha256`, pinnedVersion: version };
  }
  const url = `${RELEASES}/latest/download/codemaps-guard.tgz`;
  return { url, checksumUrl: `${url}.sha256`, pinnedVersion: null };
};

/** The pull request workflow for GitHub Actions. */
export const githubWorkflow = (download: GuardDownload): string => `${FILE_MARKER_TOKEN}
# Runs the CodeMaps guard on every pull request: new or worsened findings and a growing
# .codemaps/baseline.json fail the check. CodeMaps owns this file and refreshes it when it is
# older; make your own changes in a separate workflow. See docs/CI_GUARD.md in the CodeMaps repo.
name: CodeMaps Guard

on:
  pull_request:

permissions:
  contents: read

jobs:
  guard:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: 22

      - name: Download and verify the CodeMaps guard
        env:
          GUARD_URL: ${download.url}
        run: |
          curl -fsSL -o "$RUNNER_TEMP/codemaps-guard.tgz" "$GUARD_URL"
          curl -fsSL -o "$RUNNER_TEMP/codemaps-guard.tgz.sha256" "$GUARD_URL.sha256"
          expected="$(cut -d' ' -f1 "$RUNNER_TEMP/codemaps-guard.tgz.sha256")"
          actual="$(sha256sum "$RUNNER_TEMP/codemaps-guard.tgz" | cut -d' ' -f1)"
          if [ "$expected" != "$actual" ]; then
            echo "::error::codemaps-guard.tgz does not match its sha256 ($expected expected, $actual found)"
            exit 1
          fi
          tar -xzf "$RUNNER_TEMP/codemaps-guard.tgz" -C "$RUNNER_TEMP"

      - name: Run the guard
        run: node "$RUNNER_TEMP/guard/guard.mjs" check --base origin/\${{ github.base_ref }} --format github
`;

/** The portable script: works in any CI that has sh, curl or wget, tar, node 18+ and git. */
export const portableGuardScript = (download: GuardDownload): string => `#!/bin/sh
${FILE_MARKER_TOKEN}
# Runs the CodeMaps guard in any CI. Usage: sh .codemaps/ci/guard.sh [base-ref]
# The base ref defaults to $CODEMAPS_GUARD_BASE, then origin/main. Needs git (with history), node
# 22, tar, curl or wget, and sha256sum or shasum. See docs/CI_GUARD.md in the CodeMaps repo.
set -eu

GUARD_URL="${download.url}"
BASE="\${1:-\${CODEMAPS_GUARD_BASE:-origin/main}}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

download() {
  if command -v curl >/dev/null 2>&1; then curl -fsSL -o "$2" "$1"; else wget -q -O "$2" "$1"; fi
}

checksum() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -d' ' -f1; else shasum -a 256 "$1" | cut -d' ' -f1; fi
}

download "$GUARD_URL" "$WORK/codemaps-guard.tgz"
download "$GUARD_URL.sha256" "$WORK/codemaps-guard.tgz.sha256"
expected="$(cut -d' ' -f1 "$WORK/codemaps-guard.tgz.sha256")"
actual="$(checksum "$WORK/codemaps-guard.tgz")"
if [ "$expected" != "$actual" ]; then
  echo "codemaps-guard.tgz does not match its sha256 ($expected expected, $actual found)" >&2
  exit 1
fi
tar -xzf "$WORK/codemaps-guard.tgz" -C "$WORK"

# Shallow or single-branch clones lack the base branch: fetch it when it is missing.
if ! git rev-parse --verify --quiet "$BASE^{commit}" >/dev/null; then
  git fetch --quiet origin "\${BASE#origin/}"
fi

node "$WORK/guard/guard.mjs" check --base "$BASE" --format text
`;

/** The GitLab CI job; include it from the project's own \`.gitlab-ci.yml\`. */
export const gitlabSnippet = (): string => `${FILE_MARKER_TOKEN}
# Include this file from .gitlab-ci.yml (CodeMaps never edits your own CI files):
#
#   include:
#     - local: .codemaps/ci/gitlab-ci.yml
#
# It runs .codemaps/ci/guard.sh on merge requests; the job fails on new or worsened findings and
# when .codemaps/baseline.json grew. See docs/CI_GUARD.md in the CodeMaps repo.
codemaps-guard:
  image: node:22
  variables:
    GIT_DEPTH: '0'
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
  script:
    - sh .codemaps/ci/guard.sh "origin/$CI_MERGE_REQUEST_TARGET_BRANCH_NAME"
`;
