import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { commonSectionStyle, CodeBlock } from './shared';

interface Props {
  endpoint: string;
  copiedKey: string | null;
  copyText: (key: string, text: string) => void;
}

export const McpSettingsClients: React.FC<Props> = ({ endpoint, copiedKey, copyText }) => {
  const { t } = useTranslation();

  const clientExamples = useMemo(
    () => [
      {
        id: 'trae',
        title: t('mcpSettings.trae'),
        description: t('mcpSettings.traeDescription'),
        snippet: `{\n  "mcpServers": {\n    "codemaps": {\n      "url": "${endpoint}"\n    }\n  }\n}`,
      },
      {
        id: 'cursor',
        title: t('mcpSettings.cursor'),
        description: t('mcpSettings.cursorDescription'),
        snippet: `{\n  "mcpServers": {\n    "codemaps": {\n      "transport": "streamable-http",\n      "url": "${endpoint}"\n    }\n  }\n}`,
      },
      {
        id: 'claude-code',
        title: t('mcpSettings.claudeCode'),
        description: t('mcpSettings.claudeCodeDescription'),
        snippet: `claude mcp add codemaps ${endpoint} --transport http`,
      },
    ],
    [endpoint, t]
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {clientExamples.map((client) => (
        <div key={client.id} style={commonSectionStyle}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'start',
              gap: '12px',
            }}
          >
            <div>
              <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{client.title}</div>
              <div
                style={{
                  marginTop: '6px',
                  color: 'var(--text-secondary)',
                  fontSize: '12px',
                  lineHeight: 1.45,
                }}
              >
                {client.description}
              </div>
            </div>
            <button className="btn-glass" onClick={() => copyText(client.id, client.snippet)}>
              {copiedKey === client.id ? t('mcpSettings.copied') : t('mcpSettings.copy')}
            </button>
          </div>
          <div style={{ marginTop: '10px' }}>
            <CodeBlock>{client.snippet}</CodeBlock>
          </div>
        </div>
      ))}
    </div>
  );
};
