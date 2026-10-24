/**
 * The advice `setup_project` hands back to the calling agent: a short list of next steps, and a CI
 * suggestion. The CI part is only text, because CodeMaps has no headless guard command yet and
 * must not write workflow files into someone's repository.
 */
import type { AgentId, BaselineSummary, CiSuggestion, DetectedProject } from './types';

/** What the next steps depend on. */
export interface AdviceInput {
  apply: boolean;
  /** Whether files were (or, in a dry run, would be) created or updated. */
  changed: boolean;
  warnings: string[];
  baseline: BaselineSummary;
  agents: AgentId[];
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
  steps.push('Before coding call prepare_task_context with the user request.');
  steps.push('After every edit call validate_architecture_changes, then check_documentation.');
  return steps;
};

const CI_PROVIDER_FILES: Record<string, string> = {
  'github-actions': '.github/workflows/',
  'gitlab-ci': '.gitlab-ci.yml',
  jenkins: 'Jenkinsfile',
  circleci: '.circleci/config.yml',
  'azure-pipelines': 'azure-pipelines.yml',
};

/**
 * A documented suggestion for the project's CI. It lists the project's own detected checks and the
 * one rule that keeps the ratchet honest: the baseline may only shrink. It is never written to disk.
 */
export const ciSuggestionFor = (detected: DetectedProject): CiSuggestion => {
  const provider = detected.ci[0] ?? 'github-actions';
  const commands = Object.values(detected.commands);
  const checks =
    commands.length > 0
      ? `run the project's own checks (${commands.join(', ')})`
      : "run the project's own build and tests";
  const where = CI_PROVIDER_FILES[provider] ?? 'your CI configuration';
  return {
    provider,
    text: `Not written automatically: CodeMaps has no headless guard command yet. In ${where}, ${checks}, and review any change to .codemaps/baseline.json in pull requests: it may only shrink.`,
  };
};
