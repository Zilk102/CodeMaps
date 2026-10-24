/**
 * Tests of the CI wiring `setup_project` writes: the GitHub workflow, the GitLab snippet and the
 * portable script, their pinned download, idempotency and the rule that user CI files are never
 * touched.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { guardDownloadFor } from '../templates/ciTemplates';
import { setupProject } from '../setupProject';
import { cleanTemp, exists, fakeBaseline, options, readFile, tempProject } from './kit';

afterEach(cleanTemp);

const WORKFLOW = '.github/workflows/codemaps-guard.yml';
const USER_WORKFLOW = 'name: CI\non: push\njobs:\n  test:\n    runs-on: ubuntu-latest\n';

const run = (root: string, extra = {}) =>
  setupProject(options(root, extra), { createBaseline: fakeBaseline().create });

describe('setup_project CI wiring: GitHub Actions', () => {
  it('writes the guard workflow next to the existing workflows and leaves them alone', async () => {
    const root = tempProject({ '.github/workflows/ci.yml': USER_WORKFLOW });
    const result = await run(root);

    expect(result.written).toContain(WORKFLOW);
    expect(result.written).not.toContain('.codemaps/ci/guard.sh');
    expect(readFile(root, '.github/workflows/ci.yml')).toBe(USER_WORKFLOW);
    expect(result.ciSuggestion).toMatchObject({ provider: 'github-actions', files: [WORKFLOW] });
    expect(result.nextSteps.join(' ')).toContain(WORKFLOW);
  });

  it('pins the release asset, verifies its sha256 and runs the guard on pull requests', async () => {
    const root = tempProject({ '.github/workflows/ci.yml': USER_WORKFLOW });
    await run(root);
    const workflow = readFile(root, WORKFLOW);

    expect(workflow).toContain('codemaps:file v1.2.0');
    expect(workflow).toContain(
      'https://github.com/Zilk102/CodeMaps/releases/download/v1.2.0/codemaps-guard-1.2.0.tgz'
    );
    expect(workflow).toContain('$GUARD_URL.sha256');
    expect(workflow).toContain('sha256sum');
    expect(workflow).toContain('fetch-depth: 0');
    expect(workflow).toContain('pull_request:');
    expect(workflow).toMatch(/permissions:\n {2}contents: read/);
    expect(workflow).toContain(
      'node guard/guard.mjs check --base origin/${{ github.base_ref }} --format github'
    );
  });

  it('follows the latest release when the app version is not a release', async () => {
    expect(guardDownloadFor('0.0.0')).toMatchObject({ pinnedVersion: null });
    expect(guardDownloadFor('1.2.0-beta.1').pinnedVersion).toBeNull();
    const root = tempProject({ '.github/workflows/ci.yml': USER_WORKFLOW });
    await run(root, { version: '0.0.0' });
    expect(readFile(root, WORKFLOW)).toContain(
      'https://github.com/Zilk102/CodeMaps/releases/latest/download/codemaps-guard.tgz'
    );
  });

  it('is idempotent and refreshes the workflow only when it is older', async () => {
    const root = tempProject({ '.github/workflows/ci.yml': USER_WORKFLOW });
    await run(root);
    const second = await run(root);
    expect(second.upToDate).toBe(true);
    expect(second.unchanged).toContain(WORKFLOW);

    const newer = await run(root, { version: '1.3.0' });
    expect(newer.updated).toContain(WORKFLOW);
    expect(readFile(root, WORKFLOW)).toContain('download/v1.3.0/codemaps-guard-1.3.0.tgz');

    const older = await run(root, { version: '1.2.0' });
    expect(older.skipped.map((entry) => entry.path)).toContain(WORKFLOW);
    expect(readFile(root, WORKFLOW)).toContain('v1.3.0');
  });

  it('does not take over a workflow of the same name that the user wrote', async () => {
    const root = tempProject({ [WORKFLOW]: USER_WORKFLOW });
    const result = await run(root);
    expect(readFile(root, WORKFLOW)).toBe(USER_WORKFLOW);
    expect(result.skipped.map((entry) => entry.path)).toContain(WORKFLOW);
  });

  it('chooses GitHub Actions for a project without CI that has a .github folder or a GitHub remote', async () => {
    const withFolder = tempProject({ '.github/ISSUE_TEMPLATE/bug.md': 'bug' });
    expect((await run(withFolder)).written).toContain(WORKFLOW);

    const withRemote = tempProject({
      '.git/config': '[remote "origin"]\n\turl = git@github.com:acme/app.git\n',
    });
    expect((await run(withRemote)).written).toContain(WORKFLOW);
  });

  it('writes nothing in a dry run but lists the workflow', async () => {
    const root = tempProject({ '.github/workflows/ci.yml': USER_WORKFLOW });
    const result = await run(root, { apply: false });
    expect(exists(root, WORKFLOW)).toBe(false);
    expect(result.wouldWrite).toContainEqual({ path: WORKFLOW, action: 'create' });
  });
});

describe('setup_project CI wiring: GitLab CI and others', () => {
  it('writes the include snippet and the portable script instead of editing .gitlab-ci.yml', async () => {
    const gitlab = 'stages: [test]\ntest:\n  script: [npm test]\n';
    const root = tempProject({ '.gitlab-ci.yml': gitlab });
    const result = await run(root);

    expect(result.written).toEqual(
      expect.arrayContaining(['.codemaps/ci/gitlab-ci.yml', '.codemaps/ci/guard.sh'])
    );
    expect(result.written).not.toContain(WORKFLOW);
    expect(readFile(root, '.gitlab-ci.yml')).toBe(gitlab);
    expect(result.ciSuggestion.provider).toBe('gitlab-ci');
    expect(result.nextSteps.join(' ')).toContain('.codemaps/ci/gitlab-ci.yml');
    expect(result.nextSteps.join(' ')).toContain('does not edit your CI files');
  });

  it('makes the script download a pinned release, check its checksum and fetch a missing base', async () => {
    const root = tempProject({ Jenkinsfile: 'pipeline {}\n' });
    await run(root);
    const script = readFile(root, '.codemaps/ci/guard.sh');

    expect(script.startsWith('#!/bin/sh\n# codemaps:file v1.2.0\n')).toBe(true);
    expect(script).toContain('releases/download/v1.2.0/codemaps-guard-1.2.0.tgz');
    expect(script).toContain('sha256sum');
    expect(script).toContain('shasum -a 256');
    expect(script).toContain('git fetch');
    expect(script).toContain('check --base "$BASE" --format text');
    expect(readFile(root, '.codemaps/ci/gitlab-ci.yml')).toContain(
      'sh .codemaps/ci/guard.sh "origin/$CI_MERGE_REQUEST_TARGET_BRANCH_NAME"'
    );
  });

  it('writes the portable files for a project with no hint of any CI', async () => {
    const root = tempProject({ 'src/a.ts': 'export const a = 1;\n' });
    const result = await run(root);
    expect(result.ciSuggestion.files).toEqual([
      '.codemaps/ci/gitlab-ci.yml',
      '.codemaps/ci/guard.sh',
    ]);
    expect(exists(root, WORKFLOW)).toBe(false);
  });

  it('writes both when GitHub Actions and another CI are in use', async () => {
    const root = tempProject({
      '.github/workflows/ci.yml': USER_WORKFLOW,
      '.gitlab-ci.yml': 'test:\n  script: [npm test]\n',
    });
    const result = await run(root);
    expect(result.written).toEqual(
      expect.arrayContaining([WORKFLOW, '.codemaps/ci/gitlab-ci.yml', '.codemaps/ci/guard.sh'])
    );
  });
});

describe('setup_project CI wiring: templates', () => {
  it('keeps the agent templates in step with the CI promise', async () => {
    const root = tempProject({ '.github/workflows/ci.yml': USER_WORKFLOW });
    await run(root);
    expect(readFile(root, 'AGENTS.md')).toContain('codemaps-guard');
  });
});
