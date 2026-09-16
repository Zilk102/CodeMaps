import React from 'react';
import { useTranslation } from 'react-i18next';
import { commonSectionStyle, CodeBlock } from './shared';

interface Props {
  skillSnippet: string;
  copiedKey: string | null;
  copyText: (key: string, text: string) => void;
}

export const McpSettingsAgentSkill: React.FC<Props> = ({ skillSnippet, copiedKey, copyText }) => {
  const { t } = useTranslation();

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
