import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import hookScript from '../../../scripts/codemaps-validate-hook.mjs?raw';
import { commonSectionStyle, CodeBlock } from './shared';
import { buildClientExamples, type ClientExample } from './clientExamples';

interface Props {
  endpoint: string;
  copiedKey: string | null;
  copyText: (key: string, text: string) => void;
}

const ClientCard: React.FC<{
  client: ClientExample;
  copied: boolean;
  onCopy: () => void;
}> = ({ client, copied, onCopy }) => {
  const { t } = useTranslation();
  return (
    <div style={commonSectionStyle}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'start',
          gap: '12px',
        }}
      >
        <div>
          <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
            {t(`mcpSettings.${client.titleKey}`)}
          </div>
          <div
            style={{
              marginTop: '6px',
              color: 'var(--text-secondary)',
              fontSize: '12px',
              lineHeight: 1.45,
            }}
          >
            {t(`mcpSettings.${client.descriptionKey}`)}
          </div>
        </div>
        <button className="btn-glass" onClick={onCopy}>
          {copied ? t('mcpSettings.copied') : t('mcpSettings.copy')}
        </button>
      </div>
      <div style={{ marginTop: '10px' }}>
        <CodeBlock>{client.snippet}</CodeBlock>
      </div>
    </div>
  );
};

export const McpSettingsClients: React.FC<Props> = ({ endpoint, copiedKey, copyText }) => {
  const clientExamples = useMemo(() => buildClientExamples(endpoint, hookScript), [endpoint]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {clientExamples.map((client) => (
        <ClientCard
          key={client.id}
          client={client}
          copied={copiedKey === client.id}
          onCopy={() => copyText(client.id, client.snippet)}
        />
      ))}
    </div>
  );
};
