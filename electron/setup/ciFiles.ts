/**
 * Decides which CI files `setup_project` writes. GitHub Actions projects get one workflow of their
 * own (`codemaps-guard.yml`); every other CI, or none, gets a GitLab CI snippet and a portable
 * script under `.codemaps/ci/` that the user includes or calls from their own configuration.
 * CodeMaps never edits a CI file it does not own.
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  githubWorkflow,
  gitlabSnippet,
  guardDownloadFor,
  portableGuardScript,
} from './templates/ciTemplates';
import type { DetectedProject, PlannedFile } from './types';

/** The GitHub Actions workflow CodeMaps owns. */
export const GUARD_WORKFLOW_PATH = '.github/workflows/codemaps-guard.yml';
/** The GitLab CI job to include. */
export const GITLAB_SNIPPET_PATH = '.codemaps/ci/gitlab-ci.yml';
/** The portable script that runs the guard in any CI. */
export const GUARD_SCRIPT_PATH = '.codemaps/ci/guard.sh';

/** Which kinds of CI file apply to a project. */
export interface CiTargets {
  github: boolean;
  portable: boolean;
}

/** Whether the repository's git config points at github.com. */
const hasGithubRemote = (root: string): boolean => {
  try {
    return /github\.com/i.test(fs.readFileSync(path.join(root, '.git', 'config'), 'utf-8'));
  } catch {
    return false;
  }
};

/**
 * What the project's CI situation calls for. GitHub Actions wins when its workflows exist, or when
 * no CI is detected and the repository has a `.github` folder or a GitHub remote. Another detected
 * CI, or an unknown situation, gets the portable files; a project with both gets both.
 */
export const ciTargetsFor = (root: string, detected: DetectedProject): CiTargets => {
  const others = detected.ci.filter((provider) => provider !== 'github-actions');
  const noCi = detected.ci.length === 0;
  const githubHints = fs.existsSync(path.join(root, '.github')) || hasGithubRemote(root);
  const github = detected.ci.includes('github-actions') || (noCi && githubHints);
  return { github, portable: others.length > 0 || !github };
};

/** Paths of the CI files that apply to the project, in the order they are planned. */
export const ciFilePaths = (root: string, detected: DetectedProject): string[] => {
  const targets = ciTargetsFor(root, detected);
  return [
    ...(targets.github ? [GUARD_WORKFLOW_PATH] : []),
    ...(targets.portable ? [GITLAB_SNIPPET_PATH, GUARD_SCRIPT_PATH] : []),
  ];
};

/** The CI files for the project, pinned to `version` of CodeMaps. */
export const planCiFiles = (
  root: string,
  detected: DetectedProject,
  version: string
): PlannedFile[] => {
  const targets = ciTargetsFor(root, detected);
  const download = guardDownloadFor(version);
  const files: PlannedFile[] = [];
  if (targets.github) {
    files.push({
      path: GUARD_WORKFLOW_PATH,
      strategy: 'owned',
      style: 'hash',
      content: githubWorkflow(download),
    });
  }
  if (targets.portable) {
    files.push(
      { path: GITLAB_SNIPPET_PATH, strategy: 'owned', style: 'hash', content: gitlabSnippet() },
      {
        path: GUARD_SCRIPT_PATH,
        strategy: 'owned',
        style: 'hash',
        content: portableGuardScript(download),
      }
    );
  }
  return files;
};
