import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { commonSectionStyle, CodeBlock } from './shared';

interface Props {
  endpoint: string;
  copiedKey: string | null;
  copyText: (key: string, text: string) => void;
}

export const McpSettingsAgentSkill: React.FC<Props> = ({ endpoint, copiedKey, copyText }) => {
  const { t } = useTranslation();

  const skillSnippet = useMemo(
    () => `---
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
- MCP endpoint: \`${endpoint}\`

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

## Low-Level Fallback Tools

Use these only if the selected composite context is insufficient:

- \`search_graph\`
- \`get_node_dependencies\`
- \`get_blast_radius\`
- \`get_architecture_overview\`
- \`get_health_score\`
- \`detect_patterns\`
- \`run_security_scan\`
- \`search_signatures\`

## Expected Outcome

The agent should behave like it has a project-aware architectural map:
- understand the system before editing,
- choose the right scope automatically,
- avoid blind file-by-file wandering,
- treat CodeMaps as the default brain for project structure and impact analysis.
`,
    [endpoint]
  );

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
        <button className="btn-glass" onClick={() => copyText('agent-skill', skillSnippet)}>
          {copiedKey === 'agent-skill' ? t('mcpSettings.copied') : t('mcpSettings.copySkillMd')}
        </button>
      </div>

      <div style={commonSectionStyle}>
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
          {t('mcpSettings.readyTemplateSkill')}
        </div>
        <CodeBlock>{skillSnippet}</CodeBlock>
      </div>
    </div>
  );
};
