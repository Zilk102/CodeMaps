import React from 'react';
import { useTranslation } from 'react-i18next';
import { McpStatusToolDescriptor } from './types';
import { commonSectionStyle } from './shared';

interface Props {
  toolDetails: McpStatusToolDescriptor[];
}

const ToolCardHeader: React.FC<{ tool: McpStatusToolDescriptor }> = ({ tool }) => {
  const { t } = useTranslation();
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: '10px',
        alignItems: 'start',
      }}
    >
      <div>
        <div
          style={{
            fontWeight: 700,
            color: 'var(--text-primary)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            flexWrap: 'wrap',
          }}
        >
          <span>{t(`mcpSettings.tools.${tool.name}.title`, { defaultValue: tool.title })}</span>
          {tool.preferredForAgents && (
            <span
              style={{
                fontSize: '10px',
                padding: '2px 8px',
                borderRadius: '999px',
                background: 'var(--accbg)',
                border: '1px solid var(--acc)',
                color: 'var(--acc)',
              }}
            >
              {t('mcpSettings.recommendedForAgent')}
            </span>
          )}
        </div>
        <div style={{ fontSize: '11px', color: 'var(--acc)', marginTop: '2px' }}>{tool.name}</div>
      </div>
    </div>
  );
};

const ToolCard: React.FC<{ tool: McpStatusToolDescriptor }> = ({ tool }) => {
  const { t } = useTranslation();
  return (
    <div style={commonSectionStyle}>
      <ToolCardHeader tool={tool} />
      <div
        style={{
          marginTop: '8px',
          color: 'var(--text-secondary)',
          fontSize: '12px',
          lineHeight: 1.45,
        }}
      >
        {t(`mcpSettings.tools.${tool.name}.description`, { defaultValue: tool.description })}
      </div>
      {tool.recommendedWhen && (
        <div
          style={{
            marginTop: '8px',
            color: 'var(--text-primary)',
            fontSize: '11px',
            lineHeight: 1.4,
          }}
        >
          {t('mcpSettings.whenToUse')}:{' '}
          {t(`mcpSettings.tools.${tool.name}.recommendedWhen`, {
            defaultValue: tool.recommendedWhen,
          })}
        </div>
      )}
    </div>
  );
};

export const McpSettingsTools: React.FC<Props> = ({ toolDetails }) => (
  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
    {toolDetails.map((tool) => (
      <ToolCard key={tool.name} tool={tool} />
    ))}
  </div>
);
