/**
 * The advice `setup_project` hands back to the calling agent: a short list of next steps, and a
 * summary of the CI wiring. The CI files themselves are planned in `ciFiles.ts`; CodeMaps writes
 * only the ones it owns and tells the user how to hook them into CI configuration of their own.
 */
import {
  ciFilePaths,
  GITLAB_SNIPPET_PATH,
  GUARD_SCRIPT_PATH,
  GUARD_WORKFLOW_PATH,
} from './ciFiles';
import type { AgentId, BaselineSummary, CiSuggestion, DetectedProject } from './types';

/** What the next steps depend on. */
export interface AdviceInput {
  apply: boolean;
  /** Whether files were (or, in a dry run, would be) created or updated. */
  changed: boolean;
  warnings: string[];
  baseline: BaselineSummary;
  agents: AgentId[];
  /** CI files that belong to the project (see `ciFilePaths`). */
  ciFiles: string[];
}

const frozenCount = (baseline: BaselineSummary): string =>
  baseline.total === undefined ? 'the existing findings' : `${baseline.total} existing findings`;

/**
 * Up to six short instructions for the agent, most urgent first. A dry run only says how to apply;
 * a clean re-run says there is nothing to do.
 */
export const buildNextSteps = (input: AdviceInput): string[] => {
  if (!input.apply) {
    return ['Call setup_project again with apply true (the default) to write these files.'];
  }
  const steps: string[] = [];
  if (input.warnings.length > 0) {
    steps.push('Fix the files listed in warnings, then call setup_project again.');
  }
  if (input.changed) {
    steps.push(
      'Tell the user to commit .codemaps/ and the agent files so the whole team gets the same guardrails.'
    );
  }
  if (input.baseline.status === 'created') {
    steps.push(
      `.codemaps/baseline.json froze ${frozenCount(input.baseline)}: only new or worsened findings are reported now. Do not edit it by hand.`
    );
  }
  if (input.changed && input.agents.includes('claude')) {
    steps.push('Claude Code may ask the user to approve the new edit hook; it is safe to accept.');
  }
  if (input.changed) steps.push(...ciSteps(input.ciFiles));
  steps.push('Before coding call prepare_task_context with the user request.');
  steps.push('After every edit call validate_architecture_changes, then check_documentation.');
  return steps;
};

/** What the user still has to do by hand for the CI files that were written. */
const ciSteps = (ciFiles: string[]): string[] => {
  const steps: string[] = [];
  if (ciFiles.includes(GUARD_WORKFLOW_PATH)) {
    steps.push(
      `Commit ${GUARD_WORKFLOW_PATH}: pull requests then run codemaps-guard and fail on new or worsened findings or a growing baseline.`
    );
  }
  if (ciFiles.includes(GUARD_SCRIPT_PATH)) {
    steps.push(
      `For GitLab CI add "include: - local: ${GITLAB_SNIPPET_PATH}" to .gitlab-ci.yml; for any other CI run "sh ${GUARD_SCRIPT_PATH} origin/<target-branch>" in a merge request job. CodeMaps does not edit your CI files.`
    );
  }
  return steps;
};

/** The CI provider the wiring is written for. */
const providerOf = (ciFiles: string[], detected: DetectedProject): string => {
  if (ciFiles.includes(GUARD_WORKFLOW_PATH)) return 'github-actions';
  return detected.ci.find((provider) => provider !== 'github-actions') ?? 'generic';
};

/**
 * What the setup did about CI: the files it owns (the GitHub workflow, or the GitLab snippet and
 * the portable script) and a reminder to keep the project's own checks in CI as well. The one rule
 * that keeps the ratchet honest, a baseline that may only shrink, is enforced by the guard itself.
 */
export const ciSuggestionFor = (root: string, detected: DetectedProject): CiSuggestion => {
  const files = ciFilePaths(root, detected);
  const commands = Object.values(detected.commands);
  const checks =
    commands.length > 0
      ? `the project's own checks (${commands.join(', ')})`
      : "the project's own build and tests";
  return {
    provider: providerOf(files, detected),
    files,
    text: `CI wiring for codemaps-guard: ${files.join(', ')}. The guard runs on pull requests with no CodeMaps app and no network access, and fails on new or worsened findings and on a baseline that grew. Keep running ${checks} in CI as well.`,
  };
};
