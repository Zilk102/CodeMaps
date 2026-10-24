import React from 'react';
import { useTranslation } from 'react-i18next';
import { McpStatusToolDescriptor } from './types';
import { CardDescription, CardTitle, commonSectionStyle } from './shared';

interface Props {
  toolDetails: McpStatusToolDescriptor[];
}

const ToolCard: React.FC<{ tool: McpStatusToolDescriptor }> = ({ tool }) => {
  const { t } = useTranslation();
  return (
    <div style={commonSectionStyle}>
      <CardTitle
        title={t(`mcpSettings.tools.${tool.name}.title`, { defaultValue: tool.title })}
        badge={tool.preferredForAgents && t('mcpSettings.recommendedForAgent')}
        id={tool.name}
      />
      <CardDescription>
        {t(`mcpSettings.tools.${tool.name}.description`, { defaultValue: tool.description })}
      </CardDescription>
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

const TOOL_GRID: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '12px',
};

export const McpSettingsTools: React.FC<Props> = ({ toolDetails }) => (
  <div style={TOOL_GRID}>
    {toolDetails.map((tool) => (
      <ToolCard key={tool.name} tool={tool} />
    ))}
  </div>
);
