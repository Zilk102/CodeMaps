import React from 'react';
import { useTranslation } from 'react-i18next';
import { commonSectionStyle, CodeBlock } from './shared';

interface ClientExample {
  id: string;
  title: string;
  description: string;
  snippet: string;
}

interface Props {
  clientExamples: ClientExample[];
  copiedKey: string | null;
  copyText: (key: string, text: string) => void;
}

export const McpSettingsClients: React.FC<Props> = ({ clientExamples, copiedKey, copyText }) => {
  const { t } = useTranslation();

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
