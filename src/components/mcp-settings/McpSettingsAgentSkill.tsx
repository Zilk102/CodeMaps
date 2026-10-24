import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { commonSectionStyle, CodeBlock } from './shared';

interface Props {
  endpoint: string;
  copiedKey: string | null;
  copyText: (key: string, text: string) => void;
}

/** Agent skill template; `__ENDPOINT__` is replaced with the live MCP endpoint. */
const SKILL_TEMPLATE = `---
name: "codemaps-agent-autopilot"
description: "Uses CodeMaps MCP as the default architectural brain for project understanding, debugging, refactors, reviews, and migration campaigns. Invoke whenever CodeMaps is connected."
---

# CodeMaps Agent Autopilot

Use this skill whenever the workspace has the \`codemaps\` MCP server available.

## Goal

Treat CodeMaps as the primary architectural intelligence layer before editing code.
Do not wait until after file inspection to use it.

## MCP Server

- Server name: \`codemaps\`
- MCP endpoint: \`__ENDPOINT__\`

## Default Flow

1. If the project is not analyzed yet, call \`analyze_project\`.
2. For any natural-language user request, call \`prepare_task_context\` first.
3. If CodeMaps routes the task to a campaign-level change, use \`prepare_change_campaign\`.
4. If CodeMaps routes the task to a single-target code change, use \`prepare_change_context\`.
5. If CodeMaps routes the task to diagnostics, review, architecture, or stabilization, use \`prepare_review_context\`.
6. Use low-level tools only as fallback when the composite context explicitly leaves ambiguity.

## Routing Rules

- Bug, incident, regression, "not working", "broken":
  Start with \`prepare_task_context\`.
- Duplicated or copy-pasted code, "remove duplication":
  Call \`find_duplicates\` (pass \`filePath\` to focus on one file). Each group lists the copies with line ranges, \`parameters\` (how many values differ, i.e. the arguments of the function to extract), sample \`differences\` and a \`suggestion\` with the action and a target file. Extract the shared code there, then call \`find_duplicates\` again to confirm the group is gone.
- Writing or changing code in any language:
  Document every new or changed file and public symbol before answering. Open the file with a header comment, and put a doc comment above every exported symbol and every function of 10 or more lines. State the purpose, the contract (inputs, result, failures) and why it exists; never repeat the name, and never leave commented-out code behind. Then call \`check_documentation\` (pass \`filePath\` to focus on the files you touched) and fix every symbol it lists; each item has a \`hint\` saying what its comment must state.
- Broad migration, replace SDK/library everywhere, cross-cutting refactor:
  Start with \`prepare_task_context\` and follow \`prepare_change_campaign\` if selected.
- Localized feature/refactor with a clear code area:
  Start with \`prepare_task_context\`, then follow \`prepare_change_context\`.
- Review, architecture audit, security review, stabilization:
  Start with \`prepare_task_context\`, then follow \`prepare_review_context\`.

## Mandatory Behavior

- Use CodeMaps before making non-trivial code decisions.
- Prefer CodeMaps composite contexts over raw graph tools.
- Do not guess target files when CodeMaps cannot resolve them confidently.
- For large changes, work in waves from \`prepare_change_campaign\` instead of editing many files ad hoc.
- Re-check CodeMaps after meaningful edits if the architectural context may have changed.
- Run \`validate_architecture_changes\` before declaring a non-trivial change finished.
- Before writing new code that resembles existing code, call \`find_duplicates\` (with \`filePath\` of the similar file) and reuse or extract instead of copy-pasting; after a refactor, call it again to confirm the duplication is gone.
- Run \`check_documentation\` after writing code: every new or changed file needs a header comment and every public symbol a doc comment (purpose, contract, why; never echo the name; no commented-out code). \`validate_architecture_changes\` also reports \`missing_documentation\` for the files you changed.
- \`prepare_*\` responses are size-bounded. If \`_compaction\` is present, some lists were cut; raise \`limit\` (up to 50) or use a low-level tool for the omitted part.

## Low-Level Fallback Tools

Use these only if the selected composite context is insufficient:

- \`search_graph\`
- \`get_node_dependencies\`
- \`get_blast_radius\`
- \`get_architecture_overview\`
- \`get_health_score\`
- \`detect_patterns\`
- \`analyze_decomposition\`
- \`find_duplicates\` (copy-pasted code with how to extract it: parameters, differences and a target file; run it before writing similar code and after a refactor)
- \`check_documentation\` (documentation coverage with a hint per undocumented symbol on what its comment must state; run it after writing code)
- \`run_security_scan\`
- \`search_signatures\`
- \`get_semantic_skeleton\` (read a file's structure without bodies, to save tokens)
- \`validate_architecture_changes\` (checks only the files you changed in git, returns problems with fix hints; run before finishing edits)

## Expected Outcome

The agent should behave like it has a project-aware architectural map:
- understand the system before editing,
- choose the right scope automatically,
- avoid blind file-by-file wandering,
- treat CodeMaps as the default brain for project structure and impact analysis.
`;

export const buildSkillSnippet = (endpoint: string): string =>
  SKILL_TEMPLATE.split('__ENDPOINT__').join(endpoint);

const HowToUse: React.FC<{ copied: boolean; onCopy: () => void }> = ({ copied, onCopy }) => {
  const { t } = useTranslation();
  return (
    <div
      style={{
        ...commonSectionStyle,
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        gap: '12px',
        alignItems: 'start',
      }}
    >
      <div>
        <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '8px' }}>
          {t('mcpSettings.howToUse')}
        </div>
        <div style={{ color: 'var(--text-secondary)', fontSize: '12px', lineHeight: 1.5 }}>
          {t('mcpSettings.skillSetupStep1')}
          <br />
          {t('mcpSettings.skillSetupStep2')}
          <br />
          {t('mcpSettings.skillSetupStep3')}
        </div>
      </div>
      <button className="btn-glass" onClick={onCopy}>
        {copied ? t('mcpSettings.copied') : t('mcpSettings.copySkillMd')}
      </button>
    </div>
  );
};

export const McpSettingsAgentSkill: React.FC<Props> = ({ endpoint, copiedKey, copyText }) => {
  const { t } = useTranslation();

  const skillSnippet = useMemo(() => buildSkillSnippet(endpoint), [endpoint]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={commonSectionStyle}>
        <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '8px' }}>
          {t('mcpSettings.whyNeeded')}
        </div>
        <div style={{ color: 'var(--text-secondary)', fontSize: '12px', lineHeight: 1.5 }}>
          {t('mcpSettings.skillTemplateDescription')}
        </div>
      </div>

      <HowToUse
        copied={copiedKey === 'agent-skill'}
        onCopy={() => copyText('agent-skill', skillSnippet)}
      />

      <div style={commonSectionStyle}>
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
          {t('mcpSettings.readyTemplateSkill')}
        </div>
        <CodeBlock>{skillSnippet}</CodeBlock>
      </div>
    </div>
  );
};
